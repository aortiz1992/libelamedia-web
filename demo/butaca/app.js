// ─────────────────────────────────────────────────────────────────────────────
// BUTACA · la demo. Mapa de butacas → vuelo por la sala → vista desde tu asiento.
//
// Dos datos, dos ritmos: la SALA (geometría, cambia cada años) y la SESIÓN
// (categorías, precios, ocupadas: cambia cada función). El visor enseña
// precios y disponibilidad pero no los inventa ni cobra: el botón de reservar
// no hace nada. El día que haya cliente, la sesión llegará de su taquilla.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { construirSala, tenir, iluminacion } from "./sala.js";
import { datosButaca } from "./disposicion.js";
import { construirPublico } from "./publico.js";
import { prepararRutas, ritmo } from "./ruta.js";

const $ = (s) => document.querySelector(s);
const SVG = "http://www.w3.org/2000/svg";
const svg = (t, a = {}, hijos = []) => {
  const e = document.createElementNS(SVG, t);
  for (const [k, v] of Object.entries(a)) e.setAttribute(k, v);
  for (const h of hijos) e.appendChild(h);
  return e;
};

// Todo el estado, inicializado: nada de banderas sin valor (lección del SoFi).
const E = {
  fase: "mapa",              // mapa | vuelo | vista
  planta: null,
  elegida: null,             // id de butaca
  mirar: { giro: 0, cabeceo: 0, arrastrando: false, x: 0, y: 0 },
  vuelo: null,
  hoja: 0,                   // alto de la hoja de la ficha en móvil (px)               // { t0, dur, de:{p,m,fov}, a:{p,m,fov}, alAcabar }
  sucio: true,               // hay que volver a pintar el 3D
};
let datos = null, sesion = null, sala = null, publico = null, rutas = null;
// El telón: cerrado mientras eliges y vuelas, se alza cuando te sientas.
const TELON = { valor: 0, anim: null };
function moverTelon(a, dur) {
  TELON.anim = { t0: performance.now(), dur: dur * 1000, de: TELON.valor, a };
}
function ponerTelon(v) {
  TELON.valor = v;
  TELON.anim = null;
  sala.telon(v);
  luzDeSala(v);
  render.shadowMap.needsUpdate = true;
  E.sucio = true;
}
let categorias = new Map(), ocupadas = new Set();

// ───────────────────────── 3D ─────────────────────────
const lienzo = $("#lienzo");
const movil = matchMedia("(pointer: coarse)").matches || Math.min(screen.width, screen.height) < 700;
// ?rodaje: modo de grabación del vídeo. Resolución completa, detalle alto y el
// lienzo conserva el fotograma para que la captura no lo pille a medias.
const RODAJE = new URLSearchParams(location.search).has("rodaje");
const render = new THREE.WebGLRenderer({
  canvas: lienzo, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: RODAJE,
});
render.setPixelRatio(RODAJE ? devicePixelRatio : Math.min(devicePixelRatio, movil ? 1.25 : 1.5));
render.shadowMap.enabled = true;
render.shadowMap.type = THREE.PCFSoftShadowMap;
render.outputColorSpace = THREE.SRGBColorSpace;
render.toneMapping = THREE.ACESFilmicToneMapping;
render.toneMappingExposure = 1.0;

const escena = new THREE.Scene();
escena.background = new THREE.Color(0x0b0a0a);
escena.environmentIntensity = 0.6;
const camara = new THREE.PerspectiveCamera(55, 1, 0.1, 160);
const hemi = new THREE.HemisphereLight(0x6b4a3a, 0x1a0e0c, 0.12);
escena.add(hemi);
const HEMI_SALA = 0.12;
const relleno = new THREE.DirectionalLight(0x90b4ff, 0.05);
relleno.position.set(0, 6, -12);
escena.add(relleno);

