import * as T from "three";
import { finishFace, makeFringe } from "./portrait.js";

// Original, parametric figurine. Y is up; the portrait faces +Z.
const PI = Math.PI,
  TAU = 2 * PI,
  V = (x, y, z) => new T.Vector3(x, y, z);
const mat = (color, roughness = 0.78, metalness = 0) =>
  new T.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    side: T.DoubleSide,
  });
const ink = mat(0x23304a),
  navy = mat(0x283360),
  blue = mat(0x414e86),
  silk = mat(0xf2ede5),
  lace = mat(0xfff7eb),
  gold = mat(0xdab978, 0.38, 0.35),
  skin = mat(0xffdfd2),
  blush = mat(0xf4b6a7),
  hair = mat(0x435d9b),
  lightHair = mat(0x536fa9),
  deep = mat(0x304671),
  tip = mat(0x6a9ca9),
  glint = mat(0x899fca),
  lip = mat(0xb66e72),
  teal = mat(0x398e93, 0.32, 0.16);
function grp(parent) {
  let o = new T.Group();
  parent?.add(o);
  return o;
}
function mesh(p, g, m) {
  const o = new T.Mesh(g, m);
  p.add(o);
  return o;
}
function oval(p, x, y, z, a, b, c, m) {
  let o = mesh(p, new T.SphereGeometry(1, 24, 18), m);
  o.position.set(x, y, z);
  o.scale.set(a, b, c);
  return o;
}
function surface(p, nu, nv, at, m) {
  let xyz = [],
    ix = [];
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      xyz.push(...at(i / nu, j / nv));
      if (i && j) {
        let n = j * (nu + 1) + i;
        ix.push(n - nu - 2, n - nu - 1, n, n - nu - 2, n, n - 1);
      }
    }
  let g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(xyz, 3));
  g.setIndex(ix);
  g.computeVertexNormals();
  return mesh(p, g, m);
}
function curve(points) {
  return new T.CatmullRomCurve3(points.map((v) => V(...v)));
}
function line(p, points, r, m) {
  return mesh(
    p,
    new T.TubeGeometry(
      curve(points),
      Math.max(10, points.length * 4),
      r,
      7,
      false,
    ),
    m,
  );
}
function lock(p, pts, w, d, m) {
  let path = curve(pts);
  return surface(
    p,
    12,
    18,
    (u, v) => {
      let pos = path.getPoint(v),
        tan = path.getTangent(v),
        side = V(tan.y, -tan.x, 0).normalize(),
        front = side.clone().cross(tan).normalize();
      let k = 0.035 + 0.965 * Math.pow(Math.sin(PI * Math.pow(v, 0.76)), 0.68);
      pos
        .addScaledVector(side, w * k * Math.cos(TAU * u))
        .addScaledVector(front, d * k * Math.sin(TAU * u));
      return pos.toArray();
    },
    m,
  );
}
function limb(p, a, b, r, s, m) {
  let A = V(...a),
    B = V(...b),
    dir = B.clone().sub(A),
    o = mesh(p, new T.CylinderGeometry(s, r, dir.length(), 24), m);
  o.position.copy(A).lerp(B, 0.5);
  o.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize());
  return o;
}
function shell(p, rings, m, n = 64, from = -PI, to = PI, folds = 14) {
  return surface(
    p,
    n,
    (rings.length - 1) * 3,
    (u, v) => {
      let k = v * (rings.length - 1),
        i = Math.min(Math.floor(k), rings.length - 2),
        t = k - i,
        r = rings[i].map((a, j) => T.MathUtils.lerp(a, rings[i + 1][j], t)),
        a = from + (to - from) * u,
        f = 1 + (r[3] || 0) * Math.cos(folds * a);
      return [
        Math.sin(a) * r[1] * f,
        r[0] + (r[4] || 0) * Math.cos(folds * a),
        Math.cos(a) * r[2] * f,
      ];
    },
    m,
  );
}
function bow(p, x, y, z, s, m) {
  let g = grp(p);
  g.position.set(x, y, z);
  g.scale.setScalar(s);
  for (let q of [-1, 1]) {
    surface(
      g,
      28,
      12,
      (u, v) => {
        const t = v * 2 - 1,
          w = 0.038 + 0.105 * Math.sin(u * Math.PI * 0.58);
        return [
          q * (0.025 + 0.31 * u - 0.026 * t * t * u),
          0.035 * u + t * w + 0.045 * u * u,
          0.022 +
            0.054 * Math.sin(Math.PI * u) +
            0.026 * Math.cos(t * Math.PI * 1.65) * u,
        ];
      },
      m,
    );
    lock(
      g,
      [
        [q * 0.04, 0, 0],
        [q * 0.12, -0.13, 0.022],
        [q * 0.19, -0.31, 0.05],
      ],
      0.076,
      0.026,
      m,
    );
    line(
      g,
      [
        [q * 0.06, 0.008, 0.051],
        [q * 0.15, 0.035, 0.075],
        [q * 0.275, 0.05, 0.05],
      ],
      0.008,
      gold,
    );
  }
  oval(g, 0, 0, 0.045, 0.075, 0.088, 0.066, m);
  return g;
}
function star(p, x, y, z, r, m) {
  let shape = new T.Shape();
  for (let j = 0; j < 8; j++) {
    let a = (j * PI) / 4,
      k = j % 2 ? r * 0.29 : r;
    shape[j ? "lineTo" : "moveTo"](Math.sin(a) * k, Math.cos(a) * k);
  }
  shape.closePath();
  let o = mesh(
    p,
    new T.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false }),
    m,
  );
  o.position.set(x, y, z);
  return o;
}
export function makeAster() {
  const root = grp(),
    body = grp(root),
    head = grp(body),
    tails = [];
  head.position.set(0, 3.16, 0);
  head.scale.set(0.9, 0.88, 0.91);
  // Boots, stockings, layered petticoats and fluted navy skirt.
  for (const q of [-1, 1]) {
    limb(body, [q * 0.23, 0.18, 0], [q * 0.22, 0.99, 0], 0.085, 0.135, silk);
    oval(body, q * 0.23, 0.14, 0.065, 0.145, 0.13, 0.235, ink);
    limb(body, [q * 0.23, 0.22, 0], [q * 0.23, 0.32, 0], 0.12, 0.105, navy);
    bow(body, q * 0.23, 0.23, 0.165, 0.25, blue);
  }
  shell(
    body,
    [
      [0.62, 0.86, 0.64, 0.048, 0.02],
      [0.69, 0.88, 0.66, 0.05],
      [0.77, 0.81, 0.62, 0.04],
      [0.87, 0.72, 0.55],
    ],
    lace,
    112,
  );
  shell(
    body,
    [
      [0.71, 0.89, 0.66, 0.046, 0.018],
      [0.8, 0.87, 0.64, 0.05],
      [1.07, 0.73, 0.53, 0.05],
      [1.37, 0.57, 0.42, 0.035],
      [1.57, 0.35, 0.28, 0.015],
      [1.7, 0.265, 0.23],
    ],
    navy,
    112,
  );
  shell(
    body,
    [
      [0.765, 0.891, 0.659, 0.045, 0.016],
      [0.784, 0.888, 0.656, 0.045, 0.016],
    ],
    gold,
    112,
  );
  shell(
    body,
    [
      [0.83, 0.868, 0.648, 0.052, 0.018],
      [0.9, 0.835, 0.625, 0.05],
      [1.18, 0.697, 0.53, 0.043],
      [1.45, 0.52, 0.41, 0.035],
      [1.62, 0.32, 0.267],
    ],
    silk,
    48,
    -0.93,
    0.93,
    14,
  );
  shell(
    body,
    [
      [0.835, 0.877, 0.66, 0.048, 0.018],
      [0.89, 0.851, 0.644, 0.048, 0.023],
    ],
    lace,
    48,
    -0.95,
    0.95,
    20,
  );
  shell(
    body,
    [
      [1.57, 0.34, 0.27],
      [1.74, 0.3, 0.235],
      [2.07, 0.369, 0.277],
      [2.32, 0.42, 0.26],
      [2.43, 0.36, 0.22],
      [2.5, 0.18, 0.16],
    ],
    blue,
  );
  shell(
    body,
    [
      [1.62, 0.327, 0.252],
      [1.7, 0.314, 0.253],
    ],
    navy,
  );
  shell(
    body,
    [
      [1.63, 0.33, 0.255],
      [1.646, 0.327, 0.255],
    ],
    gold,
  );
  shell(
    body,
    [
      [1.72, 0.316, 0.251],
      [2.07, 0.38, 0.289],
      [2.35, 0.428, 0.274],
      [2.43, 0.365, 0.23],
    ],
    lace,
    38,
    -0.61,
    0.61,
  );
  for (const q of [-1, 1])
    surface(
      body,
      72,
      8,
      (u, v) => {
        const pleat = Math.cos(u * TAU * 8),
          gather = 0.03 + 0.013 * pleat;
        return [
          q * (0.174 + 0.07 * Math.sin(u * Math.PI * 0.63) + v * gather),
          1.735 + u * 0.653,
          0.243 + 0.013 * Math.sin(Math.PI * u) + v * (0.012 + 0.016 * pleat),
        ];
      },
      silk,
    );
  limb(body, [0, 2.4, 0], [0, 2.67, 0], 0.135, 0.125, skin);
  shell(
    body,
    [
      [2.38, 0.285, 0.25],
      [2.47, 0.22, 0.19],
      [2.52, 0.158, 0.156],
    ],
    lace,
  );
  bow(body, 0, 2.37, 0.29, 0.79, navy);
  oval(body, 0, 2.365, 0.36, 0.042, 0.053, 0.022, teal);
  for (let j = 0; j < 3; j++)
    oval(
      body,
      0,
      2.12 - j * 0.13,
      0.294 - j * 0.008,
      0.024,
      0.024,
      0.014,
      gold,
    );
  bow(body, 0, 1.67, -0.28, 1.25, blue);
  // Raised arm has a joint at the shoulder; the two extended fingers make a V.
  const arm = grp(body);
  arm.position.set(-0.37, 2.34, 0);
  for (let q of [-1, 1]) {
    let o = oval(body, q * 0.38, 2.3, 0.0, 0.21, 0.23, 0.22, navy);
    o.rotation.z = q * 0.3;
    const cap = grp(body);
    cap.position.set(q * 0.395, 2.2, 0.0);
    cap.rotation.z = q * 0.29;
    shell(
      cap,
      [
        [-0.078, 0.163, 0.154, 0.07, 0.021],
        [-0.028, 0.177, 0.159, 0.045],
        [0.011, 0.161, 0.153, 0.022],
      ],
      lace,
      72,
      -PI,
      PI,
      10,
    );
  }
  const sleeve = grp(arm);
  sleeve.position.set(-0.31, 0.39, 0.38);
  sleeve.rotation.z = -0.3;
  sleeve.rotation.x = 0.18;
  shell(
    sleeve,
    [
      [-0.89, 0.235, 0.2, 0.03, 0.011],
      [-0.84, 0.298, 0.238, 0.031, 0.01],
      [-0.58, 0.297, 0.225, 0.035],
      [-0.3, 0.245, 0.2, 0.032],
      [-0.06, 0.165, 0.14, 0.035],
      [0.015, 0.122, 0.114, 0.025],
    ],
    blue,
    80,
    -PI,
    PI,
    9,
  );
  shell(
    sleeve,
    [
      [-0.85, 0.3, 0.24, 0.031, 0.011],
      [-0.835, 0.301, 0.24, 0.031, 0.01],
    ],
    gold,
    80,
    -PI,
    PI,
    9,
  );
  shell(
    sleeve,
    [
      [-0.115, 0.166, 0.142, 0.042],
      [-0.04, 0.177, 0.141, 0.055],
      [0.035, 0.157, 0.13, 0.075],
      [0.095, 0.135, 0.119, 0.09, 0.039],
    ],
    lace,
    80,
    -PI,
    PI,
    9,
  );
  limb(arm, [-0.03, -0.02, -0.02], [-0.5, -0.37, 0.19], 0.155, 0.16, navy);
  const hand = grp(arm);
  hand.position.set(-0.285, 0.45, 0.43);
  hand.rotation.z = -0.28;
  oval(hand, 0, 0.083, 0, 0.097, 0.135, 0.06, skin);
  for (let [x, y, dx, dy] of [
    [-0.051, 0.16, -0.065, 0.266],
    [0.008, 0.18, 0.127, 0.204],
    [0.056, 0.14, 0.018, 0.041],
    [0.078, 0.105, 0.018, 0.037],
    [-0.065, 0.075, 0.012, 0.052],
  ]) {
    let a = [x, y, 0.01],
      b = [x + dx, y + dy, dy < 0.1 ? 0.064 : 0.027];
    const A = V(...a),
      B = V(...b),
      along = B.clone().sub(A).normalize(),
      side = V(along.y, -along.x, 0).normalize(),
      normal = side.clone().cross(along).normalize();
    surface(
      hand,
      14,
      18,
      (u, t) => {
        const radius =
          (0.029 - 0.01 * t + 0.002 * Math.sin(3 * PI * t)) *
          Math.min(1, Math.sqrt((1 - t) * 12));
        return A.clone()
          .lerp(B, t)
          .addScaledVector(
            normal,
            0.016 * Math.sin(PI * t) + radius * 0.83 * Math.sin(TAU * u),
          )
          .addScaledVector(side, radius * Math.cos(TAU * u))
          .toArray();
      },
      skin,
    );
  }
  const rest = grp(body);
  rest.rotation.z = 0.13;
  rest.position.set(0.47, 2.24, 0);
  shell(
    rest,
    [
      [-0.77, 0.164, 0.154, 0.025],
      [-0.73, 0.188, 0.17, 0.055],
      [-0.5, 0.174, 0.157, 0.04],
      [-0.25, 0.151, 0.138, 0.035],
      [0, 0.131, 0.131, 0.025],
    ],
    navy,
  );
  shell(
    rest,
    [
      [-0.845, 0.137, 0.13, 0.075, 0.019],
      [-0.79, 0.157, 0.142, 0.065],
      [-0.75, 0.147, 0.14, 0.032],
    ],
    lace,
  );
  oval(rest, 0, -0.905, 0.024, 0.071, 0.108, 0.047, skin);
  for (let j = 0; j < 4; j++) {
    let x = (j - 1.52) * 0.032;
    limb(
      rest,
      [x, -0.937, 0.049],
      [x * 0.93, -1.065 + 0.017 * Math.abs(j - 1), 0.057],
      0.019,
      0.012,
      skin,
    );
  }
  const otherRest = rest.clone(true);
  otherRest.position.x *= -1;
  otherRest.rotation.z *= -1;
  body.add(otherRest);
  // Sculpted face, with features projected onto the same curved surface.
  function wf(y) {
    return 0.635 * (1 + 0.32 * Math.min(0, y / 0.735));
  }
  const face = surface(
    head,
    52,
    36,
    (u, v) => {
      let a = u * TAU,
        b = (0.001 + v * 0.998) * PI,
        y = 0.735 * Math.cos(b);
      return [
        wf(y) * Math.sin(b) * Math.sin(a),
        y + Math.max(0, -y - 0.39) * 0.31,
        0.53 * Math.sin(b) * Math.cos(a),
      ];
    },
    skin,
  );
  const expression = finishFace(face);
  for (let q of [-1, 1]) {
    // Leaf-shaped elfin ears, with a raised rim and a warm inset.
    for (let j = 0; j < 2; j++) {
      let s = j ? 0.66 : 1;
      surface(
        head,
        24,
        12,
        (u, v) => {
          let x = 0.48 + u * 0.58 * s + (j ? 0.075 : 0),
            cy = -0.105 + u * 0.32,
            ry = 0.164 * (1 - u) ** 0.75 * s + 0.002,
            a = v * TAU;
          return [
            q * x,
            cy + ry * Math.cos(a),
            -0.01 + ry * 0.64 * Math.sin(a) + (j ? 0.079 : 0),
          ];
        },
        j ? blush : skin,
      );
    }
    line(
      head,
      [
        [q * 0.69, -0.02, 0.05],
        [q * 0.695, -0.15, 0.058],
        [q * 0.7, -0.2, 0.055],
      ],
      0.011,
      gold,
    );
    star(head, q * 0.7, -0.237, 0.056, 0.058, gold);
  }
  makeFringe(head);
  for (let i = 0; i < 15; i++) {
    let a = 1.12 + (i * (TAU - 2.24)) / 14,
      s = Math.sin(a),
      c = Math.cos(a),
      len = 1.28 + 0.59 * (0.5 + 0.5 * Math.cos(i * 2.3));
    let g = grp(head);
    g.position.set(s * 0.49, 0.17, c * 0.43);
    tails.push(g);
    let path = [
      [0, 0.3, 0],
      [s * 0.15, -0.21, c * 0.15],
      [s * 0.29, -0.75, c * 0.18],
      [s * 0.48 + 0.11 * Math.sin(i), -len, c * 0.29],
      [s * 0.33 + 0.14 * Math.sin(i), -len - 0.33, c * 0.32],
    ];
    let o = lock(g, path, 0.153, 0.105, i % 3 ? hair : deep);
    const geo = o.geometry,
      cols = [];
    let col = new T.Color();
    for (let k = 0; k < geo.attributes.position.count; k++) {
      col
        .copy(i % 3 ? hair.color : deep.color)
        .lerp(tip.color, Math.max(0, (Math.floor(k / 13) / 18 - 0.48) * 1.8));
      cols.push(col.r, col.g, col.b);
    }
    geo.setAttribute("color", new T.Float32BufferAttribute(cols, 3));
    o.material = mat(0xffffff);
    o.material.vertexColors = true;
  }
  for (let q of [-1, 1]) {
    lock(
      head,
      [
        [q * 0.42, 0.49, 0.22],
        [q * 0.57, 0.27, 0.31],
        [q * 0.57, -0.13, 0.33],
        [q * 0.53, -0.42, 0.29],
        [q * 0.63, -0.67, 0.3],
      ],
      0.12,
      0.052,
      lightHair,
    );
    line(
      head,
      [
        [q * 0.52, 0.38, 0.35],
        [q * 0.6, 0.16, 0.35],
        [q * 0.59, -0.09, 0.37],
      ],
      0.009,
      glint,
    );
  }
  // Ruffled maid headdress: a continuous pleated fan with gold piping.
  function band(t, r, z) {
    let a = -1.4 + t * 2.8;
    return [
      Math.sin(a) * r,
      0.085 + Math.cos(a) * r,
      z + 0.17 - 0.06 * Math.abs(Math.sin(a)),
    ];
  }
  surface(
    head,
    120,
    8,
    (u, v) =>
      band(
        u,
        0.65 + v * (0.135 + 0.019 * Math.cos(u * TAU * 10)),
        0.105 + 0.042 * Math.cos(u * TAU * 10) * v,
      ),
    silk,
  );
  surface(head, 65, 6, (u, v) => band(u, 0.62 + 0.07 * v, 0.139), navy);
  for (let r of [0.622, 0.687])
    line(
      head,
      Array.from({ length: 36 }, (_, i) => band(i / 35, r, 0.15)),
      0.009,
      gold,
    );
  for (let q of [-1, 1]) {
    bow(head, q * 0.643, 0.193, 0.24, 0.51, teal);
    star(head, q * 0.635, 0.21, 0.296, 0.047, gold);
  }
  line(
    head,
    [
      [0.06, 0.69, -0.06],
      [0.14, 0.91, -0.04],
      [0.34, 0.98, -0.02],
      [0.49, 0.86, 0.03],
    ],
    0.014,
    lightHair,
  );
  return {
    root,
    animate(t, motion, snap = false) {
      expression(motion === "pose" || t % 4.7 > 4.53);
      arm.visible = motion !== "idle";
      otherRest.visible = !arm.visible;
      body.position.y = 0.018 * Math.sin(t * 2);
      head.rotation.z = -0.046 + 0.022 * Math.sin(t * 1.6);
      head.rotation.y = 0.05 * Math.sin(t * 0.9);
      head.rotation.x = 0.024 * Math.sin(t * 1.5);
      let a =
        motion === "idle"
          ? 1.87
          : motion === "wave"
            ? -0.16 + 0.24 * Math.sin(t * 5)
            : 0.028 * Math.sin(t * 2);
      arm.rotation.z = snap ? a : T.MathUtils.lerp(arm.rotation.z, a, 0.14);
      hand.rotation.z =
        motion === "wave" ? -0.26 + 0.3 * Math.sin(t * 5) : -0.57;
      tails.forEach(
        (g, i) => (g.rotation.z = 0.026 * Math.sin(t * 1.7 + i * 0.45)),
      );
    },
  };
}
