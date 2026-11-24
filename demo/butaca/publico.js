// ─────────────────────────────────────────────────────────────────────────────
// El público: una persona sentada en cada butaca ocupada.
//
// Segunda versión. La primera (12-nov) era una bola sobre una caja, de colores
// claros: «muy cutre», y se quitó. Lo que la hace creíble ahora:
//   · la CABEZA tiene forma de cabeza: cráneo más ancho arriba y detrás, nuca,
//     mandíbula estrecha, orejas y cuello. Medidas de adulto: 15 cm de ancho,
//     20 de fondo, 23 de barbilla a coronilla;
//   · el PELO es geometría propia, con siete peinados (corto, melena, media
//     melena, recogido, coleta, rizado y canoso con entradas). Cada uno es un
//     casquete que sigue el cráneo, con su línea de nacimiento, mechones en
//     relieve y brillo de pelo (sheen);
//   · los HOMBROS caen como caen, con cuello de camisa o de abrigo;
//   · colores apagados de verdad: pelo casi negro, castaño oscuro, canoso;
//     abrigos oscuros. Con la sala a media luz se leen como siluetas.
//
// Todo instanciado: por peinado, una malla de piel, una de pelo y una de ropa.
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

// ── colores ──
// pieles algo apagadas: bajo los focos cálidos de la sala una piel saturada
// salía naranja (sobre todo las calvas)
const PIEL = [0xb08a78, 0xa07866, 0xbf9c88, 0x8c6655, 0x6e4c3e, 0xc9ad9c, 0x9a7262];
const PELO = {
  negro: [0x0d0a09, 0x14100e], castano: [0x2a1b12, 0x3a2618, 0x22160f],
  claro: [0x5a4128, 0x6e5434], canoso: [0x5c5855, 0x6e6a67, 0x4a4745],     // gris sucio: un canoso claro parecía una calva
};
const ROPA = [0x15171c, 0x1d1b22, 0x2a1416, 0x172019, 0x23211e, 0x111a28, 0x2e2420, 0x1b1b1b, 0x2a1f29, 0x3b342f];

function azar(id, sal) {
  let h = 2166136261 ^ sal;
  for (const c of id) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}
const elige = (lista, u) => lista[Math.floor(u * lista.length) % lista.length];
const suave = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ── la cabeza ──
// Marco local de la cabeza: centro del cráneo en el origen, la cara mira a −Z.
const RX = 0.076, RY = 0.112, RZ = 0.1;
function formaCabeza(x, y, z) {
  // x, y, z en una esfera unidad → punto de la superficie de la cabeza
  let sx = RX, sy = RY, sz = RZ;
  const abajo = Math.max(0, -y);
  sx *= 1 - 0.32 * abajo * abajo;                 // mandíbula y barbilla, más estrechas
  sz *= 1 - 0.18 * abajo * Math.max(0, z);        // la nuca se recoge hacia el cuello
  let px = x * sx, py = y * sy, pz = z * sz;
  pz += 0.018 * Math.max(0, z) * suave(-0.2, 0.6, y);       // occipital: el cráneo sale por detrás
  py += 0.008 * suave(0.2, 1, y);
  pz -= 0.012 * Math.max(0, -z) * suave(-0.9, -0.2, y);     // la cara, más plana que el cráneo
  return [px, py, pz];
}
function geoCabeza(seg) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.8));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, ...formaCabeza(p.getX(i), p.getY(i), p.getZ(i)));
  const orejas = [-1, 1].map((s) => new THREE.SphereGeometry(0.03, 8, 6).scale(0.35, 1, 0.75).translate(s * 0.074, -0.012, 0.005));
  const cuello = new THREE.CylinderGeometry(0.048, 0.056, 0.14, 14, 1, true).translate(0, -0.135, 0.02);
  const partes = [g, ...orejas, cuello].map((x) => { x.deleteAttribute("uv"); return x.index ? x.toNonIndexed() : x; });
  // soldar vértices ANTES de las normales: sin esto la piel salía facetada,
  // cara a cara, y se veía a cuadros en mejillas y nuca
  const m = mergeVertices(mergeGeometries(partes), 1e-5);
  m.computeVertexNormals();
  return m;
}

