// ─────────────────────────────────────────────────────────────────────────────
// La ruta de la cámara del plano a tu butaca.
//
// UN solo movimiento suave de A (la vista cenital que casa con el plano) a B
// (tu ojo). Antonio (17-nov) no quería una ruta por tramos —bajar, girar,
// acercarse, sentarse—: se leía como varios movimientos. Ahora es una única
// curva sin puntos de paso y con la curvatura continua:
//   · casi siempre, una Bézier cúbica con dos tiradores (arriba, y desde dónde
//     se llega a la butaca: por detrás, por delante o por la boca del palco);
//   · bajo el anfiteatro, donde hay que entrar por el hueco entre las cabezas
//     y el forjado, una B-spline con algunos tiradores más.
// Cada curva se comprueba con rayos contra la arquitectura, la lámpara y las
// cabezas; si toca algo se prueba la siguiente opción.
import * as THREE from "three";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ARRIBA = V(0, 1, 0);
const rc = new THREE.Raycaster();
rc.firstHitOnly = true;

function rayo(o, d, lejos, lista) {
  rc.set(o, d);
  rc.near = 0;
  rc.far = lejos;
  const h = rc.intersectObjects(lista, false);
  return h.length ? h[0] : null;
}
// las caras sólo cuentan vistas de frente: un tramo se tira en los dos sentidos
function cruce(a, b, lista) {
  const d = b.clone().sub(a), L = d.length();
  if (L < 1e-4) return null;
  d.divideScalar(L);
  return rayo(a, d, L, lista) || rayo(b, d.clone().negate(), L, lista);
}

// B-spline cúbica sujeta: UNA curva suave (sin esquinas: curvatura continua)
// que empieza en el primer punto de control y acaba en el último, sin pasar
// por los demás. A diferencia de la Bézier, cada punto sólo influye en su
// zona: la salida a 100 m de altura no arrastra el tramo bajo el anfiteatro.
class BSpline extends THREE.Curve {
  constructor(ctrl) {
    super();
    this.ctrl = ctrl;
    const n = ctrl.length, u = [0, 0, 0, 0];
    for (let i = 1; i < n - 3; i++) u.push(i);
    u.push(n - 3, n - 3, n - 3, n - 3);
    this.u = u;
    this._d = [0, 1, 2, 3].map(() => new THREE.Vector3());
  }
  getPoint(t, out = new THREE.Vector3()) {
    const n = this.ctrl.length, u = this.u, x = Math.min(t, 1 - 1e-9) * (n - 3);
    let k = 3;
    while (k < n - 1 && u[k + 1] <= x) k++;
    const d = this._d;
    for (let j = 0; j < 4; j++) d[j].copy(this.ctrl[j + k - 3]);
    for (let r = 1; r <= 3; r++) {
      for (let j = 3; j >= r; j--) {
        const i = j + k - 3;
        const a = (x - u[i]) / (u[i + 4 - r] - u[i]);
        d[j].multiplyScalar(a).addScaledVector(d[j - 1], 1 - a);
      }
    }
    return out.copy(d[3]);
  }
}

