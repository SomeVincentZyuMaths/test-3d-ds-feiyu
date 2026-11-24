"""Reproducible structural derivatives of Nike's CC BY-NC-SA 4.0 model.

Blender 5.2.3 + VRM Add-on 4.10.2. The source .blend and original VRM are
never overwritten. Display coordinates below are x/right, y/up, z/front.
"""
import bpy
import addon_utils
import bmesh
import os
import hashlib
import json
import math
import sys
from pathlib import Path
import numpy as np
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
ADDONS = Path(os.environ.get('VRM_ADDON_DIR', 'D:/cache/blender/vrm-addon-4.10.2'))
sys.path.insert(0, str(ADDONS))
addon = addon_utils.enable('VRM_Addon_for_Blender-release', default_set=True, persistent=True)
SOURCE = ROOT / 'models/nike-source/DeepSeek-chan.blend'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == 'b9326bcc62988be97a22d3ef73c8401121dfbd321a5bfca95a84238d3052602a', 'Source version differs from the reviewed base model'
TAU = math.tau
rig = None
kind = None
new_bones = {}
audit = {}


def v(p):
    return Vector((p[0], -0.26 - p[2], p[1]))


def rgb(s):
    c = tuple(int(s[i:i+2], 16) / 255 for i in (0, 2, 4))
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055)**2.4 for x in c)


def material(name, color, shade=.72, outline=.00055):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb(color), 1)
    mat.use_nodes = True
    gltf = mat.vrm_addon_extension.mtoon1
    gltf.enabled = True
    gltf.double_sided = True
    gltf.pbr_metallic_roughness.base_color_factor = (*rgb(color), 1)
    mt = gltf.extensions.vrmc_materials_mtoon
    mt.shade_color_factor = tuple(x * shade for x in rgb(color))
    mt.shading_toony_factor = .6
    mt.shading_shift_factor = -.08
    mt.outline_width_mode = 'worldCoordinates'
    mt.outline_width_factor = outline
    mt.outline_color_factor = rgb('443c52')
    return mat