// ── el pelo ──
// Un casquete que sigue la cabeza un poco por fuera. `cubre(x,y,z)` dice cuánto
// pelo hay en cada punto (0 = piel); donde no hay, el casquete se hunde dentro
// de la cabeza y no se ve, con transición suave: eso es la línea del pelo.
function geoPelo(seg, { cubre, grosor = 0.012, rizo = 0, extra = [], fino = 1, volumen = null }) {
  // La esfera con los polos a los lados (junto a la oreja, donde no hay pelo):
  // con el polo arriba, todos los vértices se juntaban en la coronilla y salía
  // un punto de luz.
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.85)).rotateZ(Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const [hx, hy, hz] = formaCabeza(x, y, z);
    // La transición pelo/piel, corta y limpia: en la primera prueba era ancha
    // y el casquete pasaba muchas veces por la superficie de la piel —con los
    // mechones encima— y salía un dibujo a cuadros donde los dos se pisaban.
    const ang = Math.atan2(x, z);
    // el borde del pelo no es una línea de compás: se ondula
    const borde = 0.12 * Math.sin(ang * 13 + y * 9) + 0.06 * Math.sin(ang * 29 - y * 5);
    const c = suave(0.35, 0.65, cubre(x, y, z) + borde);
    // Volumen: el pelo no es un casco. Bultos grandes (cómo cae), mechones
    // medianos y surcos finos, sólo donde ya hay pelo de verdad.
    // Antonio (17-nov) los quería más suaves: los surcos finos van a la mitad y
    // sólo se quedan los mechones anchos, que se leen como pelo peinado.
    const bultos = 0.004 * (Math.sin(x * 4 + 1.3) * Math.sin(y * 3.5 - 0.7) + Math.sin(z * 5 + y * 2) * 0.6);
    const mechon = fino * (0.0007 * Math.sin(ang * 61 + y * 10) + 0.0018 * Math.sin(ang * 23 + y * 4))
      + rizo * (Math.sin(ang * 22) * Math.sin(y * 19) * 0.5 + 0.5);
    // en la coronilla todos los surcos convergen en un punto y salía una estrella
    const polo = 1 - suave(0.82, 0.97, y);
    // el relieve va en proporción al grosor y el pelo nunca baja de 3 mm: en el
    // rapado los bultos eran más hondos que el pelo y asomaba la piel a manchas
    const relieve = Math.min(1, grosor / 0.012) * (bultos + mechon * polo) * suave(0.8, 1, c);
    const k = c * Math.max(0.003, grosor + (volumen ? volumen(x, y, z) : 0) + relieve);
    // Donde no hay pelo el casquete se mete MUY dentro del cráneo (a media
    // distancia del centro). Hundido sólo 2,5 cm seguía rozando el cuello y
    // las mejillas, y salían cuadros de pelo y piel peleándose.
    const dentro = 1 - (1 - c) * 0.5;
    const n = Math.hypot(hx, hy, hz) || 1;
    p.setXYZ(i, hx * dentro + (hx / n) * k, hy * dentro + (hy / n) * k, hz * dentro + (hz / n) * k);
  }
  g.deleteAttribute("uv");
  const partes = [g.toNonIndexed(), ...extra.map((x) => { x.deleteAttribute("uv"); return x.index ? x.toNonIndexed() : x; })];
  const m = mergeVertices(mergeGeometries(partes), 1e-5);
  m.computeVertexNormals();
  return m;
}

// Línea del pelo: frente despejada por debajo de la raya del nacimiento,
// piel alrededor de la oreja y por debajo de la nuca. 1 = pelo, 0 = piel.
// Coordenadas de la esfera unidad; la cara mira a −Z.
const lineaNormal = (x, y, z, nuca = -0.45) => {
  const delante = suave(0.1, 0.5, -z);
  const frente = delante * (1 - suave(0.25, 0.45, y));
  const debajo = 1 - suave(nuca - 0.12, nuca + 0.08, y);
  const oreja = suave(0.72, 0.9, Math.abs(x)) * (1 - suave(0.0, 0.15, y)) * (1 - suave(0.15, 0.45, z));
  return 1 - Math.max(frente, debajo, oreja);
};

