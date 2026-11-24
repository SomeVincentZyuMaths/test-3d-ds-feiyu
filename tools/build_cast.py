"""Build editable .blend scenes and browser-ready GLBs with Blender 5.2."""
import bpy
import math
import sys
from collections import defaultdict
from pathlib import Path
from mathutils import Vector

PI, TAU = math.pi, math.tau
ROOT = Path(__file__).resolve().parents[1]
PALETTES = {
    'deepseek': ('3956a6','24345c','6696b2','293960','f3ebf4','6caac7','3d5c9f','aacdef'),
    'gpt': ('ede6f5','a49ac7','f7effb','aba1c7','f8edf3','bca2d7','8062af','e3c4f7'),
    'gemini': ('7770ca','443d89','c18be7','443a68','ede5fd','bd94f2','ac5287','ffcf87'),
    'claude': ('c87043','893f30','f0aa68','875138','f9ead3','d79b51','9f5d3e','fac586'),
}


def clamp(x):
    return max(0, min(1, x))


def mix(a,b,t):
    return a+(b-a)*t


def rgb(code):
    srgb=[int(code[k:k+2],16)/255 for k in (0,2,4)]
    return tuple(v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4 for v in srgb)+(1,)


def blend(a,b,t):
    return tuple(mix(x,y,clamp(t)) for x,y in zip(a,b))


def axes(p):
    return (p[0],-p[2],p[1])


def spline(points,t):
    k=clamp(t)*(len(points)-1); i=min(int(k),len(points)-2); f=k-i
    a,b,c,d=(points[min(len(points)-1,max(0,n))] for n in (i-1,i,i+1,i+2))
    return tuple(q+.5*f*(r-p+f*(2*p-5*q+4*r-s+f*(3*(q-r)+s-p))) for p,q,r,s in zip(a,b,c,d))