export function prepararRutas(sala, datos) {
  // Lo sólido de la sala. Fuera los haces de luz (aditivos), las sombras de
  // contacto (transparentes) y el piano, que está en el escenario.
  const solidas = [];
  sala.grupo.updateMatrixWorld(true);
  const dentroDe = (o, n) => { for (let p = o; p; p = p.parent) if (p.name === n) return true; return false; };
  sala.grupo.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m && m.transparent && !m.depthWrite) return;
    if (o.name === "LETRAS_FILA" || o.name === "SOMBRAS_BUTACAS" || dentroDe(o, "HACES") || dentroDe(o, "PIANO")) return;
    solidas.push(o);
  });

  // Con un árbol de cajas los rayos van de sobra; sin él también funciona,
  // sólo que más despacio. Se carga en segundo plano al arrancar.
  import("https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.7.8/build/index.module.js").then((bvh) => {
    for (const m of solidas) {
      if (!m.geometry.boundsTree) m.geometry.boundsTree = new bvh.MeshBVH(m.geometry);
      m.raycast = bvh.acceleratedRaycast;
    }
  }).catch(() => {});

  const H = sala.limites.altoSala;
  const L = sala.lampara;                      // la araña: un cilindro que no se toca
  // La araña mide 1,2 m de radio y cuelga hasta 0,5 m bajo su centro. A su
  // altura se pasa a 3 m en horizontal (más cerca, aunque no la toque, llena la
  // pantalla de destellos); por debajo, a 0,8 m de su parte baja, ya no estorba.
  const lejosDeLampara = (p) => Math.hypot(p.x - L.x, p.z - L.z) > 3.0 || p.y < L.y - 1.3;
  const techo = (p) => { const h = rayo(p, ARRIBA, 60, solidas); return h ? h.point.y : 999; };
  const e = datos.escenario;
  const mira = V(0, e.embocaduraY + e.embocaduraAlto * 0.2, -e.fondo * 0.2);

  // Por encima de las cabezas (y de los respaldos) de todas las butacas menos
  // la tuya: 30 cm sobre el ojo de cualquier butaca que quede debajo.
  // rejilla de 1 m para no recorrer las 479 butacas en cada punto
  const rejilla = new Map(), celda = (x, z) => `${Math.floor(x)},${Math.floor(z)}`;
  let ojoMax = -Infinity;
  for (const s of sala.butacas) {
    ojoMax = Math.max(ojoMax, s.ojo.y);
    for (const dx of [-0.34, 0.34]) for (const dz of [-0.4, 0.4]) {
      const k = celda(s.x + dx, s.z + dz);
      if (!rejilla.has(k)) rejilla.set(k, new Set());
      rejilla.get(k).add(s);
    }
  }
  const sobreCabezas = (pts, propia) => {
    for (const p of pts) {
      if (p.y > ojoMax + 0.3) continue;
      for (const s of rejilla.get(celda(p.x, p.z)) || []) {
        if (s === propia) continue;
        if (Math.abs(s.x - p.x) < 0.34 && Math.abs(s.z - p.z) < 0.4 && p.y < s.ojo.y + 0.3 && p.y > s.y - 0.2) return false;
      }
    }
    return true;
  };
  const tramoLibre = (a, b, propia) => {
    if (cruce(a, b, solidas)) return false;
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push(a.clone().lerp(b, i / 8));
    return sobreCabezas(pts, propia) && pts.every(lejosDeLampara);
  };

  /**
   * UN solo movimiento de A (la cámara cenital, `desde`) a B (tu ojo): una
   * curva de Bézier cúbica, sin puntos de paso. Antonio (17-nov): la ruta por
   * tramos —bajar, girar, acercarse, sentarse— se leía como varios movimientos.
   *
   * La curva sólo tiene dos tiradores:
   *   T1, por encima del tejado: hacia dónde arranca la bajada;
   *   T2, junto a la butaca: desde dónde se llega a ella (por detrás y algo
   *       más alto si hay sitio; por delante bajo el anfiteatro; por la boca
   *       en los palcos). La cámara entra en B en la dirección T2 → B.
   * Se prueban tiradores de más a menos amplios y se queda la primera curva
   * que no toca nada. Devuelve { curva, como }.
   */
  function planear(b, desde, razones = null) {
    const no = (r) => { if (razones) razones.push(r); };
    const ojo = V(b.ojo.x, b.ojo.y, b.ojo.z);
    const dir = V(mira.x - ojo.x, 0, mira.z - ojo.z).normalize();   // hacia la escena
    const centro = V(-Math.sign(ojo.x) || 1, 0, 0);                   // hacia el eje de la sala
    const giro = (v, a) => V(v.x * Math.cos(a) - v.z * Math.sin(a), 0, v.x * Math.sin(a) + v.z * Math.cos(a));

    // Con el anfiteatro encima (patio de atrás) la curva simple nunca cabe:
    // directamente la de bajo el forjado.
    if (b.seccion === "patio" && techo(ojo) < H - 0.8) {
      const r = bajoForjado(b, desde, ojo, dir, no);
      if (r) return r;
    }
    const llegadas = [];
    for (const a of [0, 0.4, -0.4]) llegadas.push(["detras", giro(dir, Math.PI + a)]);
    for (const a of [0, 0.35, -0.35]) llegadas.push(["delante", giro(dir, a)]);
    for (const a of [0, 0.35, -0.35]) llegadas.push(["boca", giro(centro, a)]);
    // en los palcos, detrás sólo hay la pared del palco: se prueba primero
    // por delante y por la boca
    if (b.seccion.startsWith("palco")) llegadas.push(...llegadas.splice(0, 3));

    for (const [como, ir] of llegadas) {
      for (const largo of [4.5, 3.2, 6.5, 2.2, 9, 12]) {
        // T2: alejado de la butaca en esa dirección y algo más alto, sin pasar
        // del techo más bajo que haya por el camino (el anfiteatro, un palco)
        const base = ojo.clone().addScaledVector(ir, largo);
        let t0 = 999;
        for (let i = 1; i <= 8; i++) t0 = Math.min(t0, techo(ojo.clone().lerp(V(base.x, ojo.y + 0.05, base.z), i / 8)));
        const y2 = Math.min(ojo.y + largo * 0.45, t0 - 0.45);
        const id = `${como} ${largo}`;
        if (y2 < ojo.y + 0.05) { no(`${id} techo bajo`); continue; }
        const T2 = base.setY(y2);
        // T1: más allá de T2 en la misma dirección; primero por encima del
        // tejado (la bajada más amplia) y, si así choca —bajo el anfiteatro—,
        // más bajo, para que la curva entre deslizándose casi en horizontal
        for (const alto of [H + 4 + largo * 0.6, H * 0.75, y2 + 2.5, y2 + 1]) {
          for (const mas of [0.6, 1.4, 0.2, 2.4]) {
            const T1 = ojo.clone().addScaledVector(ir, largo * (1 + mas)).setY(alto);
            const curva = new THREE.CubicBezierCurve3(desde.clone(), T1, T2, ojo);
            if (curvaLibre(curva, b)) return { curva, como: `${id} ${mas} ${alto.toFixed(1)}` };
            no(`${id} T1 ${alto.toFixed(1)}/${mas}: ${ultimoChoque}`);
          }
        }
        no(`${id} curva ${cual(T2, ojo, b)}`);
      }
    }
    // Bajo el anfiteatro no cabe con dos tiradores: hay que entrar bajo su
    // borde por el hueco entre las cabezas y el forjado, y luego bajar sobre la
    // butaca. Sigue siendo UNA curva, con más puntos de control.
    return bajoForjado(b, desde, ojo, dir, no);
  }

  function bajoForjado(b, desde, ojo, dir, no) {
    const deLado = V(Math.sign(ojo.x - L.x) || 1, 0, 0);
    const giro = (v, a) => V(v.x * Math.cos(a) - v.z * Math.sin(a), 0, v.x * Math.sin(a) + v.z * Math.cos(a));
    for (const a of [0, 0.3, -0.3, 0.6, -0.6]) {
      const ir = giro(dir, a);
      // hasta dónde llega el forjado en esa dirección, y su punto más bajo
      let d = 0.5, bajo = techo(ojo.clone().add(V(0, 0.05, 0)));
      for (; d < 14; d += 0.25) {
        const t = techo(ojo.clone().addScaledVector(ir, d).add(V(0, 0.05, 0)));
        if (t > H - 0.8) break;
        bajo = Math.min(bajo, t);
      }
      if (d >= 14) continue;
      // el pasillo de aire: por debajo del borde y por encima de las cabezas
      const yPaso = bajo - 0.4;
      const sobreSitio = Math.min(techo(ojo) - 0.4, ojo.y + 1.0);
      for (const fuera of [1.5, 2.5, 3.5]) {
        // F: delante del borde, apartado de la lámpara si hace falta
        const F = ojo.clone().addScaledVector(ir, d + fuera);
        if (Math.hypot(F.x - L.x, F.z - L.z) < 2.2) F.x = L.x + deLado.x * 2.3;
        for (const yF of [yPaso + 0.6, yPaso + 1.5, yPaso]) {
          const borde = ojo.clone().addScaledVector(ir, d + 0.3);
          const ctrl = [
            desde.clone(),
            V(F.x, H + 6, F.z),                                    // la bajada, delante del anfiteatro
            V(F.x, yF, F.z),
            V(borde.x, yPaso, borde.z),                            // justo delante del borde
            ojo.clone().addScaledVector(ir, d * 0.6).setY(yPaso),  // ya debajo
            ojo.clone().addScaledVector(ir, 0.3).setY(sobreSitio), // encima de tu butaca
            ojo.clone(),
          ];
          const curva = new BSpline(ctrl);
          const id = `forjado ${a} ${fuera} ${yF.toFixed(1)}`;
          if (curvaLibre(curva, b)) return { curva, como: id };
          no(`${id}: ${ultimoChoque}`);
        }
      }
    }
    return null;
  }

  const cual = (a, c, b) => {
    const h = cruce(a, c, solidas);
    if (h) return `${h.object.name || h.object.parent?.name || "?"} @${h.point.toArray().map((n) => n.toFixed(2))}`;
    return "cabezas/lampara";
  };
  // La curva suaviza las esquinas y puede recortar por dentro: se comprueba
  // entera, a trozos, desde que entra en la sala.
  let ultimoChoque = "";
  function curvaLibre(curva, b) {
    const pts = curva.getSpacedPoints(500);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], c = pts[i];
      if (a.y > H - 0.3 || c.y > H - 0.3) continue;      // por encima del tejado no hay nada
      if (!tramoLibre(a, c, b)) { ultimoChoque = `${cual(a, c, b)} en ${a.toArray().map((n) => n.toFixed(1))}`; return false; }
    }
    return true;
  }

  return { planear, mira };
}

/**
 * Tabla para recorrer la curva con un ritmo de grúa: la velocidad es
 * proporcional a lo que queda de camino (más medio metro), como un zoom.
 * Arriba recorre decenas de metros en un instante; al llegar a tu butaca va
 * despacio, que es donde se mira. Devuelve u(e) → parámetro de la curva.
 */
export function ritmo(curva, r0 = 1.4) {
  const N = 4000;           // con 600, en el primer tramo largo (60 m) daba un tirón de 30 cm
  const largos = curva.getLengths(N);
  const total = largos[N];
  const prog = largos.map((s) => 1 - Math.log1p((total - s) / r0) / Math.log1p(total / r0));
  return (e) => {
    if (e <= 0) return 0;
    if (e >= 1) return 1;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (prog[m] < e) lo = m; else hi = m; }
    const f = (e - prog[lo]) / Math.max(1e-9, prog[hi] - prog[lo]);
    // getLengths reparte por parámetro, así que el índice ya es el parámetro
    return (lo + f) / N;
  };
}