def mesh(name, points, faces, mat, weights='hips', uv=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata([v(p) for p in points], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = rig
    obj.matrix_world = Matrix.Identity(4)
    data.materials.append(mat)
    for face in data.polygons:
        face.use_smooth = True
    if uv:
        layer = data.uv_layers.new(name='UVMap')
        for face in data.polygons:
            for loop in face.loop_indices:
                layer.data[loop].uv = uv[data.loops[loop].vertex_index]
    groups = {}
    for i, point in enumerate(points):
        pair = {weights: 1} if isinstance(weights, str) else weights(point, i)
        for bone, weight in pair.items():
            if weight <= 0: continue
            if bone not in groups:
                groups[bone] = obj.vertex_groups.new(name=bone)
            groups[bone].add([i], weight, 'REPLACE')
    mod = obj.modifiers.new('Avatar skin', 'ARMATURE')
    mod.object = rig
    return obj


def surface(name, nu, nv, function, mat, bone='hips', reverse=False):
    points = [function(i / nu, j / nv) for j in range(nv+1) for i in range(nu+1)]
    faces = [(j*(nu+1)+i, j*(nu+1)+i+1, (j+1)*(nu+1)+i+1, (j+1)*(nu+1)+i) for j in range(nv) for i in range(nu)]
    if reverse: faces = [tuple(reversed(face)) for face in faces]
    uv = [(i/nu,j/nv) for j in range(nv+1) for i in range(nu+1)]
    return mesh(name, points, faces, mat, bone, uv)


def spline(points, t):
    f = max(0,min(1,t)) * (len(points)-1)
    i = min(int(f), len(points)-2)
    f -= i
    a,b,c,d = [Vector(points[max(0,min(len(points)-1,j))]) for j in (i-1,i,i+1,i+2)]
    return b + .5*f*(c-a+f*(2*a-5*b+4*c-d+f*(3*(b-c)+d-a)))


def tube(name, points, radius, mat, bone='hips', radial=12, steps=40, flatten=1):
    def point(u,t):
        p = spline(points,t)
        direction = (spline(points,min(1,t+.003))-spline(points,max(0,t-.003))).normalized()
        axis = Vector((0,0,1))
        if abs(direction.dot(axis)) > .95:axis=Vector((1,0,0))
        a = direction.cross(axis).normalized()
        b = direction.cross(a).normalized()
        r = radius(t) if callable(radius) else radius
        return p + r*(a*math.cos(TAU*u)+b*math.sin(TAU*u)*flatten)
    return surface(name,radial,steps,point,mat,bone)


def ellipse(name, center, axes, mat, bone='head', n=24, m=12):
    def pt(u,t):
        a,b=TAU*u,math.pi*t
        return (center[0]+axes[0]*math.sin(b)*math.cos(a),center[1]+axes[1]*math.cos(b),center[2]+axes[2]*math.sin(b)*math.sin(a))
    return surface(name,n,m,pt,mat,bone)


def ring(name, y, rx, rz, mat, bone='hips', z=0, thickness=.004):
    points=[(rx*math.sin(TAU*i/64),y,z+rz*math.cos(TAU*i/64)) for i in range(65)]
    return tube(name,points,thickness,mat,bone,radial=8,steps=96)


def star(name, center, size, mat, bone='head', points=4):
    vertices=[center]
    for i in range(points*2):
        a=i*math.pi/points
        r=size if i%2==0 else size*.30
        vertices.append((center[0]+r*math.sin(a),center[1]+r*math.cos(a),center[2]-.006))
    faces=[(0,i+1,(i+1)%(points*2)+1) for i in range(points*2)]
    return mesh(name,vertices,faces,mat,bone)


def bone(name, parent, head, tail):
    bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    b=rig.data.edit_bones.new(name)
    b.head=rig.matrix_world.inverted()@v(head)
    b.tail=rig.matrix_world.inverted()@v(tail)
    b.parent=rig.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    new_bones[name]=(head,tail)
    return name


def spring(names, title, stiffness=.9):
    sp=rig.data.vrm_addon_extension.spring_bone1.springs.add()
    sp.vrm_name=title
    sp.center.bone_name='hips'
    for name in names:
        j=sp.joints.add()
        j.node.bone_name=name
        j.stiffness=stiffness
        j.gravity_power=.02
        j.gravity_dir=(0,0,-1)
        j.drag_force=.65
        j.hit_radius=.01


def components(obj):
    data=obj.data
    parent=list(range(len(data.vertices)))
    def find(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    for edge in data.edges:
        a,b=edge.vertices;parent[find(a)]=find(b)
    groups={}
    for vertex in data.vertices:groups.setdefault(find(vertex.index),[]).append(vertex.index)
    return list(groups.values())


def delete_vertices(obj, ids):
    bm=bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[bm.verts[i] for i in ids],context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def image_recolor(mat, newname, palette, mask=None, size=2048):
    # Recolor a copy, preserving the authored UV layout, shading and alpha.
    ext=mat.vrm_addon_extension.mtoon1
    original=ext.pbr_metallic_roughness.base_color_texture.index.source
    if not original:return
    image=original.copy()
    image.name=newname
    if max(image.size)>size:image.scale(size,size)
    data=np.empty(len(image.pixels),dtype=np.float32)
    image.pixels.foreach_get(data)
    pixels=data.reshape(-1,4)
    col=pixels[:,:3]
    lo,hi=np.min(col,axis=1),np.max(col,axis=1)
    lum=.2126*col[:,0]+.7152*col[:,1]+.0722*col[:,2]
    dark=np.array(rgb(palette[0]));light=np.array(rgb(palette[1]))
    ratio=np.clip(np.sqrt(np.maximum(lum,0)/.50),0,1)
    if kind=='gpt':ratio=.65+.35*ratio
    else:ratio=.15+.85*ratio
    replacement=dark[None,:]*(1-ratio[:,None])+light[None,:]*ratio[:,None]
    if mask=='blue':
        selected=(col[:,2]>col[:,0]*1.13)&(hi-lo>.018)
    elif mask=='iris':
        selected=(hi-lo>.035)&(lum<.8)
    else:selected=np.ones(len(col),dtype=bool)
    pixels[selected,:3]=replacement[selected]
    image.pixels.foreach_set(data)
    image.update()
    image.pack()
    ext.pbr_metallic_roughness.base_color_texture.index.source=image
    ext.extensions.vrmc_materials_mtoon.shade_multiply_texture.index.source=image
    # Remove stale dark-blue shade tint while preserving texture detail.
    ext.extensions.vrmc_materials_mtoon.shade_color_factor=(.70,.67,.77)
    return image


def prepare_source():
    global rig
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    for p in rig.pose.bones:p.rotation_quaternion=(1,0,0,0)
    # Remove the original maid skirt, whale tail and back bows completely.
    removed=[]
    for obj in list(bpy.data.objects):
        if obj.type!='MESH':continue
        if any(x in obj.name for x in ['_skirt','_whale_tail','_ribbon_']):
            removed.append(obj.name);bpy.data.objects.remove(obj,do_unlink=True)
    body=bpy.data.objects['Body']
    keep=set()
    for poly in body.data.polygons:
        name=body.data.materials[poly.material_index].name
        if name in ('Material_skin_unified','Material_lower_body'):keep.update(poly.vertices)
    delete_vertices(body,set(range(len(body.data.vertices)))-keep)
    # Keep facial shape keys; remove detached maid bonnet and side ornament.
    head=bpy.data.objects['Head']
    kill=set()
    eye_ids=set()
    for ids in components(head):
        pts=[head.matrix_world@head.data.vertices[i].co for i in ids]
        top=max(p.z for p in pts);low=min(p.z for p in pts)
        maxx=max(abs(p.x) for p in pts)
        if (len(ids)>150 and low>1.53 and top>1.65) or (len(ids)==175) or (len(ids)==527):
            kill.update(ids)
        if low>1.48 and top<1.53 and maxx<.09 and len(ids)>60:eye_ids.update(ids)
    # Fish ears belong to the face component: trim outside the normal cheek contour.
    for vertex in head.data.vertices:
        p=head.matrix_world@vertex.co
        if abs(p.x)>.126 and p.z<1.585:kill.add(vertex.index)
    eye_material=bpy.data.materials['Material_head.001'].copy()
    eye_material.name=f'{kind}_iris'
    eye_index=len(head.data.materials)
    head.data.materials.append(eye_material)
    for p in head.data.polygons:
        if all(i in eye_ids for i in p.vertices):p.material_index=eye_index
    delete_vertices(head,kill)
    assert len(head.data.shape_keys.key_blocks)==24,'Facial expression keys must survive topology filtering'
    # Retain the detailed fringe and complete scalp; replace the long curly locks.
    for obj in list(bpy.data.objects):
        if not obj.name.startswith('Spring_') or obj.type!='MESH':continue
        pts=[obj.matrix_world@p.co for p in obj.data.vertices]
        if min(p.z for p in pts)<1.245:
            removed.append(obj.name);bpy.data.objects.remove(obj,do_unlink=True)
    hair_palette={'gpt':('77738f','fffaff'),'gemini':('30398d','dca8fa'),'claude':('76351f','f5ae65')}[kind]
    image_recolor(bpy.data.materials['Material_hair'],f'{kind}_hair_texture',hair_palette)
    iris_palette={'gpt':('534178','b39be7'),'gemini':('783577','ef9acb'),'claude':('78452a','e3aa65')}[kind]
    image_recolor(eye_material,f'{kind}_iris_texture',iris_palette,'iris')
    shoes_palette={'gpt':('b4a6ca','fff8ff'),'gemini':('3e285c','be8eda'),'claude':('503129','a96a3b')}[kind]
    image_recolor(bpy.data.materials['Material_lower_body'],f'{kind}_stockings_and_shoes',shoes_palette,'blue')
    # Downsample only derivative copies of face/skin maps, not the source file.
    for img in bpy.data.images:
        if img.users and max(img.size)>2048:
            img.scale(2048,2048);img.pack()
    audit['removed_source_parts']=removed
    audit['face_shape_keys']=len(head.data.shape_keys.key_blocks)


def torso_weight(p,i):
    mix=max(0,min(1,(p[1]-1.10)/.20))
    return {'hips':1-mix,'chest':mix}


def clothes(mats):
    base,trim,dark,gold=mats['base'],mats['trim'],mats['dark'],mats['metal']
    profile=[(1.075,.113,.099),(1.12,.119,.115),(1.20,.138,.149),(1.28,.157,.176),(1.34,.143,.135),(1.385,.108,.097)]
    def bodice(u,t):
        y,rx,rz=spline(profile,t)
        a=TAU*u
        return (rx*math.sin(a),y,rz*math.cos(a)+.025)
    surface(f'{kind}_fitted_bodice',64,26,bodice,base,torso_weight)
    ring('Waist piping',1.078,.121,.109,gold,z=.025)
    # Original skin and hands remain. New sleeves cover the original clothing gaps.
    for s,suffix in [(-1,'R'),(1,'L')]:
        upper='upper_arm.'+suffix
        lower='forearm.'+suffix
        if upper not in rig.data.bones:
            upper='upper_arm_'+suffix
        # Query actual source human-bone mapping rather than assuming dimensions.
        hb=rig.data.vrm_addon_extension.vrm1.humanoid.human_bones
        upper=getattr(hb,'left_upper_arm' if s==1 else 'right_upper_arm').node.bone_name
        lower=getattr(hb,'left_lower_arm' if s==1 else 'right_lower_arm').node.bone_name
        ub=rig.data.bones[upper];lb=rig.data.bones[lower]
        def dp(p):
            p=rig.matrix_world@p;return (p.x,p.z,-p.y-.26)
        a,b,c=dp(ub.head_local),dp(lb.head_local),dp(lb.tail_local)
        end=tuple(a[i]*.45+b[i]*.55 for i in range(3))
        tube(f'{kind}_shoulder_sleeve_{suffix}',[a,end],lambda t:.045+.022*math.sin(math.pi*t),trim,upper,radial=20,steps=16)
        if kind=='claude':
            tube(f'Claude bishop sleeve {suffix}',[end,b,c],lambda t:.027+.026*math.sin(math.pi*t),trim,lambda p,i:{upper:max(0,1-i/(20*32)),lower:min(1,i/(20*32))},radial=20,steps=32)
        else:
            tube(f'{kind}_wrist_cuff_{suffix}',[tuple(c[i]*.82+b[i]*.18 for i in range(3)),c],.032,trim,lower,radial=16,steps=8)
    hem={'gpt':.23,'gemini':.68,'claude':.20}[kind]
    radius={'gpt':.345,'gemini':.29,'claude':.34}[kind]
    def skirt(u,t):
        a=TAU*u
        y=1.08*(1-t)+hem*t
        r=.124+(radius-.124)*t**.64
        fold=.011*math.sin(a*18)*(t**.4)
        # Gemini's asymmetric layered hem is a geometry change, not a recolor.
        if kind=='gemini':y+=.036*math.cos(a*3)*t**4
        return ((r+fold)*math.sin(a),y,(r*.83+fold)*math.cos(a)+.012)
    surface(f'{kind}_new_skirt',96,32,skirt,base,'hips',reverse=True)
    for j in range(3 if kind=='gpt' else 2):
        lo=.82+j*.075
        surface(f'{kind}_layered_hem_{j}',96,5,lambda u,t,lo=lo:tuple(spline([skirt(u,lo),skirt(u,min(1,lo+.065))],t)[i]+((.007*math.sin(TAU*u)) if i==0 else (.007*math.cos(TAU*u) if i==2 else .003*math.sin(TAU*u*28))) for i in range(3)),trim,'hips',reverse=True)
    for t in [.015,.985]:
        tube(f'{kind}_skirt_piping_{t}',[skirt(i/96,t) for i in range(97)],.0026,gold,'hips',radial=6,steps=128)
    # Waist-to-shoulder front seams make the tailored outfit legible.
    for s in [-1,1]:
        tube(f'{kind}_bodice_seam_{s}',[(s*.065,1.08,.127),(s*.078,1.17,.166),(s*.085,1.27,.182),(s*.072,1.36,.116)],.0026,gold,'chest',radial=6,steps=28)
    ring('Collar',1.407,.052,.053,dark,'neck',z=-.012,thickness=.009)
    if kind=='gpt':
        for side in [-1,1]:
            tube(f'Dragon silver sash {side}',[(side*.015,1.31,.199),(side*.10,1.28,.17),(side*.155,1.20,.06),(side*.13,1.09,-.02)],.010,trim,'chest',flatten=.55)
        star('Dragon breast crystal',(0,1.30,.205),.022,mats['jewel'],'chest',points=4)
    elif kind=='gemini':
        for y in [1.12,1.17,1.22,1.27]:
            tube(f'Corset lacing {y}',[(-.052,y,.187),(.052,y+.035,.187)],.0025,gold,'chest',radial=6,steps=8)
        star('Gemini belt star',(0,1.08,.149),.032,gold,'hips',points=4)
        for side in [-1,1]:
            surface(f'Gemini hip bow {side}',20,10,lambda u,t,s=side:(s*(.025+.105*u),1.08+.037*math.sin(TAU*t)*(.3+.7*u),.16+.022*math.cos(TAU*t)),dark,'hips')
    else:
        # A contrasting open-front overdress, not the original maid apron.
        def panel(u,t):
            a=TAU*(.085+.83*u)
            r=.13+(.355-.13)*t**.64
            return (r*math.sin(a),1.075*(1-t)+.245*t,(r*.83)*math.cos(a)+.012)
        surface('Claude cinnamon overdress',72,26,panel,dark,'hips',reverse=True)
        for u in [0,1]:
            tube(f'Claude embroidered border {u}',[panel(u,i/40) for i in range(41)],.006,gold,'hips',radial=8,steps=48)
        for row in range(8):
            for s in [-1,1]:
                y=.29+row*.035
                star(f'Claude hem embroidery {s} {row}',(s*(.11+.017*row),y,.27),.008,gold,'hips',points=6)


def hair(mats):
    dark,light=mats['hair'],mats['hairlight']
    length={'gpt':.81,'gemini':.96,'claude':.54}[kind]
    # A continuous back sheet closes the spaces between locks. The root is
    # tucked into the retained scalp rather than ending in exposed flat tubes.
    def mantle(u,t):
        a=math.pi*.22+math.pi*1.56*u
        width=.105+.082*math.sin(t*math.pi*.62)
        depth=.080+.035*math.sin(t*math.pi*.70)
        scallop=.020*math.cos(u*TAU*12)*t**5
        return (width*math.sin(a),1.665*(1-t)+(length+.035)*t+scallop,-.06+depth*math.cos(a))
    surface(f'{kind}_continuous_back_hair',96,40,mantle,dark,'head',reverse=True)
    for i in range(12):
        a=math.pi*.23+math.pi*1.54*i/11
        x=.125*math.sin(a)
        back=-.08+.085*math.cos(a)
        side=1 if x>0 else -1
        p=[(x*.65,1.67,back*.65),(x*1.04,1.56,back),(x*1.38,1.39,back-.018),(x*1.6,1.14,back-.055),(x*1.6+side*.055,length+.10,back-.08),(x*1.5+side*.035,length,back-.02)]
        if kind=='claude':p[-2]=(x*1.9,length+.10,back-.08)
        name=f'AA_hair_{i}'
        b=bone(name,'head',p[0],p[-1])
        # The original head/fringe retains its detailed authored texture.
        tube(f'{kind}_long_hair_lock_{i}',p,lambda t:.034*math.sin(math.pi*t)**.55+.0007,dark,b,radial=12,steps=36,flatten=.50)
        accent=[tuple(p[j][k]+(.004 if k==2 else 0) for k in range(3)) for j in range(len(p))]
        tube(f'{kind}_hair_highlight_{i}',accent,lambda t:.005*(1-t)**.5+.0003,light,b,radial=6,steps=28,flatten=.4)
        spring([b],f'{kind} hair lock {i}',1.4)
    if kind=='gemini':
        for s in [-1,1]:
            ellipse(f'Gemini side bun {s}',(s*.16,1.56,-.02),(.053,.052,.047),dark)
            for j in range(3):
                p=[(s*.17,1.55,-.01),(s*(.21+.015*j),1.38,.005),(s*(.20+.02*j),1.15,.03),(s*(.25+.015*j),1.00,.09)]
                tube(f'Gemini side ponytail {s} {j}',p,lambda t:.021*(1-t)**.3+.001,dark,'head',radial=12,flatten=.65)
    # Side pieces visibly frame the jaw after the fish ear removal.
    for s in [-1,1]:
        p=[(s*.075,1.65,.015),(s*.125,1.56,.047),(s*.125,1.48,.063),(s*.15,1.35,.065),(s*.13,1.25,.11)]
        tube(f'{kind}_face_framing_lock_{s}',p,lambda t:.023*math.sin(math.pi*t)**.6+.0007,dark,'head',radial=14,flatten=.5)


def dragon(mats):
    for s in [-1,1]:
        path=[(s*.105,1.62,-.02),(s*.16,1.69,-.045),(s*.17,1.79,-.07),(s*.125,1.87,-.08)]
        tube(f'Dragon curved horn {s}',path,lambda t:.033*(1-t)**.75+.0004,mats['trim'],'head',radial=16)
        for i in range(1,7):
            t=i/8;p=spline(path,t)
            ellipse(f'Dragon horn ridge {s} {i}',p,(.032*(1-t),.006,.028*(1-t)),mats['metal'],'head',n=16,m=6)
        name=bone(f'AA_wing_{"L" if s==1 else "R"}','chest',(s*.09,1.30,-.09),(s*.42,1.40,-.13))
        root=(s*.10,1.29,-.10)
        elbow=(s*.26,1.50,-.11)
        tips=[(s*.54,1.50,-.08),(s*.48,1.24,-.12),(s*.35,1.10,-.13),(s*.16,1.14,-.12)]
        tube(f'Dragon wing leading edge {s}',[root,elbow,tips[0]],.009,mats['metal'],name)
        for i in range(3):
            a,b=tips[i],tips[i+1]
            center=Vector(elbow)
            def membrane(u,t,a=a,b=b,center=center):
                edge=Vector(a).lerp(Vector(b),u)
                edge=edge.lerp(center,.20*math.sin(math.pi*u))
                p=center.lerp(edge,t)
                p.z+=.025*math.sin(math.pi*u)*math.sin(math.pi*t)
                return p
            surface(f'Dragon membrane {s} {i}',20,12,membrane,mats['wing'],name)
            tube(f'Dragon wing rib {s} {i}',[elbow,b],.005,mats['metal'],name,radial=8,steps=18)
    tail=[(0,.98,-.07),(.10,.80,-.28),(.35,.53,-.34),(.49,.29,-.19),(.54,.25,.08),(.45,.39,.25),(.30,.49,.28)]
    names=[]
    for i in range(3):
        names.append(bone(f'AA_tail_{i}',names[-1] if names else 'hips',tail[i*2],tail[min(len(tail)-1,i*2+2)]))
    def weights(p,index):
        t=index/(16*64)
        k=min(2,int(t*3));return {names[k]:1}
    tube('Dragon ivory scaled tail',tail,lambda t:.085*(1-t)**.65+.002,mats['trim'],weights,radial=16,steps=64)
    for i in range(8,56,3):
        t=i/64;p=spline(tail,t)
        r=.085*(1-t)**.65
        # Fine modeled scale seams follow the tail, rather than flat painted bands.
        for side in [-1,1]:
            tube(f'Dragon tail scale {i} {side}',[(p.x-r*.8,p.y+.01,p.z+side*r*.45),(p.x,p.y-.012,p.z+side*r*.9),(p.x+r*.8,p.y+.01,p.z+side*r*.45)],.0015,mats['metal'],names[min(2,int(t*3))],radial=5,steps=10)


def cat(mats):
    for s in [-1,1]:
        points=[(s*.085,1.62,.015),(s*.15,1.82,-.035),(s*.215,1.61,-.035),(s*.15,1.65,.045)]
        mesh(f'Gemini cat ear {s}',points,[(0,1,3),(1,2,3),(2,0,3),(0,2,1)],mats['hair'],'head')
        mesh(f'Gemini pink inner ear {s}',[(s*.111,1.64,.020),(s*.15,1.77,-.006),(s*.189,1.64,-.008)],[(0,1,2)],mats['pink'],'head')
    star('Gemini temple star',(-.125,1.59,.117),.043,mats['metal'])
    star('Gemini temple crystal',(-.125,1.59,.125),.029,mats['jewel'])
    tail=[(0,.97,-.11),(.14,.88,-.26),(.42,.77,-.24),(.59,.95,-.13),(.53,1.15,.05),(.38,1.16,.14)]
    names=[]
    for i in range(3):names.append(bone(f'AA_tail_{i}',names[-1] if names else 'hips',tail[min(i*2,4)],tail[min(i*2+1,5)]))
    tube('Gemini fluffy curved tail',tail,lambda t:.035+.105*math.sin(math.pi*t)**.72,mats['hair'],lambda p,i:{names[min(2,int(i/(18*72)*3))]:1},radial=18,steps=72)
    for j in range(12):
        a=TAU*j/12
        locks=[]
        for i in range(9):
            t=.18+i*.095;p=spline(tail,t);r=.025+.10*math.sin(math.pi*t)**.72
            locks.append((p.x+r*math.cos(a),p.y+.012*math.sin(a*3+i),p.z+r*math.sin(a)))
        tube(f'Gemini tail fur ridge {j}',locks,lambda t:.012*(1-t)**.4+.001,mats['hairlight'] if j%3==0 else mats['hair'],names[1],radial=7,steps=30)
    star('Gemini tail pendant',(.40,1.12,.19),.031,mats['jewel'],names[2])


def flower(name, p, radius, mats, attach='head'):
    for i in range(12):
        a=TAU*i/12
        center=(p[0]+math.sin(a)*radius*.61,p[1]+math.cos(a)*radius*.61,p[2])
        def petal(u,t,a=a,center=center):
            r=math.sin(math.pi*t)
            long=radius*.47*math.cos(math.pi*t)
            wide=radius*.18*r*math.cos(TAU*u)
            return (center[0]+long*math.sin(a)+wide*math.cos(a),center[1]+long*math.cos(a)-wide*math.sin(a),center[2]+radius*.12*r*math.sin(TAU*u))
        surface(f'{name} petal {i}',10,10,petal,mats['petal'],attach)
    ellipse(name+' center',(p[0],p[1],p[2]+.009),(radius*.26,radius*.26,.014),mats['dark'],attach,n=20,m=10)
    for i in range(9):
        a=i*2.4;r=radius*.18*math.sqrt(i/9)
        ellipse(name+f' seed {i}',(p[0]+r*math.cos(a),p[1]+r*math.sin(a),p[2]+.022),(.002,.002,.002),mats['metal'],attach,n=8,m=6)


def box(name,p,size,mat,bone='chest',bevel=.004):
    bpy.ops.mesh.primitive_cube_add(size=1,location=v(p))
    obj=bpy.context.object;obj.name=name
    obj.scale=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=obj.modifiers.new('Soft edges','BEVEL');mod.width=bevel;mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    # Bind as skinned geometry with world-space coordinates.
    points=[obj.matrix_world@vert.co for vert in obj.data.vertices]
    for vert,point in zip(obj.data.vertices,points):vert.co=point
    obj.matrix_world=Matrix.Identity(4);obj.parent=rig
    obj.data.materials.append(mat)
    obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))),1,'REPLACE')
    mod=obj.modifiers.new('Avatar skin','ARMATURE');mod.object=rig
    return obj