class Studio:
    def __init__(self,name):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.name=name; self.scene=bpy.context.scene; self.scene.render.fps=24; self.scene.frame_end=144
        self.root=self.group(name.title(),None)
        self.mats={}; self.tracks=defaultdict(list)
        self.hair,self.shadow,self.tip,self.dress,self.trim,self.accent,self.iris,self.light_iris=map(rgb,PALETTES[name])
        self.skin=rgb({'gpt':'fae4ea','deepseek':'ffdfd3'}.get(name,'ffddd2'))
        self.ink=rgb('372937'); self.gold=rgb('deb77b' if name in ('claude','deepseek') else 'e3ccef')

    def group(self,name,p,at=(0,0,0)):
        o=bpy.data.objects.new(name,None); self.scene.collection.objects.link(o); o.parent=p
        o.location=axes(at); o.empty_display_size=.09
        return o

    def mat(self,c,paint=False,graphic=False):
        key=(c,paint,graphic)
        if key in self.mats: return self.mats[key]
        m=bpy.data.materials.new('Vertex palette' if paint else 'Swatch %02d'%len(self.mats)); m.diffuse_color=c
        m.use_nodes=True; ns=m.node_tree.nodes; ls=m.node_tree.links; bs=ns.get('Principled BSDF')
        bs.inputs['Base Color'].default_value=c; bs.inputs['Roughness'].default_value=.73
        bs.inputs['Specular IOR Level'].default_value=.19
        m.use_backface_culling=False
        if paint:
            n=ns.new('ShaderNodeVertexColor'); n.layer_name='Tint'; ls.new(n.outputs['Color'],bs.inputs['Base Color'])
            if graphic:
                ls.new(n.outputs['Color'],bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value=.27
        if graphic and not paint:
            bs.inputs['Emission Color'].default_value=c; bs.inputs['Emission Strength'].default_value=.12
        self.mats[key]=m
        return m

    def mesh(self,name,p,vs,fs,c,colors=None,graphic=False):
        m=bpy.data.meshes.new(name); m.from_pydata([axes(v) for v in vs],[],fs); m.update()
        for f in m.polygons: f.use_smooth=True
        if colors:
            attrib=m.color_attributes.new(name='Tint',type='BYTE_COLOR',domain='POINT')
            attrib.data.foreach_set('color',[a for value in colors for a in value])
        o=bpy.data.objects.new(name,m); self.scene.collection.objects.link(o); o.parent=p
        m.materials.append(self.mat(rgb('ffffff') if colors else c,bool(colors),graphic))
        return o

    def grid(self,name,p,nu,nv,fn,c,paint=None,graphic=False):
        vs=[]; ca=[]; fs=[]
        for j in range(nv+1):
            for i in range(nu+1):
                u=i/nu; v=j/nv; pos=fn(u,v); vs.append(pos)
                if paint: ca.append(paint(u,v,pos))
                if i and j:
                    n=j*(nu+1)+i; fs.append((n-nu-2,n-nu-1,n,n-1))
        return self.mesh(name,p,vs,fs,c,ca or None,graphic)

    def oval(self,name,p,at,r,c,roll=0,detail=16):
        def f(u,v):
            a=u*TAU; b=(.001+.998*v)*PI-PI/2; x=r[0]*math.sin(a)*math.cos(b); y=r[1]*math.sin(b)
            return (at[0]+math.cos(roll)*x-math.sin(roll)*y,at[1]+math.sin(roll)*x+math.cos(roll)*y,at[2]+r[2]*math.cos(a)*math.cos(b))
        return self.grid(name,p,detail,max(8,detail//2),f,c)

    def sweep(self,name,p,pts,w,d,c,paint=None,steps=24,sides=12):
        def fn(u,t):
            center=Vector(spline(pts,t)); ab=Vector(spline(pts,t+.002))-Vector(spline(pts,t-.002))
            side=Vector((ab.y,-ab.x,0))
            if side.length<.0001: side=Vector((1,0,0))
            side.normalize(); normal=side.cross(ab).normalized(); a=u*TAU
            return tuple(center+side*((w(t) if callable(w) else w)*math.cos(a))+normal*((d(t) if callable(d) else d)*math.sin(a)))
        return self.grid(name,p,sides,steps,fn,c,paint)

    def ribbon(self,name,p,pts,width,c):
        def w(t): return width*(.03+.97*math.sin(PI*t)**.72)
        return self.sweep(name,p,pts,w,lambda t:w(t)*.26,c,steps=16,sides=9)

    def garment(self,name,p,rows,c,fold=0,lo=-PI,hi=PI,front=0,paint=None):
        def f(u,v):
            y,x,z,am,ruff=spline(rows,v); a=mix(lo,hi,u)
            k=math.cos(fold*a) if fold else 0; q=math.sin(fold*a) if fold else 0
            return (math.sin(a)*x*(1+am*k),y+ruff*q,math.cos(a)*z*(1+am*k)+front)
        return self.grid(name,p,72 if fold else 36,3*(len(rows)-1)+3,f,c,paint)

    def bow(self,p,x,y,z,s,c):
        for q in (-1,1):
            self.ribbon('Bow loop',p,[(x+q*s*a,y+s*b,z+s*d) for a,b,d in ((0,0,0),(.22,.09,.075),(.43,.126,.031),(.53,.055,0))],.14*s,c)
            self.ribbon('Ribbon tie',p,[(x,y,z),(x+q*.14*s,y-.14*s,z+.035),(x+q*.27*s,y-.32*s,z+.02)],.095*s,c)
        self.oval('Ribbon knot',p,(x,y,z+.023),(.083*s,.102*s,.049*s),c)

    def gem(self,name,p,x,y,z,r,c):
        vs=[(x+r*(1 if k%2==0 else .36)*math.sin(k*PI/4),y+r*(1 if k%2==0 else .36)*math.cos(k*PI/4),z) for k in range(8)]
        self.mesh(name,p,vs+[(x,y,z+.24*r),(x,y,z-.10*r)],[(i,(i+1)%8,8) for i in range(8)]+[((i+1)%8,i,9) for i in range(8)],c)

    def accents(self,h):
        if self.name=='deepseek':
            def crown(u,v):
                a=mix(-1.47,1.47,u); r=.725+v*(.153+.024*math.cos(u*TAU*11))
                return (math.sin(a)*r,.032+math.cos(a)*r,.082+.158*v+.051*math.cos(u*TAU*11)*v)
            self.grid('Maid crown ruffles',h,104,12,crown,self.trim)
            self.sweep('Crown piping',h,[(math.sin(i*.16)*.729,.034+math.cos(i*.16)*.729,.121) for i in range(-9,10)],.021,.022,self.dress,steps=65,sides=8)
            self.sweep('Ahoge',h,[(-.12,.729,-.012),(-.240,.953,.012),(-.426,.922,.04),(-.511,.802,.095)],lambda t:.032*(1-t*.95),lambda t:.052*(1-t*.96),self.hair)
        elif self.name=='gpt':
            for q in (-1,1):
                self.sweep('Ivory segmented dragon horn',h,[(q*.467,.503,-.066),(q*.622,.696,-.12),(q*.658,.865,-.17),(q*.58,1.029,-.15)],lambda t:.155*(1-t*.986)*(1+.085*math.cos(t*TAU*9)),lambda t:.139*(1-t*.975),self.trim,lambda u,t,p:blend(self.trim,self.shadow,.29*(.5+.5*math.cos(t*TAU*9))),31,13)
                self.sweep('Short dragon ear',h,[(q*.568,-.107,.028),(q*.751,-.097,-.018),(q*.902,-.037,-.12)],lambda t:.131*(1-t*.984),lambda t:.064*(1-t*.984),self.skin)
                self.gem('Moonstone earring',h,q*.741,-.24,.027,.084,self.accent)
        elif self.name=='gemini':
            for q in (-1,1):
                for layer,c in enumerate((self.hair,rgb('f3b1d1'))):
                    self.sweep('Pink ear inset' if layer else 'Cat ear',h,[(q*.492,.447+.053*layer,-.067+.122*layer),(q*.536,.699+.015*layer,-.019+.085*layer),(q*.592,.982-.078*layer,.084)],lambda t,l=layer:(.223-.074*l)*(1-t)**.73,lambda t,l=layer:(.094-.048*l)*(1-t)**.64,c,steps=23,sides=13)
            self.gem('Gold star clip',h,-.618,.265,.426,.168,self.gold)
            self.gem('Lilac star inset',h,-.618,.265,.465,.112,self.accent)
            self.gem('Star pendant',h,-.744,-.232,.249,.071,self.gold)
        else:
            self.flower(h,.603,.261,.315,.175)
            self.bow(h,.646,.103,.209,.61,rgb('3e2d35'))
            self.gem('Amber earring',h,.693,-.244,.186,.062,self.gold)

    def flower(self,p,x,y,z,r):
        for j in range(13):
            a=j*TAU/13; c=blend(rgb('e49743'),rgb('ffcf74'),(j%3)*.17+.34)
            self.oval('Sunflower petal',p,(x+math.sin(a)*r*.75,y+math.cos(a)*r*.75,z),(.25*r,.49*r,.22*r),c,roll=-a,detail=12)
        self.oval('Sunflower seed head',p,(x,y,z+.032),(.52*r,.52*r,.29*r),rgb('784a35'),detail=15)
        for k in range(8):
            a=k*TAU/8; self.oval('Sunflower seed',p,(x+math.cos(a)*r*.34,y+math.sin(a)*r*.34,z+.068),(.010,.010,.008),self.gold,detail=9)

    def cuboid(self,name,p,at,r,c):
        x,y,z=at; a,b,d=r
        v=[(x+i*a,y+j*b,z+k*d) for i,j,k in ((-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1))]
        o=self.mesh(name,p,v,[(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4),(2,3,7,6)],c)
        for f in o.data.polygons: f.use_smooth=False
        return o

    def book(self,p):
        b=self.group('Sunflower folio',p,(.019,1.938,.433)); b.rotation_euler=(.085,.03,-.17)
        self.cuboid('Bound pages',b,(0,0,0),(.241,.276,.045),self.trim)
        for z in (-.054,.051): self.cuboid('Chestnut leather covers',b,(0,0,z),(.252,.288,.013),rgb('613934'))
        self.cuboid('Folio spine',b,(-.244,0,0),(.025,.291,.066),rgb('4b3033'))
        self.flower(b,.012,.015,.070,.090)
        for x in (-.212,.212):
            for y in (-.238,.238): self.gem('Gilt corner',b,x,y,.068,.035,self.gold)
        page=self.group('Turning page',b,(-.206,.008,.069)); self.page=page
        self.grid('Page of folio',page,16,6,lambda u,v:(.423*u,(v-.5)*.495,.016+.056*math.sin(PI*u)),self.trim)
        self.page.scale=(.001,1,.001)

    def creatures(self,p):
        kind=self.name; self.wings=[]
        if kind=='claude': self.tail=None; return
        tail=self.group('Tail pivot',p,(0,1.48,-.333)); self.tail=tail
        def sheen(u,v,xyz):
            f=.5+.5*math.cos(TAU*u); return blend(blend(self.shadow,self.hair,.34+.61*f),self.tip,.47*v*f)
        if kind=='deepseek':
            pts=[(0,0,0),(-.48,-.35,-.42),(-1.14,-.67,-.32),(-1.62,-.49,-.05),(-1.75,-.13,.069),(-1.68,.20,.085)]
            self.sweep('Large curved whale tail',tail,pts,lambda t:.168+.195*math.sin(PI*t**.68)**1.13,lambda t:.105+.101*math.sin(PI*t)**.85,self.hair,sheen,53,24)
            pivot=self.group('Whale flukes',tail,pts[-1]); self.flukes=pivot
            for q in (-1,1):
                self.sweep('Paired whale fluke',pivot,[(0,-.08,0),(q*.23,.097,.028),(q*.49,.208,.025),(q*.69,.322,-.031),(q*.735,.375,-.060)],lambda t:.059+.184*math.sin(PI*t**.68)**.88*(1-t**7),lambda t:.085*(1-t**.83)+.001,self.hair,sheen,34,22)
        elif kind=='gpt':
            pts=[(0,0,0),(.55,-.32,-.39),(1.10,-.60,-.47),(1.53,-.49,-.25),(1.65,-.18,-.04),(1.53,.18,.025)]
            self.sweep('Dragon tail',tail,pts,lambda t:.233*(1-t)**.54,lambda t:.170*(1-t)**.49,self.trim,lambda u,v,p:blend(self.trim,self.accent,.12+.13*math.sin(u*TAU*9+math.sin(v*TAU*21))),50,22)
            for i in range(13):
                t=i/14; x,y,z=spline(pts,t)
                self.gem('Silver dragon scales',tail,x,y+.15*(1-t)**.54,z+.111*(1-t)**.6,.082*(1-t)**.50,self.accent)
            for q in (-1,1):
                h=self.group('Dragon wing',p,(q*.277,2.292,-.161)); self.wings.append(h)
                base=[(0,0,-.015),(.30,.25,-.26),(.63,.52,-.392),(.98,.43,-.57),(1.15,.21,-.675)]
                skirt=[(.023,-.075,-.043),(.302,-.563,-.255),(.57,-.433,-.54),(.772,-.454,-.71),(1.15,.21,-.675)]
                self.grid('Folded dragon membrane',h,44,17,lambda u,v:(q*mix(spline(base,u)[0],spline(skirt,u)[0],v),mix(spline(base,u)[1],spline(skirt,u)[1],v)+.054*math.sin(PI*v)*math.sin(u*TAU*4),mix(spline(base,u)[2],spline(skirt,u)[2],v)),self.trim,lambda u,v,p:blend(self.trim,self.accent,.13+.19*v))
                self.sweep('Wing leading edge',h,[(q*x,y,z) for x,y,z in base],lambda t:.048*(1-t*.90),lambda t:.054*(1-t*.90),self.trim,steps=32)
                for f in (.27,.50,.72):
                    a=spline(base,f); b=spline(skirt,min(1,f+.059)); self.sweep('Wing support',h,[(q*a[0],a[1],a[2]-.008),(q*mix(a[0],b[0],.54),mix(a[1],b[1],.54),mix(a[2],b[2],.54)),(q*b[0],b[1],b[2])],lambda t:.027*(1-t*.89),lambda t:.026*(1-t*.90),self.trim,steps=13,sides=8)
        else:
            pts=[(0,0,0),(.55,-.43,-.24),(.96,-.48,-.29),(1.27,-.14,-.23),(1.27,.26,-.02),(1.07,.46,.127),(.90,.39,.188)]
            self.sweep('Fluffy curled cat tail',tail,pts,lambda t:(.12+.19*math.sin(PI*t**.73)**1.4)*(1-t**8*.99),lambda t:(.092+.144*math.sin(PI*t)**1.17)*(1-t**7*.96),self.hair,lambda u,v,p:blend(sheen(u,v,p),self.tip,.68*v**1.4),54,24)
            for i in range(6):
                a=spline(pts,.60+i*.043); self.ribbon('Tail tuft',tail,[a,(a[0]+.18,a[1]-.017,a[2]+.036),(a[0]+.26,a[1]+.10,a[2]+.034)],.071,self.tip)

    def animate(self):
        keys={'deepseek':['idle','turn_smile','peace'],'gpt':['idle','contemplate'],'gemini':['idle','wink'],'claude':['idle','page_turn']}[self.name]
        nodes=[self.bob,self.head_node,self.mouth,*self.eyes,*self.closed_lids,*self.arms,*self.forearms,*self.hands,*sum(self.fingers,[]),*self.wings]
        if self.tail: nodes.append(self.tail)
        if self.name=='deepseek': nodes.append(self.flukes)
        if self.name=='claude': nodes.append(self.page)
        neutral={obj:(obj.location.copy(),obj.rotation_euler.copy(),obj.scale.copy()) for obj in nodes}
        for clip in keys:
            for frame in (1,7,13,19,25,30,33,35,36,39,43,47,55,64,73,85,97):
                t=(frame-1)/96; w=math.sin(TAU*t); special=clip!='idle'; arc=math.sin(PI*t)**.85
                for obj,(loc,rot,scale) in neutral.items(): obj.location=loc; obj.rotation_euler=rot; obj.scale=scale
                self.bob.location.z=.021*w
                blink=1-.93*math.exp(-((t-.35)/.042)**2)
                for fingers in self.fingers:
                    for i,f in enumerate(fingers): f.rotation_euler.x=.24+.019*math.sin(TAU*t+i*.49)
                if self.tail: self.tail.rotation_euler=axes((.018*w,.073*w,.057*math.sin(TAU*t-.48)))
                if self.name=='deepseek':
                    self.flukes.rotation_euler=axes((.11*w,.05*w,.081*w))
                elif self.name=='gpt':
                    for q,wing in zip((-1,1),self.wings): wing.rotation_euler=axes((.032*w,q*(.043*w+(arc*.59 if special else 0)),q*.037*w))
                elif self.name=='gemini' and special:
                    self.tail.rotation_euler=axes((.17*w,.27*math.sin(TAU*t*2),.31*w))
                elif self.name=='claude' and special:
                    self.page.scale=(max(.001,math.sin(PI*t)),1,max(.001,math.sin(PI*t))); self.page.rotation_euler.z=1.26*(2*t-1)
                self.pose(clip,w,blink,arc)
                self.mouth.scale.z+=.012*w
                for obj in nodes:
                    for prop in ('location','rotation_euler','scale'): obj.keyframe_insert(data_path=prop,frame=frame,group=clip)
            for obj in nodes:
                ad=obj.animation_data; action=ad.action; action.name=clip+' / '+obj.name
                track=ad.nla_tracks.new(); track.name=clip; track.strips.new(action.name,1,action)
                ad.action=None; track.mute=True
        for obj,values in neutral.items(): obj.location,obj.rotation_euler,obj.scale=values
        for obj in nodes: obj.animation_data.nla_tracks[0].mute=False
        self.scene.frame_set(1)

    def export(self):
        self.bob=self.group('Body rig',self.root)
        self.clothes(self.bob); self.creatures(self.bob); self.head(self.bob); self.animate()
        self.scene['Cast member']=self.name
        self.scene['Author notes']='Original model built from editable curves/surfaces. Motions are named NLA tracks. Front is toward -Y in Blender.'
        self.scene['Face style']='Cheek tint and iris bands are editable vertex colors; teeth, lashes, mouth and brows are separate meshes.'
        self.scene.world=bpy.data.worlds.new('Studio grey'); self.scene.world.color=(.23,.23,.23)
        # Set an immediately useful material-preview framing in the editable file.
        from mathutils import Quaternion
        for screen in bpy.data.screens:
            for area in screen.areas:
                if area.type=='VIEW_3D':
                    sp=area.spaces.active; sp.shading.color_type='MATERIAL'
                    sp.region_3d.view_location=(0,0,2); sp.region_3d.view_rotation=Quaternion((1,0,0),PI/2); sp.region_3d.view_distance=6.0
        editable=ROOT/'models'; assets=ROOT/'public'/'cast'
        editable.mkdir(exist_ok=True); assets.mkdir(parents=True,exist_ok=True)
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.wm.save_as_mainfile(filepath=str(editable/(self.name+'.blend')))
        # Merge static parts per pivot and material for fewer browser draw calls; the .blend stays editable.
        batches=defaultdict(list)
        for obj in list(self.scene.objects):
            if obj.type=='MESH': batches[(obj.parent,obj.data.materials[0])].append(obj)
        bpy.ops.object.select_all(action='DESELECT')
        for batch in batches.values():
            if len(batch)<2: continue
            for obj in batch: obj.select_set(True)
            bpy.context.view_layer.objects.active=batch[0]; bpy.ops.object.join(); batch[0].select_set(False)
        for obj in self.scene.objects:
            if obj.animation_data:
                for track in obj.animation_data.nla_tracks: track.mute=False
        bpy.ops.export_scene.gltf(filepath=str(assets/(self.name+'.glb')),export_format='GLB',export_animation_mode='NLA_TRACKS',export_optimize_animation_size=False,export_frame_range=False,export_cameras=False,export_lights=False)


if __name__=='__main__':
    sys.path.insert(0,str(Path(__file__).resolve().parent))
    sys.modules['build_cast']=sys.modules[__name__]
    from human_study import HumanStudy

    class CastStudio(HumanStudy,Studio):
        pass

    requested=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else list(PALETTES)
    for character in requested:
        if character not in PALETTES: raise SystemExit('Unknown cast member: '+character)
        CastStudio(character).export()
