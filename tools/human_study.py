# Long-form cast geometry. Coordinates are x/right, y/up, z/front.
import math
from mathutils import Matrix, Vector
from build_cast import axes, blend, clamp, mix, rgb, spline

PI, TAU = math.pi, math.tau

# Jaw width, chin length, eye spacing, opening, and outer-corner lift.
FEATURES = {
    'deepseek': (1.04,.99,.130,.081,-.007),
    'gpt': (.88,1.04,.125,.073,.016),
    'gemini': (.95,.94,.134,.105,.013),
    'claude': (.98,1.01,.128,.087,.004),
}


class HumanStudy:
    def head(self,p):
        jaw,chin,spacing,opening,lift = FEATURES[self.name]
        h = self.group('Head',p,(0,3.89,.025))
        self.head_node = h
        profile = [(-.337*chin,.004,.006,.101),(-.320*chin,.106*jaw,.129,.054),
                   (-.275*chin,.185*jaw,.167,.045),(-.212,.244*jaw,.207,.023),
                   (-.132,.283,.242,.004),(-.030,.311,.256,-.022),
                   (.080,.310,.252,-.037),(.182,.293,.239,-.048),
                   (.280,.251,.200,-.050),(.348,.155,.145,-.050),(.385,.004,.006,-.046)]

        def ring(y):
            for i,(a,b) in enumerate(zip(profile,profile[1:])):
                if y <= b[0]:
                    return spline(profile,(i+clamp((y-a[0])/(b[0]-a[0])))/(len(profile)-1))
            return profile[-1]

        def relief(x,y):
            bridge = .024*math.exp(-(x/.042)**2-((y+.073)/.067)**2)
            tip = (.047 if self.name=='gpt' else .039)*math.exp(-(x/.047)**2-((y+.135)/.047)**2)
            cheek = .014*math.exp(-((abs(x)-.161)/.086)**2-((y+.139)/.053)**2)
            lips = .009*math.exp(-(x/.080)**2-((y+.213)/.032)**2)
            return bridge+tip+cheek+lips

        def front(x,y):
            _,rx,rz,z = ring(y)
            return z+(rz+relief(x,y))*math.sqrt(max(.001,1-(x/max(.004,rx))**2))

        def face(u,v):
            y = mix(profile[0][0],profile[-1][0],v)
            _,rx,rz,z = ring(y)
            x,f = rx*math.sin(TAU*u),math.cos(TAU*u)
            return x,y,z+rz*f+relief(x,y)*max(0,f)

        def skin_tint(u,v,xyz):
            x,y,_ = xyz
            cheek = math.exp(-((abs(x)-.170)/.088)**2-((y+.141)/.066)**2)
            nose = math.exp(-(x/.075)**2-((y+.141)/.054)**2)
            return blend(self.skin,rgb('e990a1'),(.38*cheek+.12*nose)*max(0,math.cos(TAU*u)))

        self.grid('Sculpted cheekbones, nose and jaw',h,96,78,face,self.skin,skin_tint,graphic=True)
        self.eyes,self.closed_lids = [],[]
        for q,side in ((-1,'left'),(1,'right')):
            cx,cy,width = q*spacing,-.043,.097 if self.name=='gemini' else .091
            ez = front(cx,cy)
            eye = self.group('Eye '+side,h,(cx,cy,ez))
            shut = self.group('Closed lid '+side,h,(cx,cy,ez-.015))
            self.eyes.append(eye)
            self.closed_lids.append(shut)

            def point(s,y,offset=.006):
                x = q*s
                return x,y,front(cx+x,cy+y)-ez+offset

            def top(k):
                return -.004+lift*k+(.040 if self.name=='gemini' else .029)*max(0,1-k*k)**.77

            def bottom(k):
                return top(k)-opening*max(0,1-k*k)**.75

            self.grid('Almond sclera',eye,34,9,lambda u,v:point(width*(2*u-1),mix(bottom(2*u-1),top(2*u-1),v)),rgb('fff1ef'),graphic=True)

            def iris(u,v):
                k = 2*u-1
                x = (.063 if self.name=='gemini' else .057)*k-.005
                r = .062*math.sqrt(max(0,1-k*k))
                lo = max(bottom(x/width)+.001,-.016-r)
                hi = max(lo,min(top(x/width),-.016+r))
                return point(x,mix(lo,hi,v),.011)

            self.grid('Tonal iris',eye,36,12,iris,self.iris,lambda u,v,p:blend(blend(self.iris,self.light_iris,clamp((.015-p[1])/.075)*.76),self.ink,.35*abs(2*u-1)**7))

            def dot(x,y,w,r,depth):
                return lambda u,v:point(x+w*v*math.sin(TAU*u),y+r*v*math.cos(TAU*u),depth)

            self.grid('Pupil',eye,17,4,dot(-.005,.001,.012 if self.name=='gpt' else .014,.021,.015),blend(self.iris,self.ink,.78),graphic=True)
            self.grid('Eye glint',eye,14,4,dot(-.024,.010,.010,.008,.018),rgb('fffaff'),graphic=True)
            self.grid('Soft lower lash',eye,30,4,lambda u,v:point(width*(2*u-1),bottom(2*u-1)-v*.004*math.sin(PI*u),.012),rgb('996975'))
            self.grid('Tapered upper lash',eye,35,6,
                      lambda u,v:point(width*mix(-1.025,1.13,u),top(mix(-1.025,1.13,u))+.017*v*math.sin(PI*u)**.65+.019*max(0,(u-.87)/.13)**2,.016),rgb('332331'),graphic=True)
            self.grid('Closed tapered lash line',shut,37,6,
                      lambda u,v:point(width*mix(-1.04,1.12,u),-.013-.028*math.sin(PI*u)**.84+.005*(2*u-1)+.015*v*math.sin(PI*u)**.66,.028),rgb('382737'),graphic=True)
            self.grid('Lid crease',shut,25,3,
                      lambda u,v:point(width*mix(-.92,.92,u),.013-.016*math.sin(PI*u)+v*.003*math.sin(PI*u),.022),rgb('bb8185'))
            shut.scale=(.001,)*3
            brow = .011 if self.name=='claude' else 0
            self.ribbon('Eyebrow',h,[(cx+q*s,y+brow,front(cx+q*s,y+brow)+.009) for s,y in ((-.070,.044),(-.023,.063),(.037,.065+lift*.3),(.084,.044+lift))],.009,blend(self.shadow,self.ink,.61))

        y0 = -.217
        z0 = front(0,y0)
        self.mouth = self.group('Mouth',h,(0,y0,z0+.008))

        def lip(u,v):
            k = 2*u-1
            x,y = .062*k,.013*k*k+.003*k-.010*math.sin(PI*u)*v
            return x,y,front(x,y0+y)-z0+.003

        self.grid('Subtle closed smile',self.mouth,33,6,lip,rgb('9f5c68'),graphic=True)
        self.grid('Lower lip tint',self.mouth,27,5,lambda u,v:(lip(u,1)[0],lip(u,1)[1]-.012*v*math.sin(PI*u),lip(u,1)[2]-.001),rgb('e7a39e'))
        self.mouth.scale=(.86,1,.84)
        self.long_hair(h)
        # Keep the original species accessories on the newly sculpted skull.
        accessory = self.group('Head accessories',h,(0,.035,-.024))
        accessory.scale = (.48,.52,.51)
        if self.name=='deepseek':
            self.whale_fin_ears(h)
        super().accents(accessory)

    def whale_fin_ears(self,h):
        for q in (-1,1):
            for inner in (False,True):
                def fin(u,v):
                    a = TAU*u
                    thin = (1-v)**.71
                    return (q*mix(.266 if not inner else .315,.535 if not inner else .492,v),
                            -.048+.111*v+(.086 if not inner else .055)*math.sin(a)*thin,
                            -.045-.064*v+.040*inner+(.041 if not inner else .009)*math.cos(a)*thin)
                self.grid('Fin inner fold' if inner else 'Pointed whale-fin ear',h,22,25,fin,self.skin,
                          lambda u,v,p:blend(rgb('eea9a7') if inner else self.skin,self.tip,.14*v))

    def long_hair(self,h):
        def scalp(u,v):
            a = (2*u-1)*PI
            t = mix(.010,1.39+.87*(abs(a)/PI)**.72,v)
            return .344*math.sin(a)*math.sin(t),.011+.409*math.cos(t),-.047+.308*math.cos(a)*math.sin(t)

        self.grid('Continuous hair cap',h,70,35,scalp,self.hair,
                  lambda u,v,p:blend(self.hair,self.shadow,.16+.23*abs(2*u-1)**2+.12*v))
        pins = [-1.99,-1.55,-1.21,-.89,-.51,-.14,.20,.53,.88,1.19,1.58,1.99]
        lengths,sweep,end,part = {
            'deepseek': ([2.2,1.99,1.75,1.56,1.47,1.50,1.53,1.58,1.66,1.78,1.99,2.23],.68,-1.57,-.11),
            'gpt': ([2.22,2.11,1.75,1.54,1.37,1.22,1.27,1.46,1.60,1.75,2.01,2.17],-.56,-1.34,.12),
            'gemini': ([2.17,1.89,1.68,1.52,1.46,1.48,1.50,1.51,1.53,1.68,1.98,2.18],.26,-.72,-.02),
            'claude': ([2.20,1.97,1.83,1.67,1.62,1.47,1.30,1.29,1.50,1.74,1.99,2.23],1.05,-1.39,-.05),
        }[self.name]
        for j,(a,b) in enumerate(zip(pins,pins[1:])):
            def fringe(u,v):
                peak = .59+.13*math.cos(j*1.79)
                tip = max(0,1-abs(u-peak)/(peak if u<peak else 1-peak))
                tuft = .108 if self.name=='claude' else .135
                polar = mix(.065,mix(lengths[j],lengths[j+1],u)+tuft*tip**.90,v)
                az = mix(a-.023,b+.023,u)+sweep*(1-v)**1.46+part*v*v
                swell = 1+.025*math.sin(PI*u)*math.sin(PI*v)
                return (.350*math.sin(polar)*math.sin(az)*swell,.014+.419*math.cos(polar),
                        -.044+.325*math.sin(polar)*math.cos(az)*swell)

            def tone(u,v,p):
                edge = (1-math.sin(PI*u)**.37)*.48*v
                sheen = math.exp(-((v-.49-.054*math.sin(j*.77))/.157)**2)*math.sin(PI*u)**.68
                grain = .044*math.sin(PI*(u*13+v*.55))*math.sin(PI*v)
                glint = blend(self.tip,rgb('6387d0'),.52) if self.name=='deepseek' else self.tip
                return blend(blend(self.hair,self.shadow,edge+.10*v+grain),glint,.39*sheen)

            self.grid('Swept fringe %02d'%j,h,19,34,fringe,self.hair,tone)

        def fall(name,points,width,depth):
            self.sweep(name,h,points,
                       lambda t:width*(.38+.62*math.sin(PI*t**.73)**.65)*(1-.998*t**7),
                       lambda t:depth*(1-.985*t**5),self.hair,
                       lambda u,t,p:blend(blend(self.shadow,self.hair,.37+.56*(.5+.5*math.sin(TAU*u))),self.tip,.68*t**1.73),36,14)

        for q in (-1,1):
            for i in range(5):
                x = .200+i*.037
                y = end+.20*math.sin(i*1.17+.9*q)+(.24 if self.name=='gpt' and q==-1 else 0)
                wave = .065 if self.name=='claude' else -.059 if self.name=='gemini' else 0
                fall('Layered side hair',[(q*(x-.089),.248,-.147-i*.020),
                     (q*(x+.016),-.107,-.117-i*.029),(q*(x+.068+wave),y*.41,-.179-i*.023),
                     (q*(x+.125-wave*.84),y*.77,-.16-i*.025),(q*(x+.19-.021*i+wave),y,-.116-i*.026)],.101-.006*i,.035)
            tip = end*.63 if self.name in ('deepseek','claude') else end*.78
            fall('Face-framing strand',[(q*.238,.222,.113),(q*.312,.049,.147),
                 (q*.312,-.212,.119),(q*.365,tip*.70,.102),(q*(.407 if self.name=='deepseek' else .344),tip,.096)],.049,.027)
        for i in range(9):
            x = (i-4)*.066
            fall('Back hair',[(x*.59,.299,-.221),(x,-.162,-.337),(x*1.41,end*.45,-.390),
                 (x*1.51+.037*math.cos(i),end*.77,-.363),(x*1.70+.052*math.cos(i),end-.15*math.cos(i*.9),-.281)],.078,.042)

    def clothes(self,p):
        kind = self.name
        width,waist,depth,hem,flare,sleeve = {
            'deepseek': (1.00,1.00,1.00,1.09,.67,1.00),
            'gpt': (1.05,.96,.97,.61,.58,.88),
            'gemini': (.95,.93,.92,1.57,.54,1.04),
            'claude': (1.00,1.04,1.02,.52,.74,.91),
        }[kind]
        self.shoulder_width = width
        for q in (-1,1):
            x = q*.178*width
            shoes = self.shadow if kind!='gpt' else self.dress
            self.sweep('Fitted stocking',p,[(x,.118,-.011),(x,.34,-.001),(x,.72,.015),
                       (q*.196,1.06,.028),(q*.205,1.38,.017),(q*.207,1.86,-.015)],
                       lambda t:.069+.045*t+.013*math.sin(TAU*t),lambda t:.071+.048*t,self.trim,steps=28,sides=19)
            self.oval('Leather shoe',p,(x,.086,.080),(.103,.075,.175),shoes,detail=23)
            self.oval('Stacked sole',p,(x,.027,.088),(.104,.024,.178),self.shadow,detail=22)
            self.ribbon('Instep strap',p,[(x-.089,.098,.049),(x-.058,.149,.062),(x+.053,.145,.079),(x+.089,.093,.09)],.016,self.dress)
            self.oval('Buckle',p,(x+q*.074,.133,.085),(.014,.014,.009),self.gold,detail=12)
        self.sweep('Neck',p,[(0,3.28,.008),(0,3.43,.024),(0,3.65,.044)],
                   lambda t:.097-.011*math.sin(PI*t),lambda t:.089+.008*t,self.skin,steps=19)
        self.garment('Tailored bodice',p,[(2.44,.246*waist,.161,0,0),(2.61,.238*waist,.159,0,0),
                     (2.83,.271*width,.186*depth,0,0),(3.02,.303*width,.210*depth,0,0),(3.22,.354*width,.181,0,0),
                     (3.35,.305*width,.139,0,0),(3.42,.101,.102,0,0)],self.dress,front=.006)
        self.garment('Collar',p,[(3.35,.145,.125,0,0),(3.412,.114,.116,0,0),(3.494,.105,.111,0,0)],self.trim,front=.026)

        def skirt_rows(extra=0,rise=0):
            return [(hem+rise,flare+extra,.367+extra,.069,.032),(hem+.13+rise,flare*.97+extra,.358+extra,.072,.020),
                    (mix(hem,2.56,.39),flare*.76+extra,.296+extra,.058,.013),
                    (mix(hem,2.56,.77),.335*waist+extra,.203+extra,.040,.009),(2.56,.244*waist+extra,.170+extra,0,0)]

        def folds(u,v,p):
            return blend(self.dress,self.shadow,.06+.28*(.5+.5*math.cos(TAU*12*(u-.5)))**2*(1-.8*v))

        self.garment('Paneled skirt',p,skirt_rows(),self.dress,12,paint=folds)
        self.garment('Scalloped hem',p,[(hem-.081,flare*.980,.367,.085,.031),(hem-.021,flare*1.013,.381,.075,.028),
                     (hem+.044,flare*.987,.358,.066,.021)],self.trim,12)
        self.garment('Gold piping at hem',p,[(hem+.030,flare*1.001,.366,.071,.030),(hem+.049,flare*.997,.366,.071,.030)],self.gold,12)
        self.garment('Waist band',p,[(2.489,.254*waist,.179,0,0),(2.548,.253*waist,.176,0,0),(2.611,.246*waist,.172,0,0)],self.shadow,front=.007)
        self.garment('Waist silk thread',p,[(2.580,.253*waist,.177,0,0),(2.595,.251*waist,.176,0,0)],self.gold,front=.010)

        if kind=='deepseek':
            self.garment('Curved white bib',p,[(2.56,.247,.169,0,0),(2.76,.267,.179,0,0),(3.01,.310,.216,0,0),
                         (3.22,.356,.182,0,0),(3.36,.290,.149,0,0),(3.43,.110,.118,0,0)],self.trim,0,-.66,.66,.018)
            self.garment('White apron',p,skirt_rows(.010,.16),self.trim,12,-.81,.81,.020)
            self.garment('Apron scallops',p,[(hem+.104,flare*.987,.372,.083,.046),(hem+.157,flare*1.015,.374,.072,.031),
                         (hem+.200,flare*.995,.364,.068,.024)],self.trim,12,-.83,.83,.030)
            self.bow(p,0,3.286,.172,.52,self.dress)
            self.oval('Blue cabochon',p,(0,3.292,.209),(.028,.035,.014),self.accent,detail=18)
            self.bow(p,0,2.54,-.198,.67,self.trim)
        elif kind=='gpt':
            for q in (-1,1):
                lo,hi = ((-.96,-.08) if q<0 else (.08,.96))
                self.garment('Separated silver robe panel',p,skirt_rows(.019,.073),self.trim,12,lo,hi,.021)
                self.ribbon('Diagonal robe closure',p,[(q*.174,3.342,.134),(q*.074,3.24,.193),(-q*.052,3.035,.234),(-q*.164,2.83,.161)],.025,self.trim)
            self.gem('Moonstone clasp',p,0,3.229,.223,.061,self.accent)
        elif kind=='gemini':
            self.garment('Lilac overskirt',p,[(hem+.18,flare*.952,.366,.079,.031),(hem+.31,flare*.89,.333,.068,.020),
                         (2.25,.334,.221,.045,.012),(2.56,.249,.181,0,0)],self.accent,12,-2.46,2.46,.011)
            self.bow(p,0,3.287,.170,.54,self.accent)
            self.gem('Neck star charm',p,0,3.282,.208,.053,self.gold)
            for j in range(5):
                self.gem('Night-sky embroidery',p,(j-2)*.115,hem+.34+.029*math.cos(j),.381-.020*(j-2)**2,.022+.006*(j%2),self.gold)
        else:
            self.garment('Cream shoulder cape',p,[(3.092,.382,.212,.040,.023),(3.169,.409,.212,.039,.016),
                         (3.29,.349,.177,.026,.009),(3.442,.111,.117,0,0)],self.trim,7,-2.93,2.93,.019)
            self.flower(p,0,3.186,.239,.063)
            for q in (-1,1):
                self.ribbon('Skirt panel seam',p,[(q*.15,2.53,.150),(q*.19,2.09,.190),(q*.28,1.46,.263),(q*.42,.70,.296)],.011,self.gold)
            book = self.group('Book held at waist',p,(0,.79,.016))
            self.book(book)
        self.limbs(p,width,sleeve)

    def limbs(self,p,width,sleeve):
        self.arms,self.forearms,self.hands,self.fingers = [],[],[],[]
        for q,side in ((-1,'left'),(1,'right')):
            arm = self.group('Upper arm '+side,p,(q*.321*width,3.27,.009))
            fore = self.group('Forearm '+side,p)
            hand = self.group('Wrist '+side,p)
            self.arms.append(arm)
            self.forearms.append(fore)
            self.hands.append(hand)
            self.garment('Upper sleeve',arm,[(-.52,.104*sleeve,.104*sleeve,.035,0),(-.40,.120*sleeve,.116*sleeve,.045,0),
                         (-.21,.124*sleeve,.112*sleeve,.038,0),(-.068,.142*sleeve,.128*sleeve,.051,0),(.029,.111,.105,.04,0),(.079,.008,.008,0,0)],self.dress,9)
            self.oval('Sleeved elbow',fore,(0,-.006,0),(.104*sleeve,.124,.106*sleeve),self.dress,detail=20)
            self.garment('Lower sleeve',fore,[(-.515,.088*sleeve,.082,.050,.007),(-.437,.137*sleeve,.128*sleeve,.065,.010),
                         (-.305,.151*sleeve,.149*sleeve,.059,.006),(-.163,.118*sleeve,.118*sleeve,.052,0),(-.023,.103*sleeve,.103*sleeve,.036,0)],self.dress,9)
            self.garment('Pleated cuff',fore,[(-.556,.087,.081,.154,.019),(-.515,.117,.109,.129,.019),
                         (-.463,.116,.107,.105,.008),(-.430,.107,.101,.08,.007)],self.trim,11)
            self.oval('Wrist',hand,(0,-.006,0),(.047,.064,.035),self.skin,detail=19)
            self.oval('Palm',hand,(q*.005,-.085,.006),(.063,.079,.031),self.skin,roll=q*.095,detail=22)
            fingers=[]
            for i,(x,length) in enumerate(zip((-.044,-.016,.014,.043),(.089,.119,.154,.142))):
                x *= -q
                finger = self.group('Finger',hand,(x,-.132+.008*abs(x)/.044,.012))
                fingers.append(finger)
                self.sweep('Tapered jointed finger',finger,[(0,.006,0),(x*.11,-length*.46,.002),
                           (x*.16,-length*.80,.009),(x*.19,-length,.012)],
                           lambda t:.016*(1-.26*t-.69*t**13),lambda t:.014*(1-.25*t-.70*t**13),self.skin,steps=17,sides=13)
            self.fingers.append(fingers)
            self.sweep('Thumb',hand,[(-q*.039,-.056,.013),(-q*.063,-.079,.022),(-q*.061,-.109,.033),(-q*.037,-.124,.037)],
                       lambda t:.020*(1-.28*t-.68*t**12),lambda t:.018*(1-.26*t-.70*t**12),self.skin,steps=18,sides=13)

    def creatures(self,p):
        super().creatures(p)
        if self.tail:
            self.tail.location.z = 2.10
            self.tail.scale = (.84,)*3
        for pivot in self.wings:
            pivot.location.z = 3.11
            pivot.scale = (.90,)*3

    def pose(self,clip,w,blink,arc):
        def orient(obj,point,direction,front,length=None):
            up = -Vector(axes(direction)).normalized()
            facing = Vector(axes(front))
            facing = (facing-up*facing.dot(up)).normalized()
            right = up.cross(facing).normalized()
            obj.location = axes(point)
            obj.rotation_euler = Matrix((right,-facing,up)).transposed().to_euler()
            if length: obj.scale.z = Vector(direction).length/length

        self.head_node.rotation_euler = axes((-.012+.021*w,.037+.054*w,-.018-.038*w))
        if clip=='peace':
            self.head_node.rotation_euler = axes((.040+.020*w,.088+.027*w,-.068+.032*w))
            self.mouth.scale = (1.08,1,1.16)
        elif clip=='turn_smile':
            self.head_node.rotation_euler = axes((-.048*arc,-.52*arc,.107*arc))
            self.mouth.scale = (1.01,1,.98+.15*arc)
        elif clip=='contemplate':
            self.head_node.rotation_euler = axes((.10*arc,-.12*arc,-.12*arc))
        elif clip=='wink':
            self.head_node.rotation_euler = axes((-.030*arc,-.12*arc,-.17*arc))
            self.mouth.scale = (1.03,1,.94)
        elif clip=='page_turn':
            self.head_node.rotation_euler = axes((.25*arc,-.059,.058))
        base_lid = clamp((.87-blink)/.51)
        for i,(eye,shut) in enumerate(zip(self.eyes,self.closed_lids)):
            lid = 1 if clip=='peace' else max(base_lid,clamp(1.64*arc-.32) if clip=='wink' and i==1 else 0)
            # The open eye retracts into the skull; a separately shaped lash
            # is exposed at contact instead of squashing the iris into a slit.
            amount = 1-lid
            eye.scale = (max(.001,amount**.32),max(.001,amount**.40),max(.001,amount))
            eye.location.y += .031*lid
            shut.scale = (max(.001,lid),)*3
            shut.location.y -= .015*lid

        for i,q in enumerate((-1,1)):
            shoulder = Vector((q*.321*self.shoulder_width,3.27,.009))
            elbow = shoulder+Vector((q*(.146+.011*w),-.491,.074))
            wrist = elbow+Vector((-q*(.076-.013*w),-.509,.073))
            direction = wrist-elbow
            if clip=='peace' and i==0:
                elbow = shoulder+Vector((-.363+.012*w,-.225,.276))
                wrist = elbow+Vector((.250+.016*w,.445,.152+.019*w))
                direction = Vector((.43+.029*w,.88,.067))
                for j,finger in enumerate(self.fingers[i]):
                    finger.rotation_euler = axes(((-1.74,-1.69,-.13,-.02)[j],0,(.08,.09,-.56,.29)[j]))
            elif clip=='turn_smile' and i==1:
                wrist = elbow+Vector((-.116,-.479+.051*arc,.16+.18*arc))
                direction = wrist-elbow
            elif clip=='contemplate' and i==0:
                elbow += Vector((-.043,.212,.22))*arc
                wrist = wrist.lerp(Vector((-.235,3.454,.32)),arc)
                direction = (wrist-elbow).lerp(Vector((.42,.87,.12)),arc)
            elif clip=='wink' and i==1:
                elbow += Vector((.088,.11,0))*arc
                wrist = wrist.lerp(Vector((.645,3.152,.41)),arc)
                direction = wrist-elbow
            elif self.name=='claude':
                elbow += Vector((q*.014,.003,.060))
                wrist = Vector((q*.236,2.568+(arc*.20 if i==1 and clip=='page_turn' else 0),.435))
                direction = Vector((-q*.86,.18 if clip=='page_turn' and i==1 else .33,.04))
                for finger in self.fingers[i]: finger.rotation_euler.x = -.46
            orient(self.arms[i],shoulder,elbow-shoulder,(0,0,1),.519)
            orient(self.forearms[i],elbow,wrist-elbow,(0,0,1),.522)
            orient(self.hands[i],wrist,direction,(.08 if clip=='peace' and i==0 else q*.24,.04,1))