def scholar(mats):
    flower('Claude sunflower hairpin',(.122,1.60,.105),.048,mats)
    for s in [-1,1]:
        surface(f'Claude black hair ribbon {s}',20,10,lambda u,t,s=s:(.14+s*.060*u,1.555+.030*math.sin(TAU*t)*(.3+.7*u),.07+.012*math.cos(TAU*t)),mats['ribbon'],'head')
    for x in [.14,.17]:
        tube(f'Claude ribbon tassel {x}',[(x,1.55,.05),(x+.015,1.46,.04),(x+.005,1.37,.04)],.006,mats['ribbon'],'head',flatten=.35)
    flower('Claude collar sunflower',(0,1.357,.14),.024,mats,'chest')
    # Closed folio held against the torso; separate cover and page geometry.
    box('Claude book pages',(0,1.18,.243),(.177,.245,.037),mats['trim'])
    box('Claude book front cover',(0,1.18,.267),(.19,.258,.009),mats['dark'])
    box('Claude book back cover',(0,1.18,.219),(.19,.258,.009),mats['dark'])
    for x in [-.082,.082]:box(f'Claude book border {x}',(x,1.18,.274),(.003,.23,.002),mats['metal'],bevel=0)
    for y in [1.066,1.294]:box(f'Claude book border {y}',(0,y,.274),(.165,.003,.002),mats['metal'],bevel=0)
    flower('Claude book crest',(0,1.18,.279),.032,mats,'chest')
    for y in [1.08+i*.009 for i in range(23)]:box(f'Claude page edge {y}',(.089,y,.242),(.002,.0008,.033),mats['metal'],bevel=0)