function peinados(seg) {
  const s = seg;
  return [
    { id: "corto", hombros: 1.06, pelo: geoPelo(s, { cubre: (x, y, z) => lineaNormal(x, y, z, -0.35), grosor: 0.009 }), tonos: ["negro", "castano", "castano", "claro"] },
    { id: "rizado", hombros: 1.0, pelo: geoPelo(s, { cubre: (x, y, z) => lineaNormal(x, y, z, -0.4), grosor: 0.018, rizo: 0.01 }), tonos: ["negro", "castano"] },
    // rapado al uno: casi la forma del cráneo
    { id: "rapado", hombros: 1.08, pelo: geoPelo(s, { cubre: (x, y, z) => lineaNormal(x, y, z, -0.32), grosor: 0.004, fino: 0.3 }), tonos: ["negro", "castano", "canoso"] },
    // (el calvo se quitó: con una cabeza tan sencilla, de espaldas y bajo un
    // foco, parecía un huevo con una cinta; el rapado cubre a esa gente)
    // tupé: volumen arriba y delante
    {
      id: "tupe", hombros: 1.06, tonos: ["negro", "castano", "claro"],
      pelo: geoPelo(s, { cubre: (x, y, z) => lineaNormal(x, y, z, -0.36), grosor: 0.008,
        volumen: (x, y, z) => 0.022 * suave(0.3, 0.75, y) * suave(-0.4, 0.4, -z) }),
    },
    // afro: mucho volumen, rizo apretado
    { id: "afro", peso: 0.5, hombros: 1.0, pelo: geoPelo(s, { cubre: (x, y, z) => lineaNormal(x, y, z, -0.55), grosor: 0.042, rizo: 0.007, fino: 0.4 }), tonos: ["negro", "castano"] },
    // largo y liso hasta media espalda
    {
      id: "largoLiso", hombros: 0.9, tonos: ["negro", "castano", "claro"],
      pelo: geoPelo(s, {
        cubre: (x, y, z) => lineaNormal(x, y, z, -1.2), grosor: 0.012, fino: 0.6,
        extra: [new THREE.CylinderGeometry(0.098, 0.16, 0.46, 28, 6, true, Math.PI * 0.16, Math.PI * 0.68)
          .translate(0, -0.27, 0.014)],
      }),
    },
    {
      id: "canoso", hombros: 1.05, tonos: ["canoso"],
      // entradas y coronilla clara: sólo la herradura de los lados y la nuca
      // entradas delante; la coronilla se queda (sin ella parecía una calva)
      pelo: geoPelo(s, { cubre: (x, y, z) => lineaNormal(x, y, z, -0.38) * (1 - 0.9 * suave(0.35, 0.6, y) * suave(0.0, 0.5, -z)), grosor: 0.007 }),
    },
    {
      id: "melena", hombros: 0.9, tonos: ["negro", "castano", "claro"],
      pelo: geoPelo(s, {
        cubre: (x, y, z) => lineaNormal(x, y, z, -1.2),
        grosor: 0.014,
        // la caída por la espalda hasta los hombros
        extra: [new THREE.CylinderGeometry(0.095, 0.13, 0.3, 24, 4, true, Math.PI * 0.18, Math.PI * 0.64)
          .translate(0, -0.2, 0.012)],
      }),
    },
    {
      id: "media", hombros: 0.92, tonos: ["negro", "castano", "claro", "canoso"],
      // media melena: cubre hasta la mandíbula, con algo de vuelo abajo
      pelo: geoPelo(s, { cubre: (x, y, z) => lineaNormal(x, y, z, -0.95), grosor: 0.016 }),
    },
    {
      id: "recogido", hombros: 0.9, tonos: ["negro", "castano", "claro", "canoso"],
      pelo: geoPelo(s, {
        cubre: (x, y, z) => lineaNormal(x, y, z, -0.4), grosor: 0.008,
        extra: [new THREE.SphereGeometry(0.042, 14, 10).scale(1, 0.85, 0.8).translate(0, 0.045, 0.118)],
      }),
    },
    {
      // moño bajo en la nuca (la coleta, vista de espaldas, parecía un palo)
      id: "monoBajo", hombros: 0.9, tonos: ["negro", "castano", "claro"],
      pelo: geoPelo(s, {
        cubre: (x, y, z) => lineaNormal(x, y, z, -0.45), grosor: 0.008,
        extra: [new THREE.SphereGeometry(0.045, 16, 12).scale(1.15, 0.8, 0.75).translate(0, -0.075, 0.115)],
      }),
    },
  ];
}

