import * as T from "three";

const noise = `float hash(vec3 p){return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453);}float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1)),f.x),f.y),f.z);}float fb(vec3 p){return .55*noise3(p)+.26*noise3(2.1*p)+.13*noise3(4.2*p)+.06*noise3(8.7*p);}`;
const vert = `varying vec3 pos;void main(){pos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
function shader(fragment, options = {}) {
  return new T.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: `varying vec3 pos;${noise}void main(){${fragment}\n#include <colorspace_fragment>\n}`,
    ...options,
  });
}
function add(parent, geo, mat) {
  const m = new T.Mesh(geo, mat);
  parent.add(m);
  return m;
}
export function habitats() {
  let seed = 827;
  const rand = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const space = new T.Scene(),
    reef = new T.Scene();
  add(
    space,
    new T.SphereGeometry(39, 40, 24),
    shader(
      `vec3 p=normalize(pos);float n=fb(p*7.+.8);float w=exp(-6.*abs(p.y+.42*p.x+.21+.36*(n-.5)));vec3 col=mix(vec3(.003,.004,.016),vec3(.042,.027,.091),w*n*1.8);col+=vec3(.043,.047,.12)*pow(w,3.)*pow(n,2.);gl_FragColor=vec4(col,1.);`,
      { side: T.BackSide, depthWrite: false },
    ),
  );
  function particles(scene, count, r, size, col) {
    let xyz = [];
    for (let i = 0; i < count; i++) {
      const y = rand() * 2 - 1,
        a = rand() * Math.PI * 2,
        k = Math.sqrt(1 - y * y);
      xyz.push(r * k * Math.sin(a), r * y, r * k * Math.cos(a));
    }
    let g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(xyz, 3));
    scene.add(
      new T.Points(
        g,
        new T.PointsMaterial({
          color: col,
          size,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
        }),
      ),
    );
  }
  particles(space, 5500, 32, 0.045, 0xcbd6ff);
  particles(space, 800, 29, 0.087, 0xf0ddc5);
  const system = new T.Group();
  space.add(system);
  system.position.set(2.15, 3.75, -4.5);
  system.rotation.z = -0.18;
  const planet = add(
    system,
    new T.SphereGeometry(1.09, 80, 52),
    shader(
      `vec3 p=normalize(pos);float turb=fb(p*6.4);float v=fb(vec3(p.x*3.,p.y*22.+3.8*turb,p.z*3.));float fil=.5+.5*sin(p.y*47.+turb*17.+v*6.);vec3 c=mix(vec3(.018,.019,.068),vec3(.22,.155,.50),smoothstep(.26,.72,v));c=mix(c,vec3(.052,.235,.48),smoothstep(.60,.93,fil)*(.35+.65*v));c+=vec3(.082,.11,.19)*smoothstep(.65,.85,v);float l=dot(p,normalize(vec3(-.56,.79,.58)));c*=.12+1.15*smoothstep(-.3,.94,l);gl_FragColor=vec4(c,1.);`,
    ),
  );
  const rings = add(
    system,
    new T.RingGeometry(1.34, 2.43, 200, 12),
    shader(
      `float r=length(pos.xy);float n=fb(vec3(r*84.,r*6.,.1));float bands=.38+.62*pow(.5+.5*sin(r*227.+9.*n),2.);float gap=1.-.93*exp(-pow((r-1.96)/.042,2.));vec3 c=mix(vec3(.13,.13,.25),vec3(.51,.44,.73),n);float a=bands*gap*smoothstep(1.34,1.44,r)*(1.-smoothstep(2.24,2.43,r));gl_FragColor=vec4(c,a*.87);`,
      { side: T.DoubleSide, transparent: true, depthWrite: false },
    ),
  );
  rings.rotation.x = 1.29;
  reef.background = new T.Color("#195766");
  reef.fog = new T.FogExp2(0x236577, 0.093);
  reef.add(new T.HemisphereLight(0xc9f9de, 0x34536c, 2.4));
  const sun = new T.DirectionalLight(0xf1d9ba, 1.9);
  sun.position.set(-3, 7, 3);
  reef.add(sun);
  add(
    reef,
    new T.SphereGeometry(38, 40, 24),
    shader(
      `vec3 p=normalize(pos);float up=smoothstep(-.13,.48,p.y);float rays=pow(.5+.5*sin(22.*p.x+14.*p.y+1.2*sin(8.*p.z)),7.);vec3 c=mix(vec3(.014,.076,.10),vec3(.038,.32,.34),up);c+=vec3(.07,.23,.18)*rays*(.12+.6*up);gl_FragColor=vec4(c,1.);`,
      { side: T.BackSide, depthWrite: false },
    ),
  );
  const floor = add(
    reef,
    new T.PlaneGeometry(100, 100),
    new T.MeshStandardMaterial({ color: 0x566d67 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.8;
  const coralM = [0xad6482, 0xec9b84, 0x689f9e].map(
    (c) => new T.MeshStandardMaterial({ color: c }),
  );
  function branch(p, angle, len, thick, depth, mat) {
    const dir = new T.Vector3(
        Math.sin(angle),
        Math.cos(angle),
        0.2 * (rand() - 0.5),
      ).normalize(),
      end = p.clone().addScaledVector(dir, len);
    let o = add(reef, new T.CylinderGeometry(thick * 0.68, thick, len, 6), mat);
    o.position.copy(p).lerp(end, 0.5);
    o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
    if (depth) {
      for (const s of [-1, 1])
        branch(
          end,
          angle + s * (0.19 + 0.41 * rand()),
          len * (0.59 + 0.18 * rand()),
          thick * 0.7,
          depth - 1,
          mat,
        );
    }
  }
  for (let i = 0; i < 19; i++) {
    let a = i * 0.99,
      rr = 3 + rand() * 4;
    branch(
      new T.Vector3(Math.cos(a) * rr, -0.8, Math.sin(a) * rr),
      rand() * 0.35 - 0.175,
      0.5 + rand() * 0.5,
      0.09,
      3,
      coralM[i % 3],
    );
  }
  particles(reef, 280, 9, 0.025, 0xb6e9dd);
  for (const [x, z, h] of [
    [2.1, -2.4, 1.45],
    [-2.7, -3, 1.31],
    [3.7, -3.2, 1.8],
  ])
    branch(new T.Vector3(x, -0.8, z), 0.11, h, 0.12, 4, coralM[x > 3 ? 2 : 1]);
  return {
    space,
    reef,
    update(t) {
      planet.rotation.y = t * 0.024;
    },
  };
}
