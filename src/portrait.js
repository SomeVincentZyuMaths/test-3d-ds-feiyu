import * as T from "three";

// A UV portrait painted for the face mesh, not a camera-facing sprite.
// Its silhouette, ears, hair and eyelids stay attached when the camera orbits.
function paintFace(closed) {
  const paper = document.createElement("canvas");
  paper.width = 1024;
  paper.height = 1024;
  const g = paper.getContext("2d");
  g.scale(2, 2);
  const path = (d, fill) => {
    g.fillStyle = fill;
    g.fill(new Path2D(d));
  };
  const dot = (x, y, rx, ry, c) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fillStyle = c;
    g.fill();
  };
  const skin = g.createLinearGradient(0, 140, 0, 512);
  skin.addColorStop(0, "#f5c5b9");
  skin.addColorStop(0.39, "#ffeded");
  skin.addColorStop(0.76, "#fff0e7");
  skin.addColorStop(1, "#efc9bf");
  g.fillStyle = skin;
  g.fillRect(0, 0, 512, 512);
  for (const s of [-1, 1]) {
    g.save();
    g.translate(256 + s * 96, 298);
    g.scale(s * 1.03, 1.02);
    const bloom = g.createRadialGradient(29, 39, 1, 29, 39, 51);
    bloom.addColorStop(0, "#f5a7aeab");
    bloom.addColorStop(0.56, "#f8b4b95a");
    bloom.addColorStop(1, "#f8b4b900");
    g.save();
    g.translate(0, 17);
    g.scale(1, 0.65);
    dot(29, 39, 52, 52, bloom);
    g.restore();
    for (let i = 0; i < 3; i++)
      path(`M${15 + 9 * i} 37l-4 9 1.8 1 5-8Z`, "#df9fa5");
    path("M-50 -46Q-11 -60 39 -46Q15 -56 -12 -56Q-40 -55 -50 -46Z", "#73647b");
    if (closed) {
      path(
        "M-62 -2Q-15 21 36 7Q50 3 61 -7L53 3 68 -1Q54 14 36 16Q-12 27 -62 -2Z",
        "#392c39",
      );
    } else {
      const opening =
        "M-62 -9Q-22 -22 46 -17Q61 -15 63 -12Q58 32 27 43Q-20 56 -48 27Q-58 14 -62 -9Z";
      path(opening, "#fff9f7");
      g.save();
      g.clip(new Path2D(opening));
      const iris = g.createLinearGradient(0, -25, 0, 48);
      iris.addColorStop(0, "#242842");
      iris.addColorStop(0.45, "#465786");
      iris.addColorStop(0.75, "#658bb6");
      iris.addColorStop(1, "#a9d7e9");
      dot(0, 5, 42, 43, "#474356");
      dot(0, 4, 39, 42, iris);
      dot(-1, 2, 9, 12, "#344269");
      dot(-17, -12, 9, 10, "#fbfdff");
      dot(19, 25, 3, 3, "#c6edff");
      g.restore();
      path(
        "M-65 -6Q-45 -22 16 -23Q43 -23 60 -17L72 -22 64 -12 74 -13Q64 -4 54 -5Q18 -18 -26 -12Q-49 -11 -65 -6Z",
        "#332733",
      );
      path("M-39 32Q-16 51 15 45Q-12 53 -39 32Z", "#b98385");
    }
    g.restore();
  }
  g.translate(0, 36);
  path("M249 316q5 2 10 -1q-3 5 -9 4Z", "#e4afa8");
  path(
    closed
      ? "M229 349q22 11 47 -3q-18 18 -47 3Z"
      : "M241 350q13 -5 29 1q-18 -3 -29 1Z",
    "#ac7378",
  );
  const tx = new T.CanvasTexture(paper);
  tx.colorSpace = T.SRGBColorSpace;
  tx.anisotropy = 4;
  return tx;
}
export function finishFace(mesh) {
  const positions = mesh.geometry.attributes.position,
    uv = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    uv.push(z < -0.055 ? 0.025 : 0.5 + x / 1.36, 0.5 + y / 1.47);
  }
  mesh.geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  const maps = [paintFace(false), paintFace(true)],
    m = new T.MeshBasicMaterial({ map: maps[1], side: T.DoubleSide });
  mesh.material = m;
  return (closed) => {
    m.map = maps[Number(closed)];
  };
}

// One continuous scalp sheet with asymmetric pointed sections and painted sheen.
// The locks share a crown, avoiding the seams and round lobes of separate ellipsoids.
export function makeFringe(head) {
  const sections = [
    [-Math.PI, 2.57],
    [-1.52, 2.49],
    [-1.1, 2.15],
    [-0.79, 1.62],
    [-0.55, 1.36],
    [-0.16, 1.44],
    [0.13, 1.66],
    [0.42, 1.36],
    [0.62, 1.47],
    [0.84, 1.69],
    [1.18, 2.25],
    [1.55, 2.5],
    [Math.PI, 2.57],
  ];
  const p = [],
    colors = [],
    ix = [],
    base = new T.Color("#505d97"),
    shade = new T.Color("#333e73"),
    shine = new T.Color("#8297d1");
  const nu = 16,
    nv = 42;
  for (let k = 0; k < sections.length - 1; k++) {
    const [a0, l0] = sections[k],
      [a1, l1] = sections[k + 1],
      start = p.length / 3;
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const t = j / nv,
          u = i / nu,
          front = Math.max(0, Math.cos((a0 + a1) / 2)),
          l =
            T.MathUtils.lerp(l0, l1, u) +
            (0.12 + 0.09 * front) *
              (1 - Math.abs((u - 0.67) / (u < 0.67 ? 0.67 : 0.33))),
          b = 0.009 + t * l;
        const a =
            T.MathUtils.lerp(a0, a1, u) +
            0.52 * (1 - t) ** 1.6 -
            0.18 * t * t +
            0.065 * Math.sin(b * 3) +
            0.09 * Math.sin(Math.PI * u) * t ** 4,
          fold = Math.sin(Math.PI * u) ** 0.7;
        const r = 1 + 0.013 * fold * t;
        const x = Math.sin(a) * Math.sin(b) * 0.667 * r,
          y = 0.765 * Math.cos(b) + 0.03,
          z = 0.58 * Math.cos(a) * Math.sin(b) * r;
        p.push(x, y, z);
        let c = base
          .clone()
          .lerp(shade, 0.68 * (1 - fold) * t + 0.14 * (1 - Math.cos(a)));
        const h = 0.53 + 0.033 * Math.sin(3 * a),
          gloss =
            Math.exp(-((y - h) ** 2) / 0.00165) *
            (0.28 + 0.72 * fold) *
            (0.4 + 0.6 * front);
        const streak =
          Math.exp(-((y - 0.43 - 0.065 * Math.cos(a * 3)) ** 2) / 0.004) *
          Math.max(0, Math.sin((u + 0.14) * Math.PI * 1.13)) ** 4;
        c.lerp(shine, 0.55 * gloss + 0.28 * streak * front);
        colors.push(c.r, c.g, c.b);
        if (i && j) {
          let n = start + j * (nu + 1) + i;
          ix.push(n - nu - 2, n - nu - 1, n, n - nu - 2, n, n - 1);
        }
      }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(p, 3));
  geo.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geo.setIndex(ix);
  geo.computeVertexNormals();
  head.add(
    new T.Mesh(
      geo,
      new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide }),
    ),
  );
}