def finish():
    meta=rig.data.vrm_addon_extension.vrm1.meta
    meta.vrm_name={'gpt':'GPT Ivory Dragon — Nike derivative','gemini':'Gemini Starlit Cat — Nike derivative','claude':'Claude Sunflower Scholar — Nike derivative'}[kind]
    meta.version='0.1.0-20261125'
    meta.copyright_information='Original character 溟月: 上善无形; maid design: ZipZipPipe; base model: ニケ / Nike. Non-official character reinterpretation and structural outfit/hair/accessory changes for Aster Atlas. CC BY-NC-SA 4.0.'
    meta.other_license_url='https://creativecommons.org/licenses/by-nc-sa/4.0/'
    meta.credit_notation='required'
    meta.allow_redistribution=True
    meta.modification='allowModificationRedistribution'
    meta.commercial_usage='personalNonProfit'
    meta.avatar_permission='everyone'
    # Remove dangling spring definitions only if none of their bones influences a mesh.
    used={g.name for o in bpy.context.scene.objects if o.type=='MESH' for g in o.vertex_groups}
    springs=rig.data.vrm_addon_extension.spring_bone1.springs
    for i in reversed(range(len(springs))):
        if not any(j.node.bone_name in used for j in springs[i].joints):springs.remove(i)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:
        if o.type in ('MESH','ARMATURE'):
            o.hide_select=False
            o.hide_set(False)
            o.hide_viewport=False
            o.hide_render=False
            o.select_set(True)
    bpy.context.view_layer.objects.active=rig
    blend=ROOT/f'models/nike-derived/{kind}.blend'
    blend.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
    output=ROOT/f'public/avatars/{kind}.vrm'
    result=bpy.ops.export_scene.vrm(filepath=str(output),armature_object_name=rig.name,export_only_selections=False,export_invisibles=True,ignore_warning=True,export_try_sparse_sk=True)
    if result!={'FINISHED'} or not output.is_file():raise RuntimeError(f'VRM export failed: {result}')
    data=output.read_bytes()
    exported=json.loads(data[20:20+int.from_bytes(data[12:16],'little')])
    assert len(exported.get('meshes',[]))>20 and output.stat().st_size>1000000,'Reject empty or skeleton-only VRM exports'
    audit.update({'id':kind,'source':'Nike DeepSeek-chan.blend','license':'CC BY-NC-SA 4.0','bytes':output.stat().st_size,'new_bones':list(new_bones),'meshes':[o.name for o in bpy.context.scene.objects if o.type=='MESH'],'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH')})
    (ROOT/f'models/nike-derived/{kind}.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
    print('DERIVATIVE_COMPLETE',kind,output.stat().st_size,audit['triangles'])


targets=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['gpt','gemini','claude']
for kind in targets:
    if kind not in ['gpt','gemini','claude']:raise ValueError(kind)
    new_bones={};audit={}
    prepare_source()
    palette={
        'gpt':dict(base='f3eff8',trim='fffaff',dark='7d6e9b',metal='c3afd5',jewel='aa81d0',hair='e5deed',hairlight='fffaff',wing='d9c6eb'),
        'gemini':dict(base='5f529c',trim='f8eaf9',dark='302b58',metal='ecd09d',jewel='e5a0ee',hair='7374cb',hairlight='c297eb',pink='e8b7cf'),
        'claude':dict(base='f6e9d2',trim='fff4e3',dark='6e4233',metal='c79554',jewel='d9873f',hair='c66a36',hairlight='edab64',petal='eaa24d',ribbon='342b31'),
    }[kind]
    mats={k:material(f'{kind}_{k}',color) for k,color in palette.items()}
    clothes(mats)
    hair(mats)
    {'gpt':dragon,'gemini':cat,'claude':scholar}[kind](mats)
    finish()