// ── el cuerpo: hombros y torso apoyados en el respaldo ──
function geoCuerpo(seg) {
  const torso = new THREE.CapsuleGeometry(0.17, 0.3, Math.round(seg / 3), seg);
  const p = torso.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    x *= 1.22; z *= 0.62;
    // caída de hombros: arriba y hacia los lados el torso baja
    const arriba = suave(0.1, 0.32, y);
    y -= arriba * 0.55 * x * x * 4;
    // el pecho un poco adelante, la espalda recta contra el respaldo
    z -= 0.02 * suave(-0.1, 0.2, y) * (z < 0 ? 1 : 0);
    p.setXYZ(i, x, y, z);
  }
  torso.rotateX(0.12).translate(0, 0.79, 0.12);
  const brazos = [-1, 1].map((s) => new THREE.CapsuleGeometry(0.045, 0.2, 4, 10).rotateZ(s * 0.12).rotateX(0.35).translate(s * 0.2, 0.8, 0.05));
  const muslos = new THREE.CapsuleGeometry(0.075, 0.3, 4, 10).rotateX(Math.PI / 2).scale(2.2, 1, 1).translate(0, 0.53, -0.08);
  const cuello = new THREE.TorusGeometry(0.06, 0.018, 6, 16).rotateX(Math.PI / 2).scale(1.1, 1, 0.95).translate(0, 1.05, 0.135);
  const partes = [torso, ...brazos, muslos, cuello].map((x) => { x.deleteAttribute("uv"); return x.index ? x.toNonIndexed() : x; });
  const m = mergeVertices(mergeGeometries(partes), 1e-5);
  m.computeVertexNormals();
  return m;
}

// dónde va la cabeza respecto a la butaca: el ojo sentado queda a 1,15
const CABEZA = new THREE.Vector3(0, 1.165, 0.115);