let composer = null;
function montarPost() {
  composer = new EffectComposer(render);
  composer.addPass(new RenderPass(escena, camara));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.3, 2.0));
  composer.addPass(new OutputPass());
  // Acabado de cámara, ya en el espacio de la pantalla: viñeta suave, un
  // grano fino y un pelo de calidez en las sombras. Es lo que quita el «aspecto
  // de render» sin que se note que hay algo.
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform sampler2D tDiffuse; varying vec2 vUv;
      float ruido(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        vec2 d = (vUv - 0.5) * vec2(1.0, 1.15);
        c.rgb *= mix(0.74, 1.0, smoothstep(0.82, 0.22, length(d)));
        float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        c.rgb += vec3(0.012, 0.004, -0.008) * (1.0 - l);
        c.rgb += (ruido(gl_FragCoord.xy) - 0.5) * 0.03;
        gl_FragColor = c;
      }`,
  }));
}

// Cuando se alza el telón la sala baja a media luz, como al empezar la función:
// la lámpara, los apliques, el rebote y las bombillas. Va atada al telón: con
// él bajado (eligiendo, volando) la sala está encendida.
const BASE_SALA = new Map();
// Antonio (17-nov): más oscura, que el público se lea como siluetas y no se
// noten sus pocos polígonos. La escena no se toca.
function luzDeSala(v) {
  const k = 1 - 0.93 * v;           // al 7 % (Antonio: «un poco más oscuro todavía»)
  escena.traverse((o) => {
    if (o.name !== "LUZ_SALA") return;
    if (!BASE_SALA.has(o)) BASE_SALA.set(o, o.intensity);
    o.intensity = BASE_SALA.get(o) * k;
  });
  escena.environmentIntensity = 0.6 * (1 - 0.78 * v);
  if (E.fase === "vista") hemi.intensity = HEMI_SALA * (1 - 0.75 * v);
  const M = sala.materiales;
  M.bombilla.emissiveIntensity = 6 * (1 - 0.72 * v);
  M.pantalla.emissiveIntensity = 4 * (1 - 0.75 * v);
}

// Reflejos y luz rebotada: se capturan de la propia sala, una vez.
function capturarEntorno() {
  const pm = new THREE.PMREMGenerator(render);
  const desde = new THREE.Vector3(0, 3.0, 10.0);
  escena.environment = null;
  escena.position.copy(desde).multiplyScalar(-1);
  escena.updateMatrixWorld(true);
  const rt = pm.fromScene(escena, 0.04, 0.1, 80);
  escena.position.set(0, 0, 0);
  escena.updateMatrixWorld(true);
  escena.environment = rt.texture;
  pm.dispose();
}

// En pantallas estrechas la ficha es una hoja que sube desde abajo y tapaba
// media escena: el 3D se encoge para ocupar sólo lo que queda por encima.
// El 3D ocupa SIEMPRE la pantalla entera. Antes se encogía para dejar sitio a
// la hoja, y entonces la vista cenital no podía casar con el plano en la parte
// de abajo: al elegir una butaca del anfiteatro la sala salía vacía. Ahora lo
// que se mueve es el encuadre: el centro de la imagen sube a la mitad de lo
// que queda libre por encima de la hoja, poco a poco durante el vuelo.
function encajarLienzo() {
  E.hoja = innerWidth <= 720 && E.fase !== "mapa" ? $("#ficha").offsetHeight : 0;
  medir();
}
function encuadre(fov, f) {
  const al = lienzo.clientHeight, an = lienzo.clientWidth;
  const libre = al - E.hoja * f;
  // el mismo campo de visión, pero medido sobre la parte libre de la pantalla
  camara.fov = (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (al / libre)) * 180) / Math.PI;
  if (E.hoja * f > 0.5) camara.setViewOffset(an, al, 0, (E.hoja * f) / 2, an, al);
  else camara.clearViewOffset();
  camara.updateProjectionMatrix();
}

function medir() {
  const an = Math.max(1, lienzo.clientWidth), al = Math.max(1, lienzo.clientHeight);
  render.setSize(an, al, false);
  if (composer) composer.setSize(an, al);
  camara.aspect = an / al;
  camara.updateProjectionMatrix();
  E.sucio = true;
}
addEventListener("resize", encajarLienzo);

// ───────────────────────── cámara ─────────────────────────
const _m = new THREE.Vector3();
const miraEscena = () => {
  const e = datos.escenario;
  return new THREE.Vector3(0, e.embocaduraY + e.embocaduraAlto * 0.2, -e.fondo * 0.2);
};
const general = () => {
  const L = sala.limites;
  // Arriba, justo por delante del anfiteatro: se ve el patio entero y la
  // escena. Desde el fondo del anfiteatro el vuelo atravesaba el antepecho.
  return { p: new THREE.Vector3(L.maxX * 0.28, L.altoSala - 1.0, 11.0), m: new THREE.Vector3(0, 1.0, 3.5), fov: 62 };
};
const enButaca = (b) => ({ p: new THREE.Vector3(b.ojo.x, b.ojo.y, b.ojo.z), m: miraEscena(), fov: 52 });
// Punto de paso del vuelo. Al patio se baja por DELANTE del anfiteatro y se
// entra a ras de cabezas: en línea recta la cámara cruzaba el forjado.
const paso = (b) => (b.seccion === "patio" ? new THREE.Vector3(b.x, 1.6, Math.min(7, b.z + 1.5)) : null);

function ponerCamara(p, m, fov) {
  camara.position.copy(p);
  encuadre(fov, 1);
  // «Mirar alrededor»: giro y cabeceo sobre la dirección base, sin ladear.
  const d = _m.copy(m).sub(p);
  const dist = d.length();
  const giro = Math.atan2(d.x, -d.z) + E.mirar.giro;
  const cab = Math.max(-1.2, Math.min(1.2, Math.asin(d.y / dist) + E.mirar.cabeceo));
  camara.lookAt(
    p.x + Math.sin(giro) * Math.cos(cab) * dist,
    p.y + Math.sin(cab) * dist,
    p.z - Math.cos(giro) * Math.cos(cab) * dist,
  );
  E.sucio = true;
}

const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function volar(a, dur, alAcabar, c = null) {
  const de = { p: camara.position.clone(), m: E.destino ? E.destino.m.clone() : a.m.clone(), fov: camara.fov };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) dur = 0.01;
  E.vuelo = { t0: performance.now(), dur: dur * 1000, de, a, c, alAcabar };
}

function bucle(ahora) {
  if (TELON.anim) {
    const n = TELON.anim, t = Math.max(0, Math.min(1, (ahora - n.t0) / n.dur));
    TELON.valor = n.de + (n.a - n.de) * mas(t);
    sala.telon(TELON.valor);
    luzDeSala(TELON.valor);
    render.shadowMap.needsUpdate = true;       // el telón da sombra sobre la escena
    E.sucio = true;
    if (t >= 1) TELON.anim = null;
  }
  if (E.vuelo && E.vuelo.entrada) pasoEntrada(ahora);
  else if (E.vuelo) {
    const v = E.vuelo;
    const t = Math.min(1, (ahora - v.t0) / v.dur), k = suave(t);
    const p = v.c
      ? new THREE.QuadraticBezierCurve3(v.de.p, v.c, v.a.p).getPoint(k)
      : v.de.p.clone().lerp(v.a.p, k);
    ponerCamara(p, v.de.m.clone().lerp(v.a.m, k), v.de.fov + (v.a.fov - v.de.fov) * k);
    if (t >= 1) { E.vuelo = null; E.destino = v.a; if (v.alAcabar) v.alAcabar(); }
  }
  if (E.fase === "mapa" && !E.vuelo) return;            // el mapa tapa el 3D: no se pinta
  if (!E.sucio) return;
  E.sucio = false;
  composer.render();
}

// mirar alrededor arrastrando, sólo en la vista
lienzo.addEventListener("pointerdown", (e) => {
  if (E.fase !== "vista") return;
  E.mirar.arrastrando = true; E.mirar.x = e.clientX; E.mirar.y = e.clientY;
  lienzo.setPointerCapture(e.pointerId);
  $("#ayuda").classList.add("fuera");
});
lienzo.addEventListener("pointermove", (e) => {
  if (!E.mirar.arrastrando) return;
  const k = (camara.fov * Math.PI / 180) / lienzo.clientHeight;
  E.mirar.giro = Math.max(-1.4, Math.min(1.4, E.mirar.giro - (e.clientX - E.mirar.x) * k));
  E.mirar.cabeceo = Math.max(-0.6, Math.min(0.7, E.mirar.cabeceo + (e.clientY - E.mirar.y) * k));
  E.mirar.x = e.clientX; E.mirar.y = e.clientY;
  ponerCamara(E.destino.p, E.destino.m, E.destino.fov);
});
const soltar = () => { E.mirar.arrastrando = false; };
lienzo.addEventListener("pointerup", soltar);
lienzo.addEventListener("pointercancel", soltar);

// ───────────────────────── textos ─────────────────────────
const SELLOS = { "muy-cerca": "UP CLOSE", lateral: "SIDE VIEW", optima: "SWEET SPOT", lejos: "FULL PICTURE", buena: "GOOD VIEW" };
const dinero = (n) => new Intl.NumberFormat("en-IE", { style: "currency", currency: sesion.funcion.moneda }).format(n);
const cat = (id) => categorias.get(sesion.butacas[id]);
const nombre = (b) => (b.seccion.startsWith("palco") ? `Seat ${b.fila}${b.numero}` : `Row ${b.fila} · Seat ${b.numero}`);
const libre = (id) => !ocupadas.has(id);
const donde = (b, c) => {
  const s = sesion.secciones[b.seccion];
  return s === c.nombre ? s : `${s} · ${c.nombre}`;
};

// ───────────────────────── mapa 2D ─────────────────────────
function pintarLeyenda() {
  $("#leyenda").innerHTML = sesion.categorias
    .map((c) => `<span><i style="background:${c.color}"></i>${c.nombre} <b>${dinero(c.precio)}</b></span>`).join("") +
    `<span><i style="background:#2a2120"></i>Taken</span>`;
}

function pintarPlantas() {
  const cont = $("#plantas");
  cont.innerHTML = "";
  for (const p of sesion.plantas) {
    const b = document.createElement("button");
    b.textContent = p.nombre;
    b.setAttribute("aria-pressed", String(p.id === E.planta));
    b.onclick = () => { E.planta = p.id; pintarPlantas(); pintarPlano(); };
    cont.appendChild(b);
  }
}

function dibujoPlanta(planta, mini) {
  const lista = sala.butacas.filter((b) => planta.secciones.includes(b.seccion));
  const L = sala.limites, esc = datos.escenario, a2 = esc.embocaduraAncho / 2;
  const g = [];
  // la escena, arriba
  g.push(svg("path", { class: "escena", d: `M${-a2 - 0.6} -1.9 H${a2 + 0.6} V0 Q0 1.1 ${-a2 - 0.6} 0 Z` }));
  if (!mini) {
    const t = svg("text", { class: "rotulo", x: 0, y: -0.75 });
    t.textContent = "STAGE";
    g.push(t);
    // columnas: el plano las enseña, como las enseñará la vista
    if (planta.secciones.includes("patio")) {
      for (const c of (datos.obstaculos || []).filter((o) => o.tipo === "columna")) {
        g.push(svg("circle", { class: "col", cx: c.x, cy: c.z, r: 0.2 }));
      }
    }
    // letras de fila, en los pasillos (a los lados chocaban con los palcos)
    const filas = new Map();
    for (const b of lista) {
      if (b.seccion.startsWith("palco")) continue;
      const k = b.seccion + b.fila;
      if (!filas.has(k)) filas.set(k, []);
      filas.get(k).push(b);
    }
    for (const f of filas.values()) {
      f.sort((p, q) => p.x - q.x);
      for (let i = 1; i < f.length; i++) {
        if (Math.hypot(f[i].x - f[i - 1].x, f[i].z - f[i - 1].z) < 1.3) continue;
        const t2 = svg("text", { class: "fila", x: (f[i].x + f[i - 1].x) / 2, y: (f[i].z + f[i - 1].z) / 2 });
        t2.textContent = f[0].fila;
        g.push(t2);
      }
    }
    // el contorno y el nombre de cada palco
    for (const id of planta.secciones.filter((s) => s.startsWith("palco"))) {
      const bs = lista.filter((b) => b.seccion === id);
      if (!bs.length) continue;
      const xs = bs.map((b) => b.x), zs = bs.map((b) => b.z);
      const x1 = Math.min(...xs) - 0.45, x2 = Math.max(...xs) + 0.45, z1 = Math.min(...zs) - 0.45, z2 = Math.max(...zs) + 0.45;
      g.push(svg("rect", { class: "caja", x: x1, y: z1, width: x2 - x1, height: z2 - z1, rx: 0.15 }));
      const t3 = svg("text", { class: "fila", x: (x1 + x2) / 2, y: z2 + 0.35 });
      t3.textContent = sesion.secciones[id].split(" · ")[0].toUpperCase();
      g.push(t3);
    }
  }
  for (const b of lista) {
    if (mini) {
      const yo = b.id === E.elegida;
      g.push(svg("circle", { cx: b.x, cy: b.z, r: yo ? 0.75 : 0.2, fill: yo ? "#f0d28a" : "#5b4a45" }));
      continue;
    }
    const c = cat(b.id), oc = !libre(b.id);
    const r = svg("rect", {
      class: `b${oc ? " ocupada" : ""}${b.id === E.elegida ? " elegida" : ""}`,
      "data-id": b.id, x: -0.21, y: -0.2, width: 0.42, height: 0.4, rx: 0.11, fill: c.color,
      transform: `translate(${b.x.toFixed(3)} ${b.z.toFixed(3)}) rotate(${(-b.giro * 180 / Math.PI).toFixed(1)})`,
      tabindex: oc ? -1 : 0, role: "button",
      "aria-label": `${sesion.secciones[b.seccion]}, ${nombre(b)}, ${oc ? "taken" : c.nombre + " " + dinero(c.precio)}`,
    });
    g.push(r);
  }
  const maxZ = Math.max(...lista.map((b) => b.z));
  const caja = mini ? `${-L.maxX} -2.2 ${2 * L.maxX} ${maxZ + 3.2}` : `${-L.maxX - 0.3} -2.3 ${2 * L.maxX + 0.6} ${maxZ + 3.6}`;
  return { g, caja };
}

function pintarPlano() {
  const planta = sesion.plantas.find((p) => p.id === E.planta);
  const { g, caja } = dibujoPlanta(planta, false);
  const s = svg("svg", { viewBox: caja, role: "group", "aria-label": `Seat plan, ${planta.nombre}` }, g);
  const cont = $("#plano");
  cont.innerHTML = "";
  cont.appendChild(s);
  const [x, y, w, h] = caja.split(" ").map(Number);
  V.svg = s; V.base = { x, y, w, h }; V.k = 1; V.cx = x + w / 2; V.cy = y + h / 2;
  encuadrar();
}

// ── Encuadre del plano: se ve ENTERO al abrir y se amplía con pellizco, rueda
// o tocando. En un móvil el plano entero deja las butacas en 8 px: por eso un
// toque elige la butaca libre MÁS CERCANA al dedo y acerca el plano a ella.
const V = { svg: null, base: null, k: 1, cx: 0, cy: 0, dedos: new Map(), movido: false, pellizco: 0 };
function encuadrar() {
  const b = V.base, w = b.w / V.k, h = b.h / V.k;
  V.cx = Math.max(b.x + w / 2, Math.min(b.x + b.w - w / 2, V.cx));
  V.cy = Math.max(b.y + h / 2, Math.min(b.y + b.h - h / 2, V.cy));
  V.svg.setAttribute("viewBox", `${V.cx - w / 2} ${V.cy - h / 2} ${w} ${h}`);
}
const aPlano = (cx, cy) => {
  const m = V.svg.getScreenCTM().inverse();
  return { x: m.a * cx + m.c * cy + m.e, y: m.b * cx + m.d * cy + m.f };
};
const pxPorMetro = () => V.svg.getScreenCTM().a;
function ampliar(factor, cx, cy) {
  const antes = aPlano(cx, cy);
  V.k = Math.max(1, Math.min(6, V.k * factor));
  encuadrar();
  const despues = aPlano(cx, cy);
  V.cx += antes.x - despues.x; V.cy += antes.y - despues.y;
  encuadrar();
}
function tocar(e) {
  let id = e.target.dataset && e.target.dataset.id;
  const p = aPlano(e.clientX, e.clientY);
  if (!id || !libre(id)) {
    // la libre más cercana, si el dedo cayó a menos de 70 cm de alguna
    const planta = sesion.plantas.find((q) => q.id === E.planta);
    let mejor = null, d = 0.7;
    for (const b of sala.butacas) {
      if (!planta.secciones.includes(b.seccion) || !libre(b.id)) continue;
      const dd = Math.hypot(b.x - p.x, b.z - p.y);
      if (dd < d) { d = dd; mejor = b.id; }
    }
    id = mejor;
  }
  if (!id) return;
  elegir(id);
  if (pxPorMetro() < 30) {
    const b = sala.porId.get(id);
    V.k = Math.min(6, V.k * (36 / pxPorMetro()));
    V.cx = b.x; V.cy = b.z;
    encuadrar();
  }
}

function pintarSeleccion() {
  const b = E.elegida && sala.porId.get(E.elegida);
  const sel = $("#sel"), ver = $("#ver");
  if (!b) {
    sel.innerHTML = "<strong>No seat selected</strong><span>Tap a seat on the plan</span>";
    ver.disabled = true;
    return;
  }
  const c = cat(b.id);
  sel.innerHTML = `<strong>${nombre(b)}</strong><span>${donde(b, c)} · ${dinero(c.precio)}</span>`;
  ver.disabled = false;
}

function elegir(id) {
  if (!id || !libre(id)) return;
  E.elegida = id;
  for (const e of document.querySelectorAll(".b.elegida")) e.classList.remove("elegida");
  const el = document.querySelector(`.b[data-id="${id}"]`);
  if (el) el.classList.add("elegida");
  pintarSeleccion();
}

const plano = $("#plano"), pista = $("#pista");
plano.addEventListener("pointerdown", (e) => {
  V.dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (V.dedos.size === 1) V.movido = false;
  if (V.dedos.size === 2) { const [a, b] = [...V.dedos.values()]; V.pellizco = Math.hypot(a.x - b.x, a.y - b.y); V.movido = true; }
});
plano.addEventListener("pointermove", (e) => {
  const d = V.dedos.get(e.pointerId);
  if (!d) return;
  if (V.dedos.size === 1) {
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!V.movido && Math.hypot(dx, dy) < 7) return;
    V.movido = true;
    const k = pxPorMetro();
    V.cx -= dx / k; V.cy -= dy / k;
    encuadrar();
  }
  d.x = e.clientX; d.y = e.clientY;
  if (V.dedos.size === 2) {
    const [a, b] = [...V.dedos.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (V.pellizco > 0) ampliar(dist / V.pellizco, (a.x + b.x) / 2, (a.y + b.y) / 2);
    V.pellizco = dist;
  }
});
const finDedo = (e) => { V.dedos.delete(e.pointerId); };
// el toque es el «click» del navegador; tras arrastrar o pellizcar no cuenta
plano.addEventListener("click", (e) => { if (!V.movido) tocar(e); V.movido = false; });
plano.addEventListener("pointerup", finDedo);
plano.addEventListener("pointercancel", finDedo);
plano.addEventListener("wheel", (e) => { e.preventDefault(); ampliar(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY); }, { passive: false });
plano.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.dataset.id) { e.preventDefault(); elegir(e.target.dataset.id); }
});
plano.addEventListener("pointermove", (e) => {
  const id = e.target.dataset && e.target.dataset.id;
  if (!id || e.pointerType === "touch") { pista.style.opacity = 0; return; }
  const b = sala.porId.get(id), c = cat(id);
  pista.textContent = libre(id) ? `${nombre(b)} · ${c.nombre} · ${dinero(c.precio)}` : `${nombre(b)} · taken`;
  pista.style.left = e.clientX + "px";
  pista.style.top = e.clientY + "px";
  pista.style.opacity = 1;
});
plano.addEventListener("pointerleave", () => { pista.style.opacity = 0; });

// ───────────────────────── vista desde la butaca ─────────────────────────
function pintarFicha() {
  const b = sala.porId.get(E.elegida), c = cat(b.id), d = datosButaca(b, datos);
  const reducida = c.id === "restricted";
  const sello = $("#sello");
  sello.textContent = reducida ? "RESTRICTED VIEW" : SELLOS[d.etiqueta.clave] || "GOOD VIEW";
  sello.classList.toggle("aviso", reducida);
  $("#fButaca").textContent = nombre(b);
  $("#fDonde").textContent = donde(b, c);
  $("#mDist").textContent = d.distancia.toFixed(1) + " m";
  $("#mCampo").textContent = d.campo + "°";
  $("#mDesc").textContent = d.descentrado < 0.15 ? "0 m" : d.descentrado.toFixed(1) + " m";
  $("#mDescT").textContent = d.descentrado < 0.15 ? "dead centre" : (d.lado === "izquierda" ? "left of centre" : "right of centre");
  $("#fNota").textContent = reducida
    ? "Part of the stage is hidden from this seat. What you see here is what you get — that is why it costs less."
    : "This is the real sightline from this seat: same height, same angle, same heads in front.";
  $("#fPrecio").innerHTML = `${c.nombre}<br><b style="color:var(--marfil);font:600 22px var(--serif)">${dinero(c.precio)}</b>`;
  $("#reservar").textContent = `Book · ${dinero(c.precio)}`;
  const planta = sesion.plantas.find((p) => p.secciones.includes(b.seccion));
  const { g, caja } = dibujoPlanta(planta, true);
  const mini = $("#mini");
  mini.innerHTML = "";
  mini.setAttribute("viewBox", caja);
  for (const e of g) mini.appendChild(e);
  $("#ant").disabled = !vecina(-1);
  $("#sig").disabled = !vecina(1);
}

function vecina(paso) {
  const b = sala.porId.get(E.elegida);
  const fila = sala.butacas.filter((x) => x.seccion === b.seccion && x.fila === b.fila).sort((p, q) => p.numero - q.numero);
  let i = fila.indexOf(b) + paso;
  while (fila[i] && !libre(fila[i].id)) i += paso;
  return fila[i] || null;
}

// ── La entrada: el plano SE CONVIERTE en la sala ─────────────────────────────
// La cámara arranca en cenital, encuadrada exactamente como el plano 2D y con
// cada butaca del color de su categoría: el fundido de uno a otro no salta.
// Luego baja en una sola curva hasta la butaca, mientras la sala recupera su
// terciopelo y su media luz. Es lo que hace la referencia: mapa → sala → vista.
const mas = (t) => t * t * t * (t * (6 * t - 15) + 10);           // arranque y frenada suaves
const suaveSeno = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);
const tramo = (k, a, b) => mas(Math.max(0, Math.min(1, (k - a) / (b - a))));
const ROJO = new THREE.Color(0x74101c);

// Desde 50–100 m de altura, con el plano cercano a 10 cm, la profundidad no
// distingue la alfombra del suelo (6 mm) y parpadean. El plano cercano sube
// con la cámara y vuelve a 10 cm al entrar en la sala.
const cercaPara = (y) => Math.max(0.1, Math.min(10, (y - 11) * 0.25));

const matsLampara = [];
function opacidadLampara(o) {
  for (const m of matsLampara) {
    const t = o < 0.999;
    if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; }
    m.opacity = o;
  }
}

function poseCenital() {
  const FOV = 14;
  const r = $("#plano").getBoundingClientRect();
  const ppm = pxPorMetro();                                        // píxeles por metro del plano
  const an = lienzo.clientWidth, al = lienzo.clientHeight;
  const h = al / (2 * ppm * Math.tan((FOV * Math.PI) / 360));
  const p = new THREE.Vector3(
    V.cx - (r.left + r.width / 2 - an / 2) / ppm, h,
    V.cy - (r.top + r.height / 2 - al / 2) / ppm,
  );
  const cam = new THREE.PerspectiveCamera();
  cam.position.copy(p);
  cam.up.set(0, 0, -1);                                            // la escena, arriba: como el plano
  cam.lookAt(p.x, 0, p.z);
  return { p, q: cam.quaternion.clone(), fov: FOV };
}

function verPlanta(planta, todo) {
  // En cenital se quita sólo lo que queda POR ENCIMA de la planta elegida, que
  // es lo que taparía. Lo de debajo se deja: al elegir anfiteatro, el patio
  // sigue ahí —Antonio vio la sala sin sillas abajo y parecía rota—.
  const nivel = sesion.plantas.indexOf(planta);
  const encima = new Set(sesion.plantas.slice(nivel + 1).flatMap((q) => q.secciones));
  const fuera = (sec) => !todo && encima.has(sec);
  for (const o of sala.grupo.children) {
    const m = /^[A-Z]+_(.+)$/.exec(o.name || "");
    if (o.isInstancedMesh && m && sala.butacas.some((b) => b.seccion === m[1])) o.visible = !fuera(m[1]);
  }
  const conAnf = todo || !encima.has("anfiteatro");
  for (const o of sala.anfiteatro) o.visible = conAnf;
  for (const o of sala.cerramiento) o.visible = !!todo;
  if (!todo) publico.userData.opacidad(0);     // en cenital taparían el color de las butacas
  // las sombras de contacto son una sola malla para toda la sala: en cenital
  // quedaban las de las butacas ocultas, como manchas en el suelo
  const sombras = sala.grupo.getObjectByName("SOMBRAS_BUTACAS");
  if (sombras) sombras.visible = !!todo || encima.size === 0;
  render.shadowMap.needsUpdate = true;
}

function irALaVista() {
  const b = sala.porId.get(E.elegida);
  if (!b || E.vuelo) return;
  const planta = sesion.plantas.find((p) => p.secciones.includes(b.seccion));
  E.fase = "vuelo";
  E.mirar.giro = 0; E.mirar.cabeceo = 0;
  pintarFicha();                                  // ya, aunque oculta: hace falta su altura
  encajarLienzo();
  history.replaceState(null, "", `?seat=${b.id}`);

  // la sala, vestida como el plano
  const colores = sala.butacas.map((x) => new THREE.Color(
    x.id === b.id ? 0xfff3d6
      : !planta.secciones.includes(x.seccion) ? 0x4a0c14          // otra planta: terciopelo apagado
        : libre(x.id) ? cat(x.id).color : 0x241c1b));
  sala.butacas.forEach((x, i) => tenir(sala, x.id, colores[i]));
  verPlanta(planta, false);
  ponerTelon(0);
  hemi.intensity = 2.6;

  const cen = poseCenital(), fin = enButaca(b);
  // La ruta la planea ruta.js: baja por un hueco libre de la sala, se acerca
  // por encima de las cabezas y se sienta. Si por lo que sea no encuentra
  // ninguna, la de antes (que no choca con la arquitectura, sí con el público).
  const plan = rutas.planear(b, cen.p);
  const ladoB = b.x < 0 ? -1 : 1;
  const curva = plan ? plan.curva : new THREE.CatmullRomCurve3(b.seccion === "patio"
    ? [cen.p, new THREE.Vector3((cen.p.x + b.x) / 2, 13, 5.2),
       new THREE.Vector3(b.x, 2.0, Math.min(6.2, b.z + 1.5)), fin.p]
    : [cen.p, new THREE.Vector3(ladoB * 4.8, 12.5, 11), fin.p], false, "centripetal");
  camara.near = cercaPara(cen.p.y);
  camara.position.copy(cen.p);
  camara.quaternion.copy(cen.q);
  encuadre(cen.fov, 0);
  E.sucio = true;
  composer.render();
  $("#mapa").classList.add("fuera");

  const corta = matchMedia("(prefers-reduced-motion: reduce)").matches;
  E.vuelo = {
    entrada: true, t0: performance.now() + (corta ? 0 : 500), dur: corta ? 10 : 4600,
    curva, u: ritmo(curva, 3.5),
    cen, fin, b, planta, colores, abierto: false,
  };
}

const _q = new THREE.Quaternion(), _mira = new THREE.Matrix4(), _c = new THREE.Color();
const ARRIBA = new THREE.Vector3(0, 1, 0), _desde = new THREE.Vector3();
function pasoEntrada(ahora) {
  const v = E.vuelo;
  // k es el avance «percibido»: suave al arrancar y al llegar. La posición sale
  // de la tabla de ritmo, rápida arriba y lenta cerca de la butaca.
  const t = Math.max(0, Math.min(1, (ahora - v.t0) / v.dur)), k = suaveSeno(t);
  const p = v.curva.getPoint(v.u(k));
  camara.position.copy(p);
  camara.near = cercaPara(p.y);
  // de mirar al suelo a mirar a la escena, girando una sola vez. La mirada sale
  // de la media de un tramo corto del camino, no del punto exacto: así en las
  // curvas la cámara gira con inercia y no da tirones. Al llegar, el tramo se
  // encoge hasta cero para acabar mirando exactamente a la escena.
  const ven = 0.014 * Math.min(1, (1 - k) / 0.06);
  _desde.set(0, 0, 0);
  for (let j = -3; j <= 3; j++) _desde.add(v.curva.getPoint(v.u(Math.max(0, Math.min(1, k + j * ven)))));
  _desde.divideScalar(7);
  _mira.lookAt(_desde, v.fin.m, ARRIBA);
  _q.setFromRotationMatrix(_mira);
  // Girar la cámara y abrir el encuadre van con la ALTURA, no con el reloj:
  // al cruzar el tejado ya mira a la escena con el campo de un ojo. Antes
  // entraba a medio girar y con el teleobjetivo del plano, y durante medio
  // segundo la pantalla era una pared con dos focos.
  const alt = Math.max(0, Math.min(1, (v.cen.p.y - p.y) / (v.cen.p.y - (sala.limites.altoSala + 2))));
  camara.quaternion.slerpQuaternions(v.cen.q, _q, mas(alt));
  // El campo se abre a la par que baja, de forma que la sala SIEMPRE crece en
  // pantalla: altura × tan(campo/2) sólo puede disminuir. Abriéndolo con el
  // reloj, al principio la sala se alejaba antes de acercarse.
  const h0 = v.cen.p.y, h1 = sala.limites.altoSala + 2;
  const t0 = Math.tan((v.cen.fov * Math.PI) / 360), t1 = Math.tan((v.fin.fov * Math.PI) / 360);
  // En escala logarítmica: a = 1 arriba, 0 al cruzar el tejado. Con g(a) = a
  // el zoom se paraba en seco en el tejado (1,5° por fotograma → 0); con
  // g(a) = a^e se frena hasta cero. e se limita para que la sala no deje de
  // crecer: d(ln h·tan)/da = ln(h0/h1) − e·a^(e−1)·ln(t1/t0) > 0.
  let tg = t1;
  if (p.y > h1 && h0 > h1) {
    const lh = Math.log(h0 / h1), lt = Math.log(t1 / t0);
    const e = Math.max(1.05, Math.min(2, (0.9 * lh) / lt));
    const a = Math.log(p.y / h1) / lh;
    tg = t1 * Math.exp(-lt * Math.pow(Math.min(1, a), e));
  }
  encuadre((2 * Math.atan(tg) * 180) / Math.PI, tramo(k, 0.25, 0.85));
  // la ficha entra cuando la cámara ya ha arrancado: antes taparía el plano
  if (!v.ficha && k > 0.3) { v.ficha = true; $("#ficha").classList.remove("fuera"); }
  hemi.intensity = 2.6 + (HEMI_SALA - 2.6) * tramo(k, 0.25, 0.8);
  // ya dentro: vuelven el techo, el anfiteatro y las otras plantas
  if (!v.abierto && p.y < sala.limites.altoSala - 0.6) { v.abierto = true; v.kAbierto = k; verPlanta(v.planta, true); }
  // el público aparece poco a poco al entrar en la sala
  // el público y la lámpara aparecen poco a poco al entrar en la sala; la
  // lámpara antes se encendía de golpe y llenaba la pantalla de destellos
  if (v.abierto) {
    const f = tramo(k, v.kAbierto, Math.min(0.97, v.kAbierto + 0.3));
    publico.userData.opacidad(f);
    opacidadLampara(f);
  }
  // y cada butaca vuelve a su terciopelo; la tuya, la última
  const w = tramo(k, 0.5, 0.92);
  if (w > 0) {
    sala.butacas.forEach((x, i) => {
      if (x.id === v.b.id) return;
      tenir(sala, x.id, _c.copy(v.colores[i]).lerp(ROJO, w));
    });
  }
  E.sucio = true;
  if (t >= 1) {
    E.vuelo = null;
    if (!v.abierto) verPlanta(v.planta, true);
    for (const x of sala.butacas) tenir(sala, x.id);
    publico.userData.opacidad(1);
    opacidadLampara(1);
    publico.userData.apartarVecinos(v.b);
    hemi.intensity = HEMI_SALA;
    setTimeout(() => moverTelon(1, 3.4), 350);   // ya sentado: arriba el telón
    E.destino = v.fin;
    camara.near = 0.1;
    E.fase = "vista";
    ponerCamara(v.fin.p, v.fin.m, v.fin.fov);
    $("#ficha").classList.remove("fuera");
    $("#ayuda").classList.remove("fuera");
    setTimeout(() => $("#ayuda").classList.add("fuera"), 4500);
  }
}

function saltar(paso) {
  const v = vecina(paso);
  if (!v || E.vuelo) return;
  E.elegida = v.id;
  E.mirar.giro = 0; E.mirar.cabeceo = 0;
  history.replaceState(null, "", `?seat=${v.id}`);
  pintarFicha();
  encajarLienzo();
  publico.userData.apartarVecinos(v);
  // de butaca a butaca en arco, por encima de las cabezas, no a través
  const a = enButaca(v);
  const c = camara.position.clone().lerp(a.p, 0.5);
  c.y = Math.max(camara.position.y, a.p.y) + 0.45 + 0.25 * camara.position.distanceTo(a.p);
  volar(a, 0.85, null, c);
}

function volverAlMapa() {
  E.fase = "mapa";
  publico.userData.apartarVecinos(null);
  encajarLienzo();
  $("#ficha").classList.add("fuera");
  $("#ayuda").classList.add("fuera");
  const b = sala.porId.get(E.elegida);
  E.planta = sesion.plantas.find((p) => p.secciones.includes(b.seccion)).id;
  pintarPlantas(); pintarPlano(); pintarSeleccion();
  $("#mapa").classList.remove("fuera");
  history.replaceState(null, "", location.pathname);
}

let tAviso = 0;
function avisar(texto) {
  const a = $("#aviso");
  a.textContent = texto;
  a.classList.add("ver");
  clearTimeout(tAviso);
  tAviso = setTimeout(() => a.classList.remove("ver"), 5200);
}

$("#ver").onclick = irALaVista;
$("#cambiar").onclick = volverAlMapa;
$("#ant").onclick = () => saltar(-1);
$("#sig").onclick = () => saltar(1);
// El botón de comprar NO compra: una compra falsa en una demo pública es pedir
// un malentendido. Dice lo que pasaría de verdad.
$("#reservar").onclick = () => avisar("Demo only — nothing is booked. In a real venue this seat is handed to the theatre's own ticketing and payment.");
addEventListener("keydown", (e) => {
  if (E.fase !== "vista") return;
  if (e.key === "ArrowLeft") saltar(-1);
  if (e.key === "ArrowRight") saltar(1);
  if (e.key === "Escape") volverAlMapa();
});

// ───────────────────────── arranque ─────────────────────────
async function arranque() {
  const leer = async (f) => (await fetch(f, { cache: "no-cache" })).json();
  [datos, sesion] = await Promise.all([leer("teatro_mirabel.json"), leer("teatro_mirabel_sesion.json")]);
  categorias = new Map(sesion.categorias.map((c) => [c.id, c]));
  ocupadas = new Set(sesion.ocupadas);
  E.planta = sesion.plantas[0].id;

  const pedido = new URLSearchParams(location.search);
  sala = construirSala(datos, { detalle: pedido.get("detalle") || (movil && !RODAJE ? "bajo" : "alto") });
  escena.add(sala.grupo);
  escena.add(iluminacion(datos, sala));
  capturarEntorno();
  // el público, después del entorno: si no, sus cabezas se reflejarían en el oro
  publico = construirPublico(sala, ocupadas, { detalle: pedido.get("detalle") || (movil && !RODAJE ? "bajo" : "alto") });
  escena.add(publico);
  rutas = prepararRutas(sala, datos);
  ponerTelon(0);
  montarPost();
  medir();

  const f = sesion.funcion;
  $("#funcion").innerHTML = `<b>${f.titulo}</b> · ${f.subtitulo} · ${f.fecha}, ${f.hora}`;
  pintarLeyenda(); pintarPlantas(); pintarPlano(); pintarSeleccion();

  // Un primer fotograma con el mapa delante: compila los materiales ahora y
  // no en mitad del vuelo. Después las sombras no cambian: se calculan una vez.
  const g = general();
  E.destino = g;
  ponerCamara(g.p, g.m, g.fov);
  composer.render();
  // El público aparece en mitad del vuelo con un fundido, y para fundirse sus
  // materiales pasan a transparentes: eso es OTRO sombreador. Si se compila
  // en ese momento, la cámara se queda clavada un instante en pleno vuelo. Se
  // compilan aquí las dos variantes, con el mapa todavía delante.
  // La lámpara comparte el oro con toda la sala: se le dan materiales propios
  // para poder fundirla sin fundir el teatro.
  const lamp = sala.grupo.getObjectByName("LAMPARA");
  lamp.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    matsLampara.push(...[o.material].flat());
  });
  publico.userData.opacidad(0.5);
  opacidadLampara(0.5);
  render.compile(escena, camara);
  publico.userData.opacidad(1);
  opacidadLampara(1);
  render.shadowMap.autoUpdate = false;
  render.setAnimationLoop(bucle);
  $("#carga").classList.add("fuera");

  // ?seat=patio-G-11 abre directamente en esa butaca (enlaces, vídeo)
  const directa = pedido.get("seat");
  if (directa && sala.porId.has(directa) && libre(directa)) {
    E.planta = sesion.plantas.find((p) => p.secciones.includes(sala.porId.get(directa).seccion)).id;
    pintarPlantas(); pintarPlano(); elegir(directa);
    requestAnimationFrame(() => requestAnimationFrame(irALaVista));
  }
  window.butaca = {
    E, get sala() { return sala; }, get rutas() { return rutas; }, elegir, irALaVista, volverAlMapa, camara, render,
    // girar la cabeza desde la butaca (para el vídeo)
    mirar(giro, cabeceo) {
      E.mirar.giro = giro; E.mirar.cabeceo = cabeceo;
      if (E.destino) ponerCamara(E.destino.p, E.destino.m, E.destino.fov);
    },
    lista: true,
  };
}

arranque().catch((e) => {
  console.error(e);
  $("#carga").textContent = "Could not load the theatre";
});