export function construirPublico(sala, ocupadas, { detalle = "alto" } = {}) {
  // con 24 segmentos el borde pelo/piel iba a saltos de 1,5 cm: cuadros
  const seg = detalle === "bajo" ? 20 : 40;
  const lista = sala.butacas.filter((b) => ocupadas.has(b.id));
  const grupo = new THREE.Group();
  grupo.name = "PUBLICO";

  const mPiel = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.82, sheen: 0.15, sheenColor: new THREE.Color(0xffd0c0), sheenRoughness: 0.6 });
  const mPelo = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.72, sheen: 0.8, sheenColor: new THREE.Color(0x6a5d52), sheenRoughness: 0.5 });
  const mRopa = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.88, sheen: 0.6, sheenColor: new THREE.Color(0x6a6670), sheenRoughness: 0.6 });
  const materiales = [mPiel, mPelo, mRopa];

  const cabeza = geoCabeza(seg), cuerpo = geoCuerpo(seg), estilos = peinados(seg);
  const porEstilo = new Map(estilos.map((e) => [e.id, []]));
  // reparto con pesos: hay peinados que no deben salir tanto como el corto
  const total = estilos.reduce((t, e) => t + (e.peso ?? 1), 0);
  const elegirEstilo = (u) => {
    let a = u * total;
    for (const e of estilos) { a -= e.peso ?? 1; if (a <= 0) return e; }
    return estilos[estilos.length - 1];
  };
  for (const b of lista) porEstilo.get(elegirEstilo(azar(b.id, 7)).id).push(b);

  const registro = [];        // [{ b, mallas: [piel, pelo, ropa], i }] para apartar a los vecinos
  const m = new THREE.Matrix4(), mh = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  for (const est of estilos) {
    const bs = porEstilo.get(est.id);
    if (!bs.length) continue;
    const imPiel = new THREE.InstancedMesh(cabeza, mPiel, bs.length);
    const imPelo = new THREE.InstancedMesh(est.pelo, mPelo, bs.length);
    const imRopa = new THREE.InstancedMesh(cuerpo, mRopa, bs.length);
    bs.forEach((b, i) => {
      // Altura sentada: hay de todo, de 1,02 a 1,27 m de ojo, con más gente en
      // el medio (suma de dos azares). Es lo que decide si la cabeza de
      // delante tapa o no, así que importa que varíe de verdad.
      const talla = 0.89 + (azar(b.id, 1) + azar(b.id, 13)) * 0.11;
      // complexión: hombros según el peinado (más estrechos con melena) y algo
      // de azar; unos se echan un poco hacia delante
      const ancho = (est.hombros || 1) * (0.92 + azar(b.id, 3) * 0.16);
      e.set((azar(b.id, 14) - 0.6) * 0.08, b.giro + (azar(b.id, 2) - 0.5) * 0.18, 0, "YXZ");
      q.setFromEuler(e);
      p.set(b.x, b.y, b.z);
      s.set(ancho, talla, 0.94 + azar(b.id, 15) * 0.14);
      m.compose(p, q, s);
      imRopa.setMatrixAt(i, m);
      // la cabeza, con su propia inclinación: nadie mira igual
      e.set((azar(b.id, 8) - 0.45) * 0.16, (azar(b.id, 9) - 0.5) * 0.3, (azar(b.id, 10) - 0.5) * 0.12, "YXZ");
      const local = new THREE.Matrix4().compose(CABEZA.clone().setY(CABEZA.y * talla),
        new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(1, 1, 1).multiplyScalar(0.96 + azar(b.id, 11) * 0.08));
      mh.multiplyMatrices(new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, b.giro, 0)), new THREE.Vector3(1, 1, 1)), local);
      imPiel.setMatrixAt(i, mh);
      imPelo.setMatrixAt(i, mh);
      registro.push({ b, mallas: [imPiel, imPelo, imRopa], i });
      imPiel.setColorAt(i, c.setHex(elige(PIEL, azar(b.id, 4))));
      imPelo.setColorAt(i, c.setHex(elige(PELO[elige(est.tonos, azar(b.id, 5))], azar(b.id, 6))));
      imRopa.setColorAt(i, c.setHex(elige(ROPA, azar(b.id, 12))));
    });
    for (const im of [imPiel, imPelo, imRopa]) {
      im.name = `PUBLICO_${est.id}`;
      im.castShadow = false;
      // sin sombras arrojadas: el mapa del foco frontal es grueso para algo tan
      // pequeño como una mejilla y salían cuadros
      im.receiveShadow = false;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      grupo.add(im);
    }
  }
  // Los vecinos de tu misma fila, a medio metro, salen enormes en primer plano
  // y tapan media vista; desde una butaca de verdad se ven de reojo, no
  // delante. En la vista desde la butaca se apartan (escala cero) y se
  // devuelven al salir.
  const guardadas = new Map();
  grupo.userData.apartarVecinos = (b0) => {
    for (const [r, mats] of guardadas) r.mallas.forEach((im, k) => { im.setMatrixAt(r.i, mats[k]); im.instanceMatrix.needsUpdate = true; });
    guardadas.clear();
    if (!b0) return;
    const cero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const r of registro) {
      if (r.b.seccion !== b0.seccion || r.b.fila !== b0.fila) continue;
      if (Math.hypot(r.b.x - b0.x, r.b.z - b0.z) > 0.8) continue;
      guardadas.set(r, r.mallas.map((im) => { const mm = new THREE.Matrix4(); im.getMatrixAt(r.i, mm); return mm; }));
      for (const im of r.mallas) { im.setMatrixAt(r.i, cero); im.instanceMatrix.needsUpdate = true; }
    }
  };
  /** 0 = invisible, 1 = del todo. Para que la sala se llene poco a poco. */
  grupo.userData.opacidad = (o) => {
    grupo.visible = o > 0.001;
    for (const mt of materiales) {
      const t = o < 0.999;
      if (mt.transparent !== t) { mt.transparent = t; mt.needsUpdate = true; }
      mt.opacity = o;
    }
  };
  return grupo;
}
