// SoFi — configurador. Carpeta autónoma: three.js por CDN, el resto aquí.
// Todo lo que se enseña en los paneles sale del GLB o del modelo.json; nada inventado.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { crearOceano } from "./oceano.js";
import { crearNado, V_BASE } from "./nado.js";
import { hidrostatica, luz, nado as fisNado, juicioStrouhal, regimen } from "./fisica.js";
import { crearServos, PAR_NOMINAL } from "./servos.js";
import { crearBanco } from "./peces.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";

const $ = (s) => document.querySelector(s);
const crear = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
const grados = (r) => r * 180 / Math.PI;

const BARRAS = 32;
// De dónde viene la clave, en metros. Es la misma dirección de siempre, sólo que
// ahora hace falta como vector porque la luz se mueve con el pez.
const DIR_CLAVE = new THREE.Vector3(0.35, 1.45, 0.30).normalize().multiplyScalar(2.6);

let modelo, raiz, mezclador, accion, reloj, escenario, oceano, nado, nadador;
let servos = null;
let sitio = null;
let escena, camara, render, control, lienzo;
const piezas = [];          // { malla, conjunto, capa, ... }
const huesos = [];          // { nombre, hueso, ref, eje, maximo }
const rotulos = [];         // { el, pos }

// Mientras se rueda, el lienzo tiene una medida FIJA —1920x1080— y no la del
// hueco que haya dejado la ventana. Con esto puesto, `medir()` no manda.
//
// Y va AQUI arriba, no al lado de medir(), que es donde lo puse primero: medir()
// se llama desde arranque(), o sea mientras el modulo todavia se esta
// evaluando, y un `let` declarado mas abajo no existe aun en ese momento. Es la
// cuarta vez que este proyecto tropieza con lo mismo —zona muerta temporal— y
// la cuarta vez el sintoma es el mismo: la aplicacion no levanta y el error no
// se parece en nada a la causa.
let fijo = null;
// La regla, ya por escrito: lo que toque algo que corre en el arranque se
// declara ANTES de la llamada a arranque().

const estado = {
  conjunto: null,           // id del conjunto aislado, o null
  vista: "hero",
  rayosx: 0,
  rayosxOn: false,
  profundidad: 4.0,
  nado: false,
  modo: "estatico",
  silicona: true,
  fpv: false,
  grabando: false,
  rotulos: false,
  giro: false,
  malla: false,
  reproduciendo: true,
};

// Transición de cámara en curso, y si el usuario ya ha movido el punto de vista.
let viaje = null;
let tocado = false;
let clave = null;              // la luz que proyecta; su encuadre persigue al pez
const _focoLuz = new THREE.Vector3();
let compositor = null, pasoAO = null, pasoBloom = null, pasoDOF = null;
let banco = null;
// El halo de las fichas: a dónde va y dónde está. Entra en medio segundo y sale
// en un cuarto — encender despacio se lee como que algo se ha seleccionado;
// apagar despacio sólo se lee como pereza.
const halo = { meta: 0, valor: 0 };

// ───────────────────────── la entrada del pez ─────────────────────────
// Al salir de nado, el pez estaba donde el recorrido lo hubiera dejado y volvía
// al centro interpolando desde ahí: se veía resbalar por el arrecife, de
// espaldas o de lado, hasta aterrizar. Un corte feo justo donde el espectador
// está cambiando de modo.
//
// Ahora sale de cuadro y vuelve a entrar por la derecha, ya orientado, y frena
// al llegar a su sitio. Que entre en vez de aparecer es lo que convierte el
// cambio de modo en un plano.
//
// Cuánto se aparta NO es un número fijo: se calcula con el encuadre de DESTINO,
// así que en una ficha cerrada la entrada es corta y en el plano general es
// amplia. El pez siempre arranca justo fuera del borde, se mire como se mire.
let entrada = null;
const ENTRADA_S = 1.6;
// El pez espera a que la cámara llegue a su sitio antes de entrar. Sin esta
// espera se mueven los dos a la vez y no se ve entrar a nadie: sólo agua vacía
// mientras cámara y pez viajan por su cuenta. El vuelo de cámara dura 0,75 s,
// así que se le deja casi todo y se solapa el último cuarto, que es lo que
// evita que haya un momento muerto.
const ENTRADA_ESPERA = 0.6;
const _arriba = new THREE.Vector3(0, 1, 0);
const _frenteE = new THREE.Vector3();
const _derechaE = new THREE.Vector3();

const _CERO = new THREE.Vector3();
const _bz = new THREE.Vector3();
const _tg = new THREE.Vector3();
const _mE = new THREE.Matrix4();
const _qE = new THREE.Quaternion();
const _qRol = new THREE.Quaternion();
const _EJE_Z = new THREE.Vector3(0, 0, 1);
// Testigo de la última entrada: cuánto llegó a desviarse el morro de su
// dirección de reposo. Si saliera 0, el pez habría entrado de lado sin girar
// —que es lo que hacía la primera versión— y la entrada no sería un nado.
let testigoEntrada = null;
const _morro = new THREE.Vector3();
const _morroReposo = new THREE.Vector3();

// Un pez no se desplaza de lado hasta su sitio: NADA hasta él. La primera
// versión de esto interpolaba en línea recta manteniendo la pose de reposo, y
// se veía exactamente como lo que era — un objeto arrastrado. Ahora entra por
// un arco, con el morro siguiendo la trayectoria, apoyándose en el giro como
// hace cuando nada, y con la cola batiendo más deprisa al entrar que al llegar.
//
// El arco es una Bézier de tres puntos. El de control va DETRÁS de la posición
// de reposo, sobre el eje del propio pez: así la curva aterriza viniendo de
// atrás y con el morro ya alineado, en vez de llegar de costado y girar de
// golpe en el último fotograma.
function arrancarEntrada() {
  if (!nado || !nadador) return;
  const r = nado.reposo;
  const ojo = viaje ? viaje.p1 : camara.position;
  const mira = viaje ? viaje.m1 : control.target;
  _frenteE.copy(mira).sub(ojo);
  const d = _frenteE.length() || 1;
  _frenteE.divideScalar(d);
  _derechaE.crossVectors(_frenteE, _arriba);
  if (_derechaE.lengthSq() < 1e-6) _derechaE.set(1, 0, 0);   // cámara cenital
  _derechaE.normalize();
  const semi = d * Math.tan(THREE.MathUtils.degToRad(camara.fov) / 2) * camara.aspect;
  const fuera = semi + 0.22;

  // El morro del modelo mira a +Z; así se sabe hacia dónde encara en reposo.
  const adelante = new THREE.Vector3(0, 0, 1).applyQuaternion(r.quat);

  const P0 = r.pos.clone().addScaledVector(_derechaE, fuera);
  const P2 = r.pos.clone();
  const P1 = P2.clone().addScaledVector(adelante, -fuera * 0.55);

  // De qué lado cae el giro, para apoyarse hacia dentro y no hacia fuera.
  const t0 = P1.clone().sub(P0);
  const t1 = P2.clone().sub(P1);
  const sentido = Math.sign(t0.clone().cross(t1).dot(_arriba)) || 1;

  entrada = {
    t: 0,
    espera: ENTRADA_ESPERA,
    P0, P1, P2,
    quat: r.quat.clone(),
    rol: -sentido * 0.26,
    recorrido: P0.distanceTo(P2),
  };
  _morroReposo.set(0, 0, 1).applyQuaternion(r.quat);
  testigoEntrada = { giro_max_grados: 0, recorrido_m: +entrada.recorrido.toFixed(3) };
  poseEntrada(entrada, 0);
}

function poseEntrada(e, t) {
  const u = 1 - t;
  _bz.set(0, 0, 0)
    .addScaledVector(e.P0, u * u)
    .addScaledVector(e.P1, 2 * u * t)
    .addScaledVector(e.P2, t * t);
  nadador.position.copy(_bz);

  // Tangente de la Bézier: B'(t) = 2(1-t)(P1-P0) + 2t(P2-P1).
  _tg.set(0, 0, 0)
    .addScaledVector(e.P1, 2 * u).addScaledVector(e.P0, -2 * u)
    .addScaledVector(e.P2, 2 * t).addScaledVector(e.P1, -2 * t);
  if (_tg.lengthSq() < 1e-10) return;
  _tg.normalize();
  _mE.lookAt(_CERO, _tg.negate(), _arriba);
  _qE.setFromRotationMatrix(_mE);

  // Apoyo, que se va enderezando conforme llega.
  _qRol.setFromAxisAngle(_EJE_Z, e.rol * u);
  _qE.multiply(_qRol);

  // El último cuarto se funde con la pose de reposo EXACTA: las vistas
  // técnicas miden sobre ella y no vale quedarse a medio grado.
  if (t > 0.75) {
    const k = (t - 0.75) / 0.25;
    _qE.slerp(e.quat, k * k);
  }
  nadador.quaternion.copy(_qE);

  if (testigoEntrada) {
    _morro.set(0, 0, 1).applyQuaternion(_qE);
    const cos = Math.max(-1, Math.min(1, _morro.dot(_morroReposo)));
    const g = Math.acos(cos) * 180 / Math.PI;
    if (g > testigoEntrada.giro_max_grados) testigoEntrada.giro_max_grados = +g.toFixed(1);
  }
}

function avanzarEntrada(dt) {
  if (!entrada) return;
  if (entrada.espera > 0) {
    // Quieto fuera de cuadro mientras la cámara se coloca, pero batiendo: si
    // entra con la cola parada, entra un objeto, no un pez.
    entrada.espera -= dt;
    if (accion) accion.timeScale = 1.5;
    return;
  }
  entrada.t = Math.min(1, entrada.t + dt / ENTRADA_S);
  // Frenada, no arranque: el pez ya venía moviéndose, lo que tiene que hacer es
  // pararse en su sitio.
  const k = 1 - Math.pow(1 - entrada.t, 3);
  poseEntrada(entrada, k);
  // Y la cola frena con él. Un pez que llega a su sitio deja de empujar.
  if (accion) accion.timeScale = 1 + 0.5 * (1 - k);
  if (entrada.t >= 1) {
    nadador.position.copy(entrada.P2);
    nadador.quaternion.copy(entrada.quat);
    if (accion) accion.timeScale = 1;
    entrada = null;
  }
}

arranque();

async function arranque() {
  lienzo = $("#lienzo");

  escena = new THREE.Scene();
  // near/far: 0,025 y 24. Estaba en 0,01 y 40 — una relación de 4000 a 1 que
  // deja el búfer de profundidad tan comprimido que a medio metro el valor
  // normalizado ya es 0,96, y cualquier efecto que lea profundidad (oclusión
  // ambiental, sombras de contacto) se queda sin señal que leer. La escena mide
  // 9 m de radio y el mando no deja acercarse a menos de 0,12, así que estos
  // números sobran por los dos lados y dan 960 a 1.
  camara = new THREE.PerspectiveCamera(32, 1, 0.025, 24);

  // `preserveDrawingBuffer` SOLO al rodar, y con motivo.
  //
  // Por omision el navegador puede vaciar el bufer de dibujo en cuanto compone
  // la pagina, asi que copiar el lienzo con drawImage despues de pintar es una
  // carrera: casi siempre se gana. Casi. En los 5.220 fotogramas de la segunda
  // pelicula salio UNO negro, con trozos del fotograma anterior en las
  // esquinas — justo en un cambio de plano. Medido con signalstats: luma 20
  // con los vecinos en 83.
  //
  // Conservar el bufer quita la carrera. No se deja puesto siempre porque
  // cuesta memoria y algo de velocidad, y esto lo abre gente desde el movil;
  // al rodar da igual, que es un render, no una visita.
  const rodando = new URLSearchParams(location.search).has("rodaje");
  render = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true,
                                     preserveDrawingBuffer: rodando });
  render.setClearAlpha(0);
  // Sombras. Hasta ahora no habia ninguna, y es lo que mas asienta una imagen:
  // sin ellas el pez flota sobre el fondo en vez de estar EN el fondo, y los
  // internos de las fichas se leen planos porque nada se proyecta sobre nada.
  render.shadowMap.enabled = true;
  render.shadowMap.type = THREE.PCFSoftShadowMap;
  render.outputColorSpace = THREE.SRGBColorSpace;
  render.toneMapping = THREE.ACESFilmicToneMapping;
  // Antes el fondo era casi blanco y había que bajar la exposición para no
  // perder el volumen del pez. Ahora el fondo es agua oscura y pasa lo contrario.
  render.toneMappingExposure = 1.08;

  // El agua. Monta la bóveda, la niebla, los rayos, las motas y el mapa de
  // entorno, que sale del propio agua y no de un estudio.
  oceano = crearOceano(escena, render, { radio: 9, alcance: 2.4 });

  // Luz de debajo del agua: entra casi toda desde arriba, el relleno es el azul
  // del fondo y el contraluz es frío. Es lo contrario del estudio de antes.
  escena.add(new THREE.HemisphereLight(0x8fd8ee, 0x06202c, 0.55));
  // La clave va LIGERAMENTE calida a proposito, aunque debajo del agua no lo
  // seria: es lo que hace que la carcasa se lea blanca y se despegue del azul.
  // Con una clave fria el pez se volvia del color del agua y parecia de plastico.
  clave = new THREE.DirectionalLight(0xfff2e2, 3.1);
  clave.position.set(0.35, 1.45, 0.30);
  escena.add(clave);
  // Sólo proyecta la clave. Con tres luces proyectando habría tres sombras
  // cruzadas, que bajo el agua no es lo que pasa: casi toda la luz entra de
  // arriba y el resto es azul rebotado, que no dibuja sombra propia.
  clave.castShadow = true;
  // El encuadre de la sombra es DIMINUTO a propósito: 0,55 m de medio lado. El
  // pez mide 36 cm, así que con 2048 píxeles salen unos 1,9 mm por texel —
  // suficiente para que una aleta proyecte sobre el casco. Cubrir el arrecife
  // entero con el mismo mapa habría dado 3 cm por texel, que es no tener
  // sombras. Lo que se hace es mover el encuadre con el pez.
  clave.shadow.mapSize.set(2048, 2048);
  const sc = clave.shadow.camera;
  sc.left = sc.bottom = -0.55;
  sc.right = sc.top = 0.55;
  sc.near = 0.05;
  sc.far = 7.0;
  // Las piezas son cascarones de un milímetro: con el sesgo por defecto se
  // rayaban solas. El normalBias es el que vale aquí, porque desplaza según la
  // inclinación de la superficie en vez de a bulto.
  // El sesgo se calcula, no se tantea: 1,1 m de encuadre entre 2048 píxeles son
  // 0,54 mm por texel, así que el normalBias tiene que rondar los dos texels.
  // Lo puse primero en 12 mm —veinte veces de más— y el casco salió a bandas,
  // con secciones enteras en sombra.
  clave.shadow.bias = -0.00015;
  clave.shadow.normalBias = 0.0012;
  escena.add(clave.target);
  const relleno = new THREE.DirectionalLight(0x2a6f8f, 0.5);
  relleno.position.set(-0.9, -0.35, -0.6);
  escena.add(relleno);
  // Contraluz: le dibuja el filo al lomo contra el agua del fondo.
  const contra = new THREE.DirectionalLight(0xbfefff, 1.35);
  contra.position.set(-0.4, 0.55, -1.0);
  escena.add(contra);

  control = new OrbitControls(camara, lienzo);
  // Si alguien toca durante la demo, manda él: la cinemática se para.
  control.addEventListener("start", () => { if (cine) pararCine(); });
  control.enableDamping = true;
  control.dampingFactor = 0.07;
  control.minDistance = 0.12;
  control.maxDistance = 3.2;
  control.autoRotateSpeed = 0.9;
  control.addEventListener("start", () => { tocado = true; viaje = null; });

  montarCompositor();

  // Teclas de estudio. Hacen falta porque en cuanto se graba desaparece el
  // mando —que es el objetivo— y sin ellas no habría forma de salir.
  window.addEventListener("keydown", (e) => {
    // `?.` porque el objetivo no siempre es un elemento: si el evento llega
    // con window o document como objetivo, `matches` no existe y el manejador
    // se cae entero — y con él las teclas que son la única salida de grabación.
    if (e.target?.matches?.("input, textarea")) return;
    const k = e.key.toLowerCase();
    if (k === "g") ponerGrabacion(!estado.grabando);
    else if (k === "x") ponerRayosX(!estado.rayosxOn);
    else if (e.key === "Escape" && estado.grabando) ponerGrabacion(false);
    else return;
    e.preventDefault();
  });

  reloj = new THREE.Clock();
  window.addEventListener("resize", medir);
  medir();

  try {
    // Sin no-cache el navegador se queda con el modelo.json viejo y la app
    // arranca con datos que ya no existen. Revalida, no se salta la caché.
    modelo = await (await fetch("modelo.json", { cache: "no-cache" })).json();
    indexarPiezas();
  } catch (e) {
    fallo("Could not read modelo.json");
    return;
  }

  // Draco: el modelo sin comprimir son 3,2 MB y comprimido 0,64. Para un enlace
  // que se abre desde LinkedIn, casi siempre en el móvil, esa diferencia es la
  // que decide si alguien espera o se va.
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/");
  const cargador = new GLTFLoader();
  cargador.setDRACOLoader(draco);
  // El cargador de glTF envuelve la llamada de exito en un try/catch y manda
  // cualquier excepcion de montar() a este mismo manejador. Si aqui se tira el
  // error a la basura, un fallo de montaje se disfraza de "no se pudo cargar" y
  // se depura a ciegas: por eso se escribe.
  cargador.load("sofi.glb", (gltf) => montar(gltf), null, (e) => {
    console.error("SoFi: failed to build the model", e);
    fallo("Could not load sofi.glb");
  });
  // El escenario va aparte: si no llega, la herramienta sigue sirviendo para lo
  // que sirve. No bloquea.
  try {
    sitio = await (await fetch("escenario.json", { cache: "no-cache" })).json();
  } catch (e) {
    sitio = null;
  }
  cargador.load("escenario.glb", (g) => montarEscenario(g), null, () => {});
  // El banco va aparte del escenario: son los únicos que se mueven, y mezclarlos
  // con la geometría fija habría obligado a buscarlos dentro de ella cada vez.
  cargador.load("peces.glb", (g) => montarBanco(g), null, () => {});
}

function fallo(txt) {
  const c = $("#cargando");
  c.innerHTML = "";
  const p = crear("p");
  p.textContent = txt + " — it has to be served over HTTP, not opened as a loose file.";
  c.appendChild(p);
}

// El cargador de glTF limpia los nombres: quita los puntos y cambia los espacios
// por guiones bajos, así que "Cylinder.004" llega a la escena como "Cylinder004".
// Eran 15 piezas que nunca casaban con su ficha — la cámara hidráulica entera
// entre ellas, que por eso no se despiezaba nunca y no se notaba.
const _fichas = {};
const sinFicha = [];

function limpiarNombre(n) {
  return n.replace(/\s/g, "_").replace(/[^\w-]/g, "");
}

function indexarPiezas() {
  for (const n in modelo.piezas) {
    _fichas[n] = modelo.piezas[n];
    _fichas[limpiarNombre(n)] = modelo.piezas[n];
  }
}

function fichaDe(obj) {
  // Si una malla lleva varios materiales, el cargador la parte en trozos y los
  // nombra por el bloque de datos, no por el objeto: la ficha está en el grupo
  // padre. (Así se perdía el cilindro hidráulico, que llegaba partido en dos.)
  let o = obj;
  for (let i = 0; o && i < 3; i++, o = o.parent) {
    const f = _fichas[o.name] || _fichas[limpiarNombre(o.name)];
    if (f) return f;
  }
  return null;
}

// ───────────────────────── montaje ─────────────────────────
let conAO = 0;      // cuántos materiales traen oclusión horneada

function montar(gltf) {
  raiz = gltf.scene;
  // El pez va dentro de un grupo: lo que recorre el escenario es el grupo, y el
  // modelo se queda intacto en su sitio. Así las vistas técnicas siguen siendo
  // exactas con sólo devolver el grupo al origen.
  nadador = new THREE.Group();
  nadador.name = "Nadador";
  nadador.add(raiz);
  escena.add(nadador);
  nadador.updateWorldMatrix(true, true);
  raiz.updateWorldMatrix(true, true);

  // Asidero de depuracion, solo con ?dbg en la direccion. Sirve para medir sobre
  // la escena de verdad en vez de suponer.
  if (location.search.includes("dbg")) window.__dbg = {
    escena, raiz, camara, control, estado, piezas, THREE, modelo, render, oceano,
    puntosVivos, distanciaNube, colocar, avanceCapa, centroNube, repintar,
  };

  const cen = new THREE.Vector3(...modelo.centro);

  // El disco de sombra de contacto se ha retirado: tenía sentido con el pez
  // posado sobre un suelo de estudio. Debajo del agua está nadando, no apoyado.

  // Piezas: material propio por malla (los del GLB van compartidos y al atenuar
  // una pieza se atenuarían todas las que comparten material).
  raiz.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    // Todo proyecta y todo recibe: lo que hace legible un interior apretado no
    // es la luz, es que una pieza se note sobre la de al lado.
    o.castShadow = true;
    o.receiveShadow = true;
    // La oclusión horneada en Cycles. Viene dentro del GLB por el canal de
    // oclusión de glTF, así que el cargador ya la ha enganchado: aquí sólo se
    // ajusta cuánto pesa. En three.js el aoMap multiplica la luz INDIRECTA —el
    // hemisférico y el mapa de entorno—, no la clave, que es lo correcto: una
    // junta no deja de recibir el sol por estar en un rincón, lo que no le
    // llega es el rebote. Por eso hace falta pasarse de 1 para que se note.
    if (o.material.aoMap) {
      o.material.aoMapIntensity = 1.6;
      conAO++;
    }
    // Más entorno que antes: ahora el entorno ES el agua, así que de ahí sale el
    // color del ambiente y no de un gris de estudio.
    o.material.envMapIntensity = 0.5;
    // Cada familia de material tiene su piel. Los números son el tamaño del
    // grano (más alto = más fino) y cuánta aspereza le mete encima.
    const n = o.material.name || "";
    // Para que el degradado tenga algo que mover, la silicona de las palas
    // necesita grosor declarado: sin thickness, la transmisión del glTF se
    // comporta como una lámina sin volumen y no se nota el afilado.
    // El vidrio óptico: lo que lo hace parecer cristal no es la transmisión sino
    // el canto y el reflejo. Sin grosor declarado son arandelas transparentes.
    if (n.includes("OPT_Vidrio")) {
      registrarSilicona(o.material);
      o.material.thickness = 0.0016;
      o.material.attenuationColor = new THREE.Color("#dff4ff");
      o.material.attenuationDistance = 0.02;
      o.material.envMapIntensity = 1.35;
      o.material.specularIntensity = 1.0;
      o.material.clearcoat = 0.35;
    }
    if (n.includes("Aleta")) {
      registrarSilicona(o.material);
      o.material.thickness = Math.max(o.material.thickness || 0, 0.004);
      o.material.attenuationColor = new THREE.Color("#cfe8ea");
      o.material.attenuationDistance = 0.05;
    }
    // Las dos aletas de membrana — la caudal y la dorsal — no son palas
    // delgadas: son láminas. Lo que las define es lo que la luz hace AL
    // ATRAVESARLAS, así que el color va en el volumen y no en la superficie:
    // se acumula con el camino recorrido, de modo que la raíz sale azul y el
    // borde de salida casi incoloro. Eso es un degradado que no hay que
    // pintar — sale de la física.
    // Lo translúcido no puede proyectar una sombra maciza: una aleta de
    // silicona que deja pasar el 80 % de la luz dibujando una mancha negra
    // debajo es peor que no tener sombra. three.js no sabe proyectar sombras
    // parciales sin trucos caros, así que estas piezas simplemente no proyectan
    // — y sí reciben, que es lo que se nota.
    if (n.includes("Membrana") || n.includes("OPT_Vidrio") || n.includes("Aleta")) {
      o.castShadow = false;
    }
    if (n.includes("Membrana")) {
      registrarSilicona(o.material);
      o.material.thickness = 0.0022;
      // El azul sale del VOLUMEN, no de la superficie, y por eso es un
      // degradado que no hay que pintar: la raíz, más gruesa, tiñe más que el
      // borde de salida. La distancia es corta (6 mm) justo para que esos dos
      // milímetros de lámina basten para que se note.
      o.material.attenuationColor = new THREE.Color("#2d7fae");
      o.material.attenuationDistance = 0.010;
      // Aquí me equivoqué primero: le puse reflejo de entorno alto, laca e
      // iridiscencia, pensando en lo que hacen sobre una superficie curva. Pero
      // estas aletas son PLANAS, así que las tres devolvían el mismo trozo de
      // agua en toda la lámina y la dejaban como un espejo azul opaco — justo
      // lo contrario de translúcida. Medido con los reflejos a cero: la roca de
      // detrás se veía a través. Así que el reflejo se queda al nivel del resto
      // de la escena y no se le apila nada más encima.
      o.material.envMapIntensity = 0.50;
      o.material.specularIntensity = 0.55;
      // Sólo el canto mojado, a contraluz rasante. Es lo que dice que la lámina
      // tiene superficie y no es un agujero recortado.
      o.material.sheen = 0.14;
      o.material.sheenColor = new THREE.Color("#d8f0fa");
      o.material.sheenRoughness = 0.60;
    }
    // Medido en primer plano: con el relieve a 0,55 y el grano a 210 el casco
    // parecía tela, no plástico. El poro tiene que adivinarse, no leerse.
    if (n.includes("Silicona")) oceano.aplicarCausticas(o.material, 0.34, 330, 0.14);
    // La membrana es más lisa que la pala: menos poro y más fino. Lleva el
    // degradado de la cola (último argumento), que va por posición: adelgaza
    // la caudal hacia la punta y deja la dorsal igual, que es lo correcto.
    else if (n.includes("Membrana")) oceano.aplicarCausticas(o.material, 0.14, 520, 0.06, 1);
    // La aleta lleva además el degradado de la cola: el último argumento.
    else if (n.includes("Aleta")) oceano.aplicarCausticas(o.material, 0.24, 380, 0.10, 1);
    else if (n.includes("Casco")) oceano.aplicarCausticas(o.material, 0.16, 560, 0.09);
    else if (n.includes("Impreso")) {
      // Lo impreso en 3D tiene capas, no poro: grano más fino y más mate.
      oceano.aplicarCausticas(o.material, 0.30, 680, 0.13);
    } else if (n.includes("Esqueleto")) oceano.aplicarCausticas(o.material, 0.18, 520, 0.09);
    else oceano.aplicarCausticas(o.material);
    const ficha = fichaDe(o);
    if (!ficha) { sinFicha.push(o.name); return; }

    // Salida de la torreta óptica. Se convierte a espacio local igual que se
    // hacía con el despiece: el vector viene en mundo y la pieza puede colgar de
    // un padre con rotación.
    let salida = null;
    const d = ficha.despliegue;
    if (d && (d[0] || d[1] || d[2]) && o.parent) {
      const mundo = o.getWorldPosition(new THREE.Vector3());
      const destino = mundo.clone().add(new THREE.Vector3(...d));
      salida = o.parent.worldToLocal(destino).sub(o.position);
    }
    piezas.push({
      malla: o, conjunto: ficha.conjunto, salida, reposo: o.position.clone(),
      // En qué capa de la radiografía está, o -1 si no se desvanece nunca.
      capa: Number.isInteger(ficha.capa) ? ficha.capa : -1,
      // La transmisión del glTF (las aletas de silicona) se gestiona sola: si le
      // encima opacidad se emborrona, así que se recuerda para no tocarla.
      trans: (o.material.transmission || 0) > 0,
      opacoDepth: o.material.depthWrite,
      cara: o.material.side,
    });
  });

  // Animación.
  if (gltf.animations.length) {
    mezclador = new THREE.AnimationMixer(raiz);
    accion = mezclador.clipAction(gltf.animations[0]);
    accion.play();
    medirHuesos(gltf.animations[0]);
    medirAmplitud(gltf.animations[0]);
  }

  // Una malla sin ficha no se despieza, no se aisla y no cuenta en los totales,
  // y antes se perdia en silencio: eran 15, el cilindro hidraulico entre ellas.
  if (sinFicha.length) {
    console.warn("SoFi: " + sinFicha.length + " meshes with no entry in modelo.json: "
      + sinFicha.join(", "));
  }

  // Área de una pala pectoral, medida sobre la malla. Hace falta para el par:
  // sin ella habría que inventarse un número, y el panel dejaría de decir algo.
  let areaPala = 0, envergadura = 0;
  raiz.traverse((o) => {
    if (!o.isMesh || o.name !== "Cylinder") return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c2 = new THREE.Vector3();
    let total = 0;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1,
            i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c2.fromBufferAttribute(pos, i2);
      total += b.sub(a).cross(c2.sub(a)).length() * 0.5;
    }
    // La malla tiene las dos caras y las dos palas: el área útil es la cuarta
    // parte de lo que suman sus triángulos.
    areaPala = total / 4;
    const caja = new THREE.Box3().setFromObject(o);
    envergadura = (caja.max.x - caja.min.x) / 2;
  });
  servos = crearServos(raiz, areaPala, envergadura);
  console.info("SoFi: pala pectoral %.1f cm², envergadura %.0f mm",
    areaPala * 1e4, envergadura * 1000);

  construirUI();
  irA("hero", true);
  $("#cargando").classList.add("fuera");
  render.setAnimationLoop(bucle);
}


// Recorre el ciclo una vez y mide cada hueso: cuál es su postura media (la
// referencia de "recto") y cuánto se separa como máximo. Sin esto los ángulos
// saldrían medidos contra un fotograma cualquiera y no significarían nada.
// Recorrido lateral de la punta de la caudal a lo largo de un ciclo, en metros.
// Es uno de los dos factores del número de Strouhal, así que no vale estimarlo:
// se mide barriendo la animación y mirando dónde acaba el hueso de verdad.
let amplitudCaudal = 0;

function medirAmplitud(clip) {
  const caudal = [];
  raiz.traverse((o) => { if (o.isBone && o.name === "CAUDAL") caudal.push(o); });
  if (!caudal.length) return;
  const N = modelo.animacion.fotogramas || 54;
  const p = new THREE.Vector3();
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < N; i++) {
    accion.time = (i / N) * clip.duration;
    mezclador.update(0);
    raiz.updateWorldMatrix(true, true);
    caudal[0].getWorldPosition(p);
    if (p.x < min) min = p.x;
    if (p.x > max) max = p.x;
  }
  accion.time = 0;
  mezclador.update(0);
  amplitudCaudal = max - min;
}

function medirHuesos(clip) {
  const nombres = modelo.huesos_cola || [];
  const mapa = new Map();
  raiz.traverse((o) => { if (o.isBone && nombres.includes(o.name)) mapa.set(o.name, o); });

  const N = modelo.animacion.fotogramas || 54;
  const muestras = new Map([...mapa.keys()].map((k) => [k, []]));
  for (let i = 0; i < N; i++) {
    accion.time = (i / N) * clip.duration;
    mezclador.update(0);
    for (const [k, b] of mapa) muestras.get(k).push(b.quaternion.clone());
  }
  accion.time = 0;
  mezclador.update(0);

  for (const [k, b] of mapa) {
    const qs = muestras.get(k);
    // Media de cuaterniones alineando signos; basta para una referencia.
    const acc = new THREE.Quaternion(0, 0, 0, 0);
    for (const q of qs) {
      const s = (q.x * qs[0].x + q.y * qs[0].y + q.z * qs[0].z + q.w * qs[0].w) < 0 ? -1 : 1;
      acc.x += q.x * s; acc.y += q.y * s; acc.z += q.z * s; acc.w += q.w * s;
    }
    acc.normalize();
    const ref = acc.clone().invert();

    // El eje de giro: el que más se mueve a lo largo del ciclo.
    const d = new THREE.Quaternion(), v = new THREE.Vector3();
    let eje = new THREE.Vector3(0, 0, 1), mejor = 0, maximo = 0;
    for (const q of qs) {
      d.copy(ref).multiply(q);
      v.set(d.x, d.y, d.z);
      if (v.length() > mejor) { mejor = v.length(); eje = v.clone().normalize(); }
      maximo = Math.max(maximo, 2 * Math.atan2(v.length(), Math.abs(d.w)));
    }
    huesos.push({ nombre: k, hueso: b, ref, eje, maximo: Math.max(maximo, 1e-4) });
  }
}

function anguloVivo(h) {
  const d = h.ref.clone().multiply(h.hueso.quaternion);
  const v = new THREE.Vector3(d.x, d.y, d.z);
  const a = 2 * Math.atan2(v.length(), Math.abs(d.w));
  return v.dot(h.eje) < 0 ? -a : a;
}

// ───────────────────────── interfaz ─────────────────────────
// Los huesos se llaman en castellano en la armadura —COLA_01, CAUDAL, PECT_D—
// y así se quedan: renombrarlos en el .blend tocaría el modelo y rompería las
// ataduras de la animación ya exportada, mucho riesgo por una etiqueta. Se
// traducen SÓLO para enseñarlos; el nombre de dentro no se toca.
const ROTULO_HUESO = {
  CUERPO: "Body", CAUDAL: "Caudal", PECT_D: "Pectoral R", PECT_I: "Pectoral L",
};

function rotularHueso(nombre) {
  if (ROTULO_HUESO[nombre]) return ROTULO_HUESO[nombre];
  const m = /^COLA_(\d+)$/.exec(nombre);
  if (m) return "Tail " + m[1];
  return nombre.replace("_", " ");
}

function construirUI() {
  $("#sub").textContent = modelo.subtitulo;
  $("#n-huesos").textContent = huesos.length + " bones";
  $("#hz").textContent = modelo.animacion.frecuencia_hz.toFixed(2);
  $("#pie-izq").textContent = modelo.origen;

  for (let i = 0; i < BARRAS; i++) $("#carga-barras").appendChild(crear("i"));
  for (let i = 0; i < BARRAS; i++) $("#bat-barras").appendChild(crear("i"));

  // 01 — un medidor por hueso de la cadena.
  $("#huesos").innerHTML = "";
  for (const h of huesos) {
    const li = crear("li");
    li.innerHTML = `<span>${rotularHueso(h.nombre)}</span><u><i class="centro"></i></u><b>0.0°</b>`;
    $("#huesos").appendChild(li);
    h.el = li.querySelector("i");
    h.val = li.querySelector("b");
  }

  // 02 — hidrostática. Lo que no depende de la profundidad va aquí una vez.
  $("#vol-casco").textContent = modelo.hidro.volumen_l.toFixed(2) + " l";
  $("#sup-casco").textContent = Math.round(modelo.hidro.superficie_cm2) + " cm²";

  // La profundidad se queda FIJA en 4 m. El deslizador se quitó: mover un
  // número y ver cambiar otros tres no contaba nada que el panel no contara ya
  // quieto. Los datos hidrostáticos siguen saliendo del mismo cálculo.
  aplicarProfundidad();

  // 03 — ficha del APARATO, no del fichero. Las cotas y el sobre de vuelo son
  // las publicadas por el MIT para el SoFi; la última fila dice lo que mide
  // esta reconstrucción, que no es exactamente lo mismo, y queda a la vista en
  // vez de disimularse.
  const p = modelo.cota_publicada_mm, m = modelo.cota_mm;
  filas("#cotas", [
    ["Overall length", p.largo.toFixed(0) + " mm"],
    ["Rigid head", p.cabeza.toFixed(0) + " mm"],
    ["Actuated tail", p.cola.toFixed(0) + " mm"],
    ["Body height", p.alto_cuerpo.toFixed(0) + " mm"],
    ["Max depth", "18 m"],
    ["Endurance", "40 min"],
    ["Battery", "LiPo"],
    ["Cruise", "0.5 L/s"],
    ["This reconstruction", m.largo.toFixed(0) + " mm"],
  ]);
  // 04 — modo. Tres estados que se excluyen, en una sola barra sobre la escena.
  // Antes esto eran cinco botones de vista más tres interruptores sueltos en una
  // columna, y había que leerlos para saber en cuál estabas.
  // Dos modos y no tres. "Giro" nunca fue un modo: era el mismo estático con
  // la cámara dando vueltas sola, así que ocupaba un tercio de la barra para
  // decir lo que dice un interruptor. Ahora está abajo, con los demás.
  // Demo sube a la barra: no es un interruptor que acompaña a otra cosa, es un
  // estado en el que la herramienta se conduce sola. Giro bajó y Demo subió por
  // la misma razón — cada uno a donde le corresponde.
  // Dos modos, no tres. El de demo se quito a peticion de Antonio: conducia la
  // escena el solo y se cruzaba con lo que estuviera haciendo quien mira. En un
  // enlace que se abre desde una red social, que la herramienta te arrebate el
  // control es peor que no tener demo.
  //
  // El codigo del guion sigue mas abajo, desconectado. No se borra porque esta
  // carpeta no esta en git: borrarlo seria tirarlo. Para devolverlo, basta con
  // reponer "demo" en esta linea, en MANDOS_POR_MODO y en ponerModo().
  for (const [id, txt] of [["estatico", "Static"], ["nado", "Swim"]]) {
    const b = crear("button");
    b.textContent = txt;
    b.setAttribute("aria-pressed", String(estado.modo === id));
    b.onclick = () => ponerModo(id);
    botonesModo[id] = b;
    $("#modos-barra").appendChild(b);
  }

  modos([
    ["giro", "Orbit", "giro", (v) => { control.autoRotate = v && !estado.nado; }],
    ["puntos", "Points", "rotulos", () => aplicarMando()],
    ["entorno", "Reef", "entorno", () => { entornoManual = true; aplicarEntorno(); }],
    ["fpv", "FPV camera", "fpv", () => aplicarFPV()],
    ["grabar", "Record", "grabando", (v) => ponerGrabacion(v)],
    ["tema", "Theme", null, () => {
      const osc = document.documentElement.getAttribute("data-theme") === "dark" ||
        (!document.documentElement.getAttribute("data-theme") &&
          matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.setAttribute("data-theme", osc ? "light" : "dark");
    }, true],
  ]);
  const mandos = [...$("#modos").querySelectorAll("button")];
  botonEntorno = mandos.find((b) => b.dataset.mando === "entorno") || null;

  // Los puntos salen encendidos: son la invitación a tocar, y el enlace que
  // comparta la gente tiene que decir "esto se puede explorar" sin instrucciones.

  // ── las dos vistas ──────────────────────────────────────────────────────
  const cv = $("#cambio-vista");
  cv.onclick = () => {
    const tecnico = document.documentElement.getAttribute("data-vista") === "tecnico";
    document.documentElement.setAttribute("data-vista", tecnico ? "simple" : "tecnico");
    cv.setAttribute("aria-pressed", String(!tecnico));
    // La escena cambia de ancho: hay que remedir y reencuadrar.
    medir();
  };

  // ── pista de primera vez ────────────────────────────────────────────────
  // Se va al primer clic en cualquier parte de la escena, no sólo en un punto:
  // si alguien ya está tocando, la pista sobra.
  const pista = $("#pista");
  const quitarPista = () => {
    pista.classList.add("fuera");
    lienzo.removeEventListener("pointerdown", quitarPista);
    $("#rotulos").removeEventListener("pointerdown", quitarPista);
  };
  lienzo.addEventListener("pointerdown", quitarPista);
  $("#rotulos").addEventListener("pointerdown", quitarPista);
  // Y sola a los doce segundos: si nadie toca, ya no hace falta insistir.
  setTimeout(quitarPista, 12000);

  const bp = mandos.find((b) => b.dataset.mando === "puntos");
  if (bp) bp.setAttribute("aria-pressed", "true");
  estado.rotulos = true;
  // aplicarMando() va DESPUÉS de encender los puntos. Puesto antes —que es
  // donde estaba— los ocultaba y ya nadie los volvía a enseñar: la herramienta
  // arrancaba sin marcadores y con el botón apagado.
  aplicarMando();
  aplicarEntorno();
  // Con ?demo en la dirección arranca sola: es como se graba sin que se vea
  // un ratón moviéndose por encima. Va por ponerModo para que la barra quede
  // diciendo la verdad.

  $("#rayosx").onclick = () => ponerRayosX(!estado.rayosxOn);

  $("#ficha-cerrar").onclick = () => seleccionarPunto(null);
  $("#tarjeta-volver").onclick = () => seleccionarPunto(null);

  construirRotulos();
}

function filas(sel, pares) {
  const dl = $(sel); dl.innerHTML = "";
  for (const [k, v] of pares) {
    const dt = crear("dt"), dd = crear("dd");
    dt.textContent = k; dd.textContent = v;
    dl.append(dt, dd);
  }
}

// Cada mando lleva un ID estable en `data-mando`, y la etiqueta es solo
// etiqueta. Antes la identidad del boton ERA su texto visible: se le buscaba
// con `textContent === "Entorno"` y los modos listaban que mandos ensenaban por
// esa misma cadena. Con eso, traducir la interfaz rompia la logica en sitios
// que no se parecen en nada a una traduccion, y en silencio — el boton
// simplemente dejaba de encontrarse.
function modos(lista) {
  for (const [id, txt, clave, fn, soloTecnico] of lista) {
    const b = crear("button");
    b.dataset.mando = id;
    b.textContent = txt;
    if (soloTecnico) b.classList.add("solo-tecnico");
    b.setAttribute("aria-pressed", "false");
    b.onclick = () => {
      if (clave) {
        estado[clave] = !estado[clave];
        b.setAttribute("aria-pressed", String(estado[clave]));
        fn(estado[clave]);
      } else fn();
    };
    $("#modos").appendChild(b);
  }
}

// Las barras de los servos son las mismas que las de la cola, que ya funcionan:
// crecen desde el centro hacia el lado del signo.
let servoFilas = null;

function pintarServos(datos) {
  const cont = $("#servos");
  if (!cont) return;
  if (!servoFilas) {
    cont.innerHTML = "";
    servoFilas = datos.map((d) => {
      const li = crear("li");
      li.innerHTML = `<span>${d.id}</span><u><i></i></u><b></b>`;
      cont.appendChild(li);
      return { barra: li.querySelector("i"), val: li.querySelector("b") };
    });
    $("#servos-nota").textContent =
      "Torque estimated by thin-aerofoil theory over the measured blade area. " +
      "Load relative to a 2.5 kg·cm sealed micro servo.";
  }
  datos.forEach((d, i) => {
    const f = servoFilas[i];
    f.barra.style.left = (d.n < 0 ? 50 + d.n * 50 : 50) + "%";
    f.barra.style.width = Math.abs(d.n) * 50 + "%";
    f.val.textContent = d.g.toFixed(1) + "° · " + (d.par * 100).toFixed(1) + " N·cm";
  });
}

function construirRotulos() {
  // El ancla está separada del conjunto, así que hace falta la línea guía: sin
  // ella no se sabe a qué pieza apunta cada marcador.
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  $("#rotulos").appendChild(svg);

  // El casco se queda sin marcador: agrupa piezas pero no es punto de interés.
  // Y la numeración sale del orden en que vienen, que el exportador ya ordena
  // de proa a popa.
  modelo.conjuntos.filter((c) => c.punto !== false).forEach((c, i) => {
    // Ya no son rótulos: son puntos de interés. Se pulsan, la cámara vuela y se
    // abre su ficha. Es lo que convierte la pieza en algo que se explora.
    const el = crear("div", "punto");
    const bola = crear("span", "punto-bola");
    bola.textContent = String(i + 1).padStart(2, "0");
    const txt = crear("span", "punto-txt");
    txt.textContent = c.titulo;
    el.append(bola, txt);
    el.onclick = () => seleccionarPunto(estado.conjunto === c.id ? null : c.id);
    el.title = `${c.titulo} — ${c.n_piezas} parts`;
    c.marcador = el;
    c.indice = i + 1;
    $("#rotulos").appendChild(el);

    const linea = document.createElementNS("http://www.w3.org/2000/svg", "line");
    svg.appendChild(linea);

    rotulos.push({
      el, linea, id: c.id,
      pos: new THREE.Vector3(...(c.ancla || c.centro)),
      pieza: new THREE.Vector3(...c.centro),
    });
  });
}

// ───────────────────────── entorno ─────────────────────────
// El arrecife se enciende solo en las vistas de presentación y se apaga en
// cuanto se mide o se despieza, que es donde le quitaría sitio a la lectura. El
// botón manda sobre eso: en cuanto se pulsa una vez, la decisión es del usuario
// y deja de cambiar por su cuenta.
let entornoManual = false;
let botonEntorno = null;

const botonesModo = {};

function montarBanco(gltf) {
  // Las cáusticas se pasan como retoque del material, no se aplican después:
  // aplicarCausticas reemplaza onBeforeCompile, y hecho después se llevaba por
  // delante la onda de nado de los peces.
  banco = crearBanco(gltf, escena, {
    semilla: 7,
    alMaterial: (m) => oceano.aplicarCausticas(m, 0.2, 240, 0.08),
  });
  if (!banco) return;
  banco.grupo.visible = estado.entorno;
}

function montarEscenario(gltf) {
  escenario = gltf.scene;
  escenario.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    matsEscenario.push(o.material);
    // El lecho sólo recibe: proyectar desde una malla de 44x84 que ocupa toda
    // la escena no aporta nada y se come el encuadre de sombra, que es
    // pequeño a propósito. Las rocas y los corales sí proyectan.
    o.receiveShadow = true;
    o.castShadow = !o.name.includes("Lecho");
    // Es fondo: se le baja el brillo y se le sube la aspereza para que no le
    // compita al sujeto, que es lo que se ha venido a ver.
    o.material.envMapIntensity = 0.55;
    o.material.roughness = Math.min(1, (o.material.roughness ?? 0.6) + 0.18);
    // En el lecho es donde más se ven las cáusticas: es lo que vende el agua.
    // Y la roca y la arena piden grano grueso, que es lo que son.
    oceano.aplicarCausticas(o.material, 0.5, 90, 0.10);
  });
  escena.add(escenario);
  // El camino sale del mismo cálculo que colocó las rocas: por construcción el
  // pez pasa entre ellas.
  if (sitio && sitio.camino && nadador) nado = crearNado(sitio.camino, nadador);
  aplicarEntorno();
}

// Qué mandos tienen sentido en cada modo. Nadando, los puntos de interés se
// apagan y se bloquean: abrir una ficha pararía el nado, que es justo lo que no
// se quiere mientras se está viendo nadar.
// Cada modo enseña sólo sus mandos. Antes estaban los siete siempre, y cuatro
// de ellos no hacían nada en la mitad de los casos — un mando que no sirve
// ahora mismo es ruido, no es una opción.
// "Grabar" y "Formato" están en todos los modos: son herramientas de estudio,
// no funciones del producto, y se necesitan tanto grabando el pez quieto como
// nadando.
const MANDOS_POR_MODO = {
  estatico: ["giro", "puntos", "entorno", "grabar", "tema"],
  nado: ["fpv", "grabar", "tema"],
};

function aplicarMando() {
  const modo = estado.modo;
  const nadando = modo === "nado";
  const permitidos = MANDOS_POR_MODO[modo] || MANDOS_POR_MODO.estatico;
  for (const b of $("#modos").querySelectorAll("button")) {
    b.hidden = !permitidos.includes(b.dataset.mando);
  }
  $("#rotulos").style.display = modo !== "estatico" || !estado.rotulos ? "none" : "";
  $("#pista")?.classList.toggle("oculta", modo !== "estatico");
}

// El arrecife ENTRA Y SALE, no se enciende y se apaga. Antes era
// `escenario.visible = true/false`, y como además se disparaba solo al mover la
// radiografía, el fondo entero desaparecía de un fotograma al siguiente: el
// corte más brusco que tenía la herramienta.
const matsEscenario = [];
const entornoA = { valor: 1, meta: 1 };
const ENTORNO_S = 0.9;

function aplicarEntorno() {
  if (!entornoManual) {
    // Nadando el escenario SIEMPRE se ve: es por donde pasa.
    estado.entorno = estado.nado
      || ((estado.vista === "hero" || estado.vista === "cenital")
          && estado.rayosx < 0.05);
  }
  entornoA.meta = estado.entorno ? 1 : 0;
  if (escenario && entornoA.meta > 0) escenario.visible = true;
  if (botonEntorno) botonEntorno.setAttribute("aria-pressed", String(estado.entorno));
}

function avanzarEntorno(dt) {
  if (entornoA.valor === entornoA.meta) return;
  const paso = dt / ENTORNO_S;
  entornoA.valor += Math.sign(entornoA.meta - entornoA.valor) * paso;
  if (Math.abs(entornoA.meta - entornoA.valor) < paso) entornoA.valor = entornoA.meta;
  const v = entornoA.valor;
  for (const m of matsEscenario) {
    m.transparent = v < 0.999;
    m.opacity = v;
    // Mientras se desvanece deja de escribir profundidad: si no, lo que queda
    // a medio tapar recorta al pez con un canto duro.
    m.depthWrite = v > 0.9;
  }
  if (escenario) escenario.visible = v > 0.001;
  // Los peces se van con el arrecife: son parte del sitio, no del aparato.
  if (banco) banco.grupo.visible = v > 0.001;
}

// ───────────────────────── acciones ─────────────────────────
// La radiografía atraviesa el pez de fuera adentro. Cada capa recorre su tramo
// del deslizador, solapado con el siguiente: la piel y las aletas primero, luego
// la carcasa rígida, y al final la estructura de la cola. Nada se mueve de sitio
// — eso era el despiece anterior y se ha retirado entero.
const TRAMOS = [
  [0.00, 0.46],   // piel y aletas
  [0.28, 0.76],   // carcasa rígida
  [0.58, 1.00],   // estructura de la cola
];
// No llegan a cero: un resto de silueta mantiene la lectura del volumen y da el
// contorno de cristal. Desaparecer del todo deja las tripas flotando en el agua.
const RESTO = 0.085;

function suave(x) { return x * x * (3 - 2 * x); }

function avanceCapa(capa, t) {
  const tr = TRAMOS[capa];
  if (!tr) return 0;
  return suave(Math.min(1, Math.max(0, (t - tr[0]) / (tr[1] - tr[0]))));
}

// La opacidad de cada pieza depende de DOS cosas a la vez: el conjunto aislado y
// la radiografía. Antes cada una escribía por su cuenta sobre la misma propiedad
// y mandaba la última que hablase. Ahora decide un solo sitio.
function repintar() {
  for (const p of piezas) {
    const m = p.malla.material;
    let op = 1;
    // 0,018 y no 0,055: hay muchas capas y al sumarse unas sobre otras lo
    // aislado quedaba detrás de una neblina. La silueta se sigue adivinando.
    if (estado.conjunto && p.conjunto !== estado.conjunto) op = 0.018;
    else if (p.capa >= 0) {
      op = 1 - avanceCapa(p.capa, estado.rayosx) * (1 - RESTO);
    }
    // Las capas atravesadas se pintan por las dos caras: la pared doble oscurece
    // sola en los bordes y da el contorno. A una cara se desvanecen del todo y se
    // pierde la silueta, que es lo que tiene que quedar.
    if (p.capa >= 0) m.side = op < 0.98 ? THREE.DoubleSide : p.cara;
    m.opacity = op;
    // A una pieza transmisiva no se le pone bandera de transparente salvo que de
    // verdad se esté atenuando: si no, se descoloca el orden de pintado.
    m.transparent = op < 0.999 ? true : p.trans ? m.transparent : false;
    m.depthWrite = op > 0.9 ? p.opacoDepth : false;
    // Interruptor del halo: se enciende en las piezas del conjunto aislado.
    // Sólo marca CUÁLES; cuánto brillan lo lleva un único valor compartido que
    // se anima en el bucle.
    const u = m.userData.sh?.uniforms?.uHaloEste;
    if (u) u.value = estado.conjunto && p.conjunto === estado.conjunto ? 1 : 0;
  }
}

function aislar(id) {
  estado.conjunto = id;
  halo.meta = id ? 1 : 0;
  repintar();
  for (const c of modelo.conjuntos) c.marcador?.classList.toggle("activo", c.id === id);
  const c = modelo.conjuntos.find((x) => x.id === id);
  $("#estado-grande").textContent = c ? c.titulo : "";
  $("#m-estado").textContent = c ? "Isolated" : (estado.nado ? "Swim" : "Idle");
  pintarFicha(c);
}

// ── puntos de interés ──────────────────────────────────────────────────────
function pintarFicha(c) {
  $("#ficha-vacia").hidden = !!c;
  $("#ficha-cuerpo").hidden = !c;
  // La tarjeta sobre la escena se llena siempre: en vista simple es lo único
  // que cuenta qué se está mirando.
  pintarTarjeta(c);
  if (!c) return;
  $("#ficha-num").textContent = String(c.indice).padStart(2, "0");
  $("#ficha-titulo").textContent = c.titulo;
  $("#ficha-sub").textContent = c.subtitulo;
  $("#ficha-texto").textContent = c.descripcion || "";
  filas("#ficha-datos", [
    ["Parts", String(c.n_piezas)],
    ["Length", c.cota_mm.largo.toFixed(0) + " mm"],
    ["Width", c.cota_mm.ancho.toFixed(0) + " mm"],
    ["Height", c.cota_mm.alto.toFixed(0) + " mm"],
  ]);
  // Sólo la óptica tiene algo que accionar; los demás puntos no traen botón.
  const acc = $("#ficha-acciones");
  acc.innerHTML = "";
  botonOptica = null;
  if (c.id === "optica") {
    const b = crear("button");
    b.onclick = () => ponerOptica(despliegueMeta < 0.5);
    acc.appendChild(b);
    botonOptica = b;
    ponerOptica(despliegueMeta > 0.5);
  }
}

// La tarjeta de la escena: qué es, para qué sirve, tres cifras y cómo volver.
function pintarTarjeta(c) {
  const t = $("#tarjeta");
  if (!t) return;
  t.hidden = !c;
  if (!c) return;
  $("#tarjeta-num").textContent = "Point " + String(c.indice).padStart(2, "0");
  $("#tarjeta-titulo").textContent = c.titulo;
  $("#tarjeta-texto").textContent = c.descripcion || c.subtitulo;
  filas("#tarjeta-cifras", [
    ["Parts", String(c.n_piezas)],
    ["Length", c.cota_mm.largo.toFixed(0) + " mm"],
    ["Height", c.cota_mm.alto.toFixed(0) + " mm"],
  ]);
  // La óptica es la única que tiene algo que accionar desde aquí.
  const acc = $("#tarjeta-accion");
  acc.hidden = c.id !== "optica";
  if (!acc.hidden) {
    acc.textContent = despliegueMeta > 0.5 ? "Retract optics" : "Deploy optics";
    acc.onclick = () => {
      ponerOptica(despliegueMeta < 0.5);
      acc.textContent = despliegueMeta > 0.5 ? "Retract optics" : "Deploy optics";
    };
  }
}

// Cada punto se mira desde su propio ángulo: se parte del encuadre general y se
// gira hacia el lado por el que ese conjunto asoma. Así ninguno se ve desde el
// mismo sitio y la cámara siempre llega a un sitio que tiene sentido.
// La óptica es el único conjunto cuyo movimiento interesante va A LO LARGO del
// eje del pez. Mirada de frente —que es lo que da el cálculo, porque está en el
// morro— el despliegue se ve de canto y no se aprecia, ni se leen las focales
// grabadas en los costados de los barriletes. Se mira de tres cuartos.
// Casi de perfil a propósito. El tren óptico se abre a lo largo del eje del
// pez: mirado de frente, las piezas se superponen unas sobre otras y el abanico
// no se ve. De lado se lee la secuencia entera, que es de lo que va.
//
// El BCU y la bomba tenían el mismo problema por otra razón: están los dos
// SOBRE EL EJE del pez, así que el vector "hacia donde asoma el conjunto" casi
// no desvía nada y la cámara se quedaba de frente. En el BCU eso lo dejaba
// mirándose a través de toda la cabeza —que aunque esté atenuada se sigue
// dibujando— y salía una mancha oscura; y de frente un cilindro de 90 mm se ve
// como un círculo de 50, que no dice nada.
//
// El BCU se mira desde el costado IZQUIERDO a propósito: la escala de
// flotabilidad va grabada en x = -17 mm, y desde el otro lado no se lee.
// La bomba, desde atrás y de lado, que es por donde salen los manguitos hacia
// la cola: de frente se ven las bocas y no a dónde van.
const ANGULO_PROPIO = {
  optica: [0.97, 0.26, 0.24],
  // El sistema hidráulico se mira desde el costado izquierdo: la escala de
  // flotabilidad del cilindro va grabada en x = -17 mm, y desde el otro lado no
  // se lee. Es además el ángulo que deja ver la bomba y el cilindro a la vez.
  hidraulica: [-0.90, 0.30, -0.32],
};

function camaraDePunto(c) {
  const hero = modelo.camaras.find((x) => x.id === "hero");
  const propia = modelo.camaras.find((x) => x.id === c.id);
  if (propia) return propia;
  const fijo = ANGULO_PROPIO[c.id];
  if (fijo) return { id: c.id, titulo: c.titulo, dir: fijo, mira: c.centro };
  const d = new THREE.Vector3(...hero.dir).normalize();
  const fuera = new THREE.Vector3(...c.centro).sub(new THREE.Vector3(...modelo.centro));
  if (fuera.lengthSq() > 1e-8) d.addScaledVector(fuera.normalize(), 0.95).normalize();
  return { id: c.id, titulo: c.titulo, dir: d.toArray(), mira: c.centro };
}

function seleccionarPunto(id) {
  // Pulsar un punto es pedir verlo: si estaba nadando, se para y se va.
  if (id && estado.modo === "nado") ponerModo("estatico");
  // La torreta se abre al llegar a ella y se repliega al irse. Es el gesto que
  // esperas: si pido ver la cámara, quiero ver la cámara abierta.
  despliegueMeta = id === "optica" ? 1 : 0;
  aislar(id);
  const c = modelo.conjuntos.find((x) => x.id === id);
  irA(c ? camaraDePunto(c) : "hero");
}

// ── modo ───────────────────────────────────────────────────────────────────
function ponerModo(m) {
  estado.modo = m;
  for (const k in botonesModo) {
    botonesModo[k].setAttribute("aria-pressed", String(k === m));
  }
  if (m === "nado") {
    // Nadando no hay puntos de interés: lo que se está viendo es el bicho
    // moviéndose, y una ficha abierta encima sólo tapa. Lo que sí sigue
    // valiendo es la radiografía, que es justo lo que se quiere ver en marcha.
    if (estado.conjunto) seleccionarPunto(null);
    control.autoRotate = false;
    empezarNado();
    aplicarMando();
    aplicarFPV();
    return;
  }
  if (estado.nado) terminarNado();
  estado.fpv = false;
  aplicarFPV();
  control.autoRotate = estado.giro;
  aplicarMando();
  const c = modelo.conjuntos.find((x) => x.id === estado.conjunto);
  irA(c ? camaraDePunto(c) : "hero");
}

// Los rayos X pasan de deslizador a interruptor. Nadie necesitaba el 37 %: lo
// que se quiere es ver el bicho por dentro o no verlo.
//
// Pero el valor SIGUE siendo continuo por dentro, y eso no es un resto del
// deslizador: es lo que hace que el gesto sea una transición y no un corte. Las
// capas se desvanecen por tramos solapados —piel, carcasa, estructura— y ese
// barrido es justo lo que cuenta cómo está hecho. Un salto de 0 a 1 se lo
// comería.
const RAYOSX_S = 0.85;
let rayosxMeta = 0;

function ponerRayosX(v) {
  estado.rayosxOn = v;
  rayosxMeta = v ? 1 : 0;
  $("#rayosx")?.setAttribute("aria-pressed", String(v));
}

function avanzarRayosX(dt) {
  // Durante la demo manda el guion, que tiene su propio ritmo por paso.
  if (cine || estado.rayosx === rayosxMeta) return;
  const paso = dt / RAYOSX_S;
  estado.rayosx += Math.sign(rayosxMeta - estado.rayosx) * paso;
  if (Math.abs(rayosxMeta - estado.rayosx) < paso) estado.rayosx = rayosxMeta;
  aplicarRayosX();
}

function aplicarRayosX() {
  repintar();
  aplicarEntorno();
}

// Dónde está la geometría AHORA MISMO, como nube de puntos: las ocho esquinas de
// la caja de cada malla.
//
// Antes se encuadraba sobre una sola caja envolvente de toda la escena. Estaba
// bien calculada y aun así el pez salía a la mitad de tamaño, y la razón es que
// las esquinas de esa caja están VACÍAS: no hay geometría en ellas. En
// perspectiva son además las que más se abren, porque alguna cae muy cerca del
// objetivo. Medido: la caja llenaba el 78 % del encuadre y las mallas, el 49 %.
// Encuadraba aire.
const _nube = [];
let _nubeN = 0;

function tomar(x, y, z) {
  if (_nubeN === _nube.length) _nube.push(new THREE.Vector3());
  _nube[_nubeN++].set(x, y, z);
}

function puntosVivos(solo) {
  _nubeN = 0;
  // medir() se dispara al cambiar de tamaño, y eso puede pasar con el JSON ya
  // leído y el modelo todavía en vuelo. Sin esta guarda reventaba ahí y la
  // cámara se quedaba donde arrancó, con el pez diminuto.
  if (!raiz) return 0;
  raiz.updateWorldMatrix(true, true);
  for (const p of piezas) {
    if (solo && p.conjunto !== solo) continue;
    const g = p.malla.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox;
    const m = p.malla.matrixWorld;
    for (let i = 0; i < 8; i++) {
      tomar(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
      _nube[_nubeN - 1].applyMatrix4(m);
    }
  }
  return _nubeN;
}

function centroNube(n) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const q = _nube[i];
    mn[0] = Math.min(mn[0], q.x); mx[0] = Math.max(mx[0], q.x);
    mn[1] = Math.min(mn[1], q.y); mx[1] = Math.max(mx[1], q.y);
    mn[2] = Math.min(mn[2], q.z); mx[2] = Math.max(mx[2], q.z);
  }
  return new THREE.Vector3((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2);
}

const _esq = new THREE.Vector3();

function ejesDe(dir) {
  const aux = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const der = new THREE.Vector3().crossVectors(dir, aux).normalize();
  const arr = new THREE.Vector3().crossVectors(der, dir).normalize();
  const tv = Math.tan(THREE.MathUtils.degToRad(camara.fov) / 2);
  return { der, arr, tv, th: tv * camara.aspect };
}

function distanciaNube(n, dir, mira, e) {
  // Para cada punto, a qué distancia mínima entra en el cono de visión. La mayor
  // de todas es el ajuste exacto.
  let d = 0;
  for (let i = 0; i < n; i++) {
    _esq.copy(_nube[i]).sub(mira);
    const z = _esq.dot(dir);
    d = Math.max(d, z + Math.abs(_esq.dot(e.arr)) / e.tv, z + Math.abs(_esq.dot(e.der)) / e.th);
  }
  // El aire que queda es para los rótulos, que cuelgan por fuera de la silueta.
  return d * 1.12;
}

function colocar(c) {
  // Las vistas de detalle llevan de id el conjunto que enfocan, así que encuadran
  // solo ese; las generales, la escena entera.
  const solo = modelo.conjuntos.some((x) => x.id === c.id) ? c.id : null;
  const n = puntosVivos(solo);
  const dir = new THREE.Vector3(...c.dir).normalize();
  if (!n) return { pos: camara.position.clone(), mira: control.target.clone() };
  const e = ejesDe(dir);

  // Se apunta a lo que hay AHORA, no a la figura en reposo: al explotar, la nube
  // se desplaza y si no, la cámara se queda mirando a un lado.
  const mira = centroNube(n);
  let d = distanciaNube(n, dir, mira, e);

  // El centro de la caja en el espacio NO es el centro de lo que se ve: en
  // perspectiva los puntos cercanos se abren más que los lejanos, así que el
  // encuadre salía corrido un 20 % y, al tener que caber el lado que se iba, con
  // holgura de sobra en el otro. Se mide el centro sobre la propia pantalla y se
  // corrige la mira. En tres pasadas ya no se mueve.
  const cam = new THREE.Vector3();
  for (let paso = 0; paso < 3; paso++) {
    cam.copy(mira).addScaledVector(dir, d);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < n; i++) {
      _esq.copy(_nube[i]).sub(cam);
      const prof = -_esq.dot(dir);
      if (prof < 1e-4) continue;
      const u = _esq.dot(e.der) / (prof * e.th);
      const v = _esq.dot(e.arr) / (prof * e.tv);
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const du = (u0 + u1) / 2, dv = (v0 + v1) / 2;
    if (!isFinite(du) || !isFinite(dv)) break;
    mira.addScaledVector(e.der, du * d * e.th).addScaledVector(e.arr, dv * d * e.tv);
    d = distanciaNube(n, dir, mira, e);
    if (Math.abs(du) < 0.004 && Math.abs(dv) < 0.004) break;
  }

  return { pos: mira.clone().addScaledVector(dir, d), mira };
}

// Acepta el id de una cámara guardada o un descriptor hecho al vuelo, que es lo
// que usan los puntos de interés: seis conjuntos y sólo dos cámaras de detalle
// guardadas, así que los otros cuatro ángulos se calculan.
function irA(idOcam, inmediato) {
  const c = typeof idOcam === "string"
    ? modelo.camaras.find((x) => x.id === idOcam)
    : idOcam;
  if (!c) return;
  // Mirar algo concreto es pedir que el pez se esté quieto: las cotas y los
  // detalles se miden sobre el modelo centrado.
  if (estado.nado) {
    estado.nado = false;
    volviendo = true;
    pendiente = c;
    return;
  }
  estado.vista = c.id;
  tocado = false;
  $("#vista-activa").textContent = c.titulo;

  aplicarEntorno();

  const { pos, mira } = colocar(c);
  if (inmediato) {
    camara.position.copy(pos);
    control.target.copy(mira);
    control.update();
    return;
  }
  viaje = { t: 0, p0: camara.position.clone(), p1: pos, m0: control.target.clone(), m1: mira };
}

// ───────────────────────── torreta óptica ─────────────────────────
// Los tres barriletes salen escalonados —4, 6 y 8,2 mm— y el anillo de enfoque
// de cada uno sale menos que su barrilete, así que parece deslizar sobre él. El
// escalonado es lo que hace que se lea como un mecanismo y no como un pistón.
//
// Se despliega sola al elegir el punto de la cámara, que es el gesto natural, y
// además hay un botón en la ficha para abrirla y cerrarla a mano.
let despliegue = 0;          // lo que se ve ahora
let despliegueMeta = 0;      // a dónde va
let botonOptica = null;

function aplicarDespliegue() {
  const k = suave(despliegue);
  for (const p of piezas) {
    if (!p.salida) continue;
    p.malla.position.copy(p.reposo).addScaledVector(p.salida, k);
  }
}

function avanzarDespliegue(dt) {
  if (Math.abs(despliegueMeta - despliegue) < 0.001) {
    if (despliegue !== despliegueMeta) { despliegue = despliegueMeta; aplicarDespliegue(); }
    return;
  }
  // 1,4 s de recorrido: menos y no da tiempo a verlo, más y se hace lento.
  const paso = dt / 1.4;
  despliegue += Math.sign(despliegueMeta - despliegue) * Math.min(paso, Math.abs(despliegueMeta - despliegue));
  aplicarDespliegue();
  // Y se vuelve a encuadrar mientras se abre. El tren se despliega 16 mm sobre
  // un conjunto que mide 10: encuadrado en plegado, al abrirse se salía entero
  // de cuadro y la pantalla se quedaba en azul.
  if (!tocado && estado.conjunto === "optica" && !estado.nado) {
    const c = modelo.conjuntos.find((x) => x.id === "optica");
    const { pos, mira } = colocar(camaraDePunto(c));
    camara.position.copy(pos);
    control.target.copy(mira);
    viaje = null;
  }
}

function ponerOptica(abierta) {
  despliegueMeta = abierta ? 1 : 0;
  botonOptica?.setAttribute("aria-pressed", String(abierta));
  if (botonOptica) botonOptica.textContent = abierta ? "Retract optics" : "Deploy optics";
}

// ───────────────────────── servos ─────────────────────────
// Las pectorales no baten: son superficies de mando. Se deflectan en sentidos
// opuestos para apoyar el giro y juntas para subir o bajar. Las dos órdenes
// salen del recorrido real, no de una animación.
function gobernarServos(dt) {
  let alabeo = 0, cabeceo = 0;
  if (estado.nado && nado) {
    alabeo = nado.alabeo;
    // El camino sube y baja; la componente vertical de la tangente es,
    // literalmente, la orden de cabeceo que el bicho necesita para seguirlo.
    cabeceo = -nado.tangenteY * 1.5;
  }
  servos.mandar(alabeo, cabeceo);
  servos.actualizar(dt);
}

// ───────────────────────── profundidad ─────────────────────────
// El deslizador de profundidad no mueve un número: manda sobre la presión, sobre
// la luz de la escena y sobre lo que le cuesta a la bomba mantener la cota. Es
// lo que convierte los datos en algo que se ve, no que se lee.
function aplicarProfundidad() {
  const p = estado.profundidad;
  const H = modelo.hidro;
  const hid = hidrostatica(p, H);
  const L = luz(p);

  $("#prof-cifra").textContent = p.toFixed(1) + " m";
  $("#presion").textContent = hid.absoluta.toFixed(2);

  filas("#hidro-datos", [
    ["Gauge pressure", hid.manometrica.toFixed(2) + " bar"],
    ["Buoyant force", hid.empuje.toFixed(2) + " N"],
    ["Mass for neutral", hid.masaNeutra.toFixed(2) + " kg"],
    ["BCU compensation", hid.compensacion.toFixed(1) + " ml"],
    ["Pumping work", hid.trabajo.toFixed(2) + " J"],
    ["Power (4 s)", hid.potencia.toFixed(2) + " W"],
    ["Ambient light", Math.round(L.total * 100) + " %"],
  ]);

  // Y la escena obedece: menos luz, más azul y las cáusticas se apagan, porque
  // a quince metros ya casi no llega nada de la superficie.
  if (oceano) oceano.ponerProfundidad(L);
}

// ───────────────────────── calidad ─────────────────────────
// La transmisión de las aletas es cara y no por los píxeles: obliga a three.js a
// redibujar la escena ENTERA una segunda vez para que la silicona tenga algo que
// dejar pasar. Medido aquí: 6 de los 7,6 ms del fotograma, el 80 %, por cuatro
// mallas.
//
// Así que es un interruptor, y además se rebaja sola si el equipo no da. Eso
// importa más que de costumbre: este enlace se va a abrir desde una red social,
// casi siempre en un móvil.
const silicona = [];        // { material, valor }
// Los translúcidos ya no tienen interruptor en pantalla: quedan siempre
// puestos y sólo los apaga la escalera de calidad si el equipo no da.
let vigila = { t: 0, n: 0, suma: 0, medio: 0 };
// El peldaño que se acaba de bajar y está pendiente de juicio, y el cierre de
// la escalera cuando se demuestra que bajar no sirve de nada.
let prueba = null;
let techoFijo = false;

// Anillo de tiempos de dibujo. La mediana y no la media: un parón suelto
// —una compilación de sombreador, el sistema ocupado— desplaza la media y no
// dice nada del coste normal.
const DIBUJOS = new Array(120).fill(0);
let iDibujo = 0;

function apuntarDibujo(ms) {
  DIBUJOS[iDibujo] = ms;
  iDibujo = (iDibujo + 1) % DIBUJOS.length;
}

// El foco va a donde mira la cámara. En nado, al pez; en lo demás, al punto de
// órbita, que es lo que el encuadre ha puesto en el centro.
const _foco = new THREE.Vector3();

function enfocar() {
  if (!pasoDOF || !pasoDOF.enabled) return;
  _foco.copy(estado.nado && nadador ? nadador.position : control.target);
  const d = camara.position.distanceTo(_foco);
  const u = pasoDOF.uniforms?.focus ?? pasoDOF.materialBokeh?.uniforms?.focus;
  if (u) u.value += (d - u.value) * 0.18;   // el foco también se busca, no salta
}

function medianaDibujo() {
  const v = DIBUJOS.filter((x) => x > 0).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
}

// ───────────────────────── escalera de calidad ─────────────────────────
// Lo acordado fue "máximo, con rebaja automática": aquí se graba el vídeo a
// tope y quien abra el enlace desde un portátil flojo lo ve peor pero fluido.
//
// Se baja un peldaño cada vez, nunca se sube. Subir y bajar daría un parpadeo
// de efectos encendiéndose y apagándose, que se nota mucho más que ir un
// peldaño por debajo de lo que el equipo podría.
//
// El orden de lo que se sacrifica va por precio: primero la oclusión ambiental,
// que es la pasada más cara; después la transmisión, que obliga a dibujar la
// escena entera una segunda vez; luego el bloom; y el último recurso es bajar
// la sombra, que es lo que más se echa de menos.
const NIVELES = [
  { nombre: "Minimum", dof: false, ao: false, bloom: false, sombra: 1024, trans: false },
  { nombre: "Low",     dof: false, ao: false, bloom: false, sombra: 2048, trans: false },
  { nombre: "Medium",  dof: false, ao: false, bloom: true,  sombra: 2048, trans: false },
  { nombre: "High",    dof: false, ao: false, bloom: true,  sombra: 2048, trans: true },
  { nombre: "Very high", dof: false, ao: true, bloom: true, sombra: 2048, trans: true },
  { nombre: "Maximum", dof: true,  ao: true,  bloom: true,  sombra: 2048, trans: true },
];
let nivel = NIVELES.length - 1;

function ponerCalidad(i) {
  nivel = Math.max(0, Math.min(NIVELES.length - 1, i));
  const n = NIVELES[nivel];
  // El desenfoque es lo primero que se sacrifica: obliga a dibujar la escena
  // otra vez para el mapa de profundidad, y es lo que menos se echa de menos.
  if (pasoDOF) pasoDOF.enabled = n.dof;
  if (pasoAO) pasoAO.enabled = n.ao;
  if (pasoBloom) pasoBloom.enabled = n.bloom;
  if (clave && clave.shadow.mapSize.x !== n.sombra) {
    clave.shadow.mapSize.set(n.sombra, n.sombra);
    // El mapa ya creado tiene el tamaño viejo cocido dentro: hay que tirarlo
    // para que se rehaga con el nuevo.
    clave.shadow.map?.dispose();
    clave.shadow.map = null;
  }
  if (estado.silicona !== n.trans) ponerSilicona(n.trans);
  return n.nombre;
}

function registrarSilicona(material) {
  if ((material.transmission || 0) > 0) {
    silicona.push({ material, valor: material.transmission });
  }
}

function ponerSilicona(encendida) {
  estado.silicona = encendida;
  for (const s of silicona) {
    s.material.transmission = encendida ? s.valor : 0;
    // De 0 a >0 cambia el USE_TRANSMISSION del sombreador: hay que recompilar.
    s.material.needsUpdate = true;
  }
}

// Vigilante: si el fotograma se va por encima de 24 ms de forma sostenida, se
// apaga la silicona UNA vez y se deja de mirar. Nada de estar midiendo siempre.
// ───────────────────────── energía y enlace ─────────────────────────
// A un aparato que va suelto por el arrecife le faltaban en pantalla las dos
// cuentas atrás que de verdad limitan una salida: lo que le queda de batería y
// si todavía oye al buzo.
//
// La autonomía publicada del SoFi son 40 minutos de inmersión, y esa cifra es
// el ancla: no hace falta inventarse ningún vatiaje de celda. A crucero la
// batería dura eso. En otras marchas se gasta en proporción al CUBO de la
// velocidad, que es como crece la potencia contra el arrastre — en dash (2,7x)
// son casi veinte veces más consumo, que es exactamente la razón por la que un
// pez no esprinta todo el rato. Y la bomba de lastre suma aparte, porque
// trabaja igual esté el pez quieto o no.
const AUTONOMIA_S = 40 * 60;        // publicado por el MIT
const REPARTO_BOMBA = 0.18;         // de la cuenta a crucero se la lleva el lastre
let bateria = 1;                    // 0..1

// El SoFi real se gobierna por ultrasonidos desde un buzo. A estas distancias el
// agua casi no absorbe —unos 5 dB/km a 30 kHz—, así que lo que estrecha el
// margen no es la absorción sino la separación y los rebotes contra superficie
// y fondo. Aquí la profundidad hace de separación, que es la única distancia
// que el simulador conoce; se dice así en el pie del panel y no se disfraza de
// medida.
function enlace(prof) {
  const d = Math.max(1, prof);
  return 1 - Math.min(0.86, Math.log10(d) / Math.log10(70));
}

// Termoclina de arrecife tropical, que es donde se probó el aparato: unos 26
// grados arriba y 22 a dieciocho metros. Aproximación declarada, no medida.
function temperatura(prof) {
  return 26 - 4 * Math.min(1, prof / 18);
}

function gastoRelativo() {
  const r = nado && estado.nado ? nado.velocidad / V_BASE : 0;
  // Nadar va con el cubo; la bomba es un suelo fijo que no se puede apagar.
  return REPARTO_BOMBA + (1 - REPARTO_BOMBA) * r * r * r;
}

function consumirBateria(dt) {
  if (dt > 0.1) return;             // un parón no gasta batería
  bateria = Math.max(0, bateria - (dt / AUTONOMIA_S) * gastoRelativo());
}

function pintarEnergia() {
  const pct = bateria * 100;
  $("#bat-pct").textContent = pct.toFixed(0);
  const bs = $("#bat-barras").children;
  for (let i = 0; i < bs.length; i++) bs[i].classList.toggle("on", i < Math.round(bateria * BARRAS));

  const gasto = gastoRelativo();
  // Autonomía al consumo de AHORA, como el alcance de un coche: parado sale
  // mucho mayor que los 40 minutos de la ficha, porque nadando es cuando se
  // gasta. Pasada la hora se da en horas, que "222:13" no se lee.
  const quedan = gasto > 0 ? (bateria * AUTONOMIA_S) / gasto : Infinity;
  $("#bat-resto").textContent =
    quedan === Infinity ? "—"
    : quedan >= 3600 ? Math.floor(quedan / 3600) + " h " +
        String(Math.floor((quedan % 3600) / 60)).padStart(2, "0")
    : String(Math.floor(quedan / 60)).padStart(2, "0") + ":" +
      String(Math.floor(quedan % 60)).padStart(2, "0");

  const prof = estado.profundidad;
  const q = enlace(prof);
  filas("#energia-datos", [
    ["Draw", gasto.toFixed(2) + " × cruise"],
    ["Gait", estado.nado && nado ? nado.marcha : "At rest"],
    ["Acoustic link", Math.round(q * 100) + " %"],
    ["Diver separation", prof.toFixed(1) + " m"],
    ["Temperature", temperatura(prof).toFixed(1) + " °C"],
  ]);
  $("#enlace-estado").textContent = q > 0.55 ? "Clear" : q > 0.3 ? "Noisy" : "Marginal";
  $("#agua-temp").textContent = temperatura(prof).toFixed(0) + " °C";
}

function vigilarCalidad(dt) {
  // Con la pestaña en segundo plano el navegador limita a un fotograma por
  // segundo. Esto ya me engañó una vez: el vigilante vio saltos de un segundo,
  // creyó que el equipo no daba y apagó la silicona él solo.
  if (document.hidden) { vigila.t = vigila.n = vigila.suma = 0; return; }
  // Grabando tampoco se toca nada. La toma es para lo que existe todo esto, y
  // una donde los reflejos se apaguen a mitad de plano no vale: antes un tirón
  // que un corte de calidad en mitad del vídeo.
  if (estado.grabando || cine) { vigila.t = vigila.n = vigila.suma = 0; return; }
  // Un fotograma de más de 100 ms no es "lento", es un parón: una pestaña que
  // vuelve, una compilación, el sistema ocupado. Esos no cuentan.
  if (dt > 0.1) { vigila.t = vigila.n = vigila.suma = 0; return; }
  vigila.t += dt; vigila.n++; vigila.suma += dt;
  // Media corrida, para que la ventanilla tenga siempre un numero fresco aunque
  // la ventana de 3 segundos no haya cerrado todavia.
  vigila.medio = vigila.medio ? vigila.medio * 0.9 + dt * 0.1 : dt;
  // Y hace falta una muestra de verdad, no dos fotogramas sueltos.
  if (vigila.t < 3 || vigila.n < 60) return;
  const medio = vigila.suma / vigila.n;
  vigila.t = vigila.n = vigila.suma = 0;
  // 22 ms son 45 cuadros por segundo. Por debajo de eso el nado empieza a
  // verse a tirones, que es lo que hay que evitar cueste lo que cueste.
  //
  // Pero el hueco entre cuadros no dice POR QUE es largo, y hoy me ha vuelto a
  // engañar la misma clase de medida. La ventana marcaba 50 ms por cuadro con
  // document.hidden en falso, y en quince segundos el vigilante se bajo solo
  // cinco peldaños hasta «Mínimo». Luego lo medí peldaño a peldaño:
  //
  //     Máximo  2463 llamadas  dibujo 10,5 ms  cuadro 50,00 ms
  //     Alto    1061 llamadas  dibujo 10,2 ms  cuadro 49,61 ms
  //     Mínimo   699 llamadas  dibujo  5,8 ms  cuadro 49,99 ms
  //
  // Tres veces y media menos trabajo, y el cuadro no se movió de 50 ms. Eso no
  // es carga: es un TOPE de veinte por segundo puesto desde fuera de la escena.
  // Bajar la calidad no ganaba un milisegundo; sólo estropeaba el resultado.
  //
  // De ahí la prueba. Un umbral fijo sobre el tiempo de dibujo tampoco vale: el
  // dibujo se cronometra en la CPU y la GPU va por detrás, asi que es un suelo,
  // no el coste. Lo único que distingue «equipo justo» de «tope externo» es
  // bajar un peldaño y mirar si el ritmo mejora. Si no mejora, el peldaño se
  // devuelve y la escalera se cierra: lo que no sirve de nada no se cobra.
  if (prueba) {
    const ganancia = (prueba.medio - medio) / prueba.medio;
    if (ganancia < 0.10) {
      ponerCalidad(prueba.nivel);
      techoFijo = true;
      console.info("SoFi: dropping to %s did not change the rate (%d -> %d ms). There is "
        + "a cap outside the scene; quality is restored and the ladder closes.",
        NIVELES[prueba.nivel - 1].nombre,
        Math.round(prueba.medio * 1000), Math.round(medio * 1000));
    } else {
      console.info("SoFi: that step gained %d %%; it stays.", Math.round(ganancia * 100));
    }
    prueba = null;
    return;
  }

  if (techoFijo || nivel === 0 || medio <= 0.022) return;

  const antes = NIVELES[nivel].nombre;
  prueba = { nivel, medio };
  const ahora = ponerCalidad(nivel - 1);
  console.info("SoFi: %d ms per frame; quality %s -> %s, on probation.",
    Math.round(medio * 1000), antes, ahora);
}

// ───────────────────────── recorrido ─────────────────────────
// Mientras nada, la cámara deja de encuadrar y pasa a perseguir, con retardo:
// eso es lo que da la sensación de ir siguiéndolo y no de llevarlo pegado a un
// palo.
//
// Pero un solo plano no cuenta nada. Cada marcha se ve bien desde un sitio
// distinto, y desde otro no se ve:
//
//   · el DASH se lee de lado, porque lo que dice que va rápido es el fondo
//     pasando, no el pez — desde detrás, acelerar y no acelerar se ven igual;
//   · la ONDA de la cola se lee desde atrás y bajo, mirándole la cola;
//   · el PLANEO se lee de frente, viniendo hacia la cámara, con las pectorales
//     abiertas;
//   · y el recorrido entre rocas se lee desde arriba.
//
// Los desplazamientos van en el sistema del pez: delante es +Z, arriba +Y.
function v3(x, y, z) { return new THREE.Vector3(x, y, z); }

const PLANOS = {
  Cruise: [
    { nombre: "Chase", ojo: v3(0.42, 0.21, -0.97), mira: v3(0, 0.02, 0.10) },
    // Este estaba mal calculado: 0,44 m del centro del pez son 0,27 m de la
    // punta de la cola, y a esa distancia con 32 grados de campo sólo caben
    // 15,5 cm de alto — la caudal mide 13, o sea el 84 % del encuadre. El plano
    // enseñaba una aleta, no un pez. A 0,68 m entran 39 cm y el cuerpo entero
    // cabe con la cola en primer término, que es lo que se quería ver.
    { nombre: "Tail", ojo: v3(0.26, 0.10, -0.62), mira: v3(0, 0.02, -0.06) },
  ],
  Dash: [
    { nombre: "Side", ojo: v3(0.88, 0.12, 0.04), mira: v3(0, 0.015, 0.02) },
  ],
  Glide: [
    { nombre: "Nose", ojo: v3(0.48, 0.15, 0.84), mira: v3(0, 0.015, 0.06) },
    { nombre: "Top", ojo: v3(0.06, 0.88, -0.20), mira: v3(0, 0, 0) },
  ],
};

// El plano se mueve, no corta. Un corte seco entre dos puntos de vista sobre un
// sujeto que ya se está moviendo marea; un recorrido de un segundo se lee como
// decisión de cámara.
const SEGUIMIENTO = v3(0.42, 0.21, -0.97);
const MIRA_PLANO = v3(0, 0.02, 0.10);
let planoActual = null;
let marchaPrevia = null;
const vuelta = {};            // cuántas veces se ha visto cada marcha
const _camObj = new THREE.Vector3();
const _mira = new THREE.Vector3();
let volviendo = false;
let pendiente = null;

function empezarNado() {
  if (!nado) return;
  estado.nado = true;
  // Cada entrada en nado es una inmersión nueva, y la batería sale llena. Sin
  // esto, con el consumo cúbico del dash (unas dieciséis veces el de crucero)
  // el aparato se quedaba en cero a los dos minutos y medio y el panel se moría
  // ahí. Así la cuenta atrás significa algo cada vez que se arranca.
  bateria = 1;
  // Si estaba entrando, se corta: manda el nado.
  entrada = null;
  // Se arranca siempre por el mismo plano para que la demo sea repetible.
  marchaPrevia = null;
  for (const k in vuelta) delete vuelta[k];
  volviendo = false;
  control.enabled = false;
  nado.arrancar();
  aplicarEntorno();
  $("#vista-activa").textContent = "Swimming";
}

function terminarNado() {
  estado.nado = false;
  if (estado.modo === "nado") estado.modo = "estatico";
  volviendo = !!nado;
  if (accion) accion.timeScale = 1;
  aplicarEntorno();
}

// Al cambiar de marcha, cambia el plano. Si una marcha tiene varios, se van
// alternando: el crucero es lo que más dura y verlo siempre igual cansa.
function elegirPlano() {
  const m = nado.marcha;
  if (m === marchaPrevia) return;
  marchaPrevia = m;
  const lista = PLANOS[m];
  if (!lista || !lista.length) return;
  vuelta[m] = (vuelta[m] ?? -1) + 1;
  planoActual = lista[vuelta[m] % lista.length];
  $("#vista-activa").textContent = "Swimming · " + planoActual.nombre;
}

// ───────────────── que la roca no se cuele en la cámara ─────────────────
// Un plano de persecucion pasa por donde pasa el pez, y el pez pasa ENTRE las
// rocas: antes o después una roca se mete entre los dos. Y cuando eso ocurre no
// tapa la vista — la ATRAVIESA, porque el plano cercano esta a un centimetro y
// corta la piedra por la mitad dejando ver el hueco de dentro. De ahi el
// clipping.
//
// La cámara no se queda entonces donde el plano dice, sino en el primer punto
// libre de esa MISMA línea: se lanza un rayo del pez hacia el ojo y, si hay
// piedra en medio, se para antes. Es lo que hace cualquier cámara de tercera
// persona y tiene la ventaja de que la composición no cambia — el ojo sigue en
// la misma dirección, solo mas cerca.
const rayo = new THREE.Raycaster();
const MARGEN_ROCA = 0.045;      // 4,5 cm, muy por delante del plano cercano (1 cm)
const SUELO_MIN = 0.14;         // lo que la cámara guarda por encima del lecho
const _dirCam = new THREE.Vector3();
const _alto = new THREE.Vector3();
const _nor = new THREE.Vector3();
const ABAJO = new THREE.Vector3(0, -1, 0);

// Medido antes de tocar nada: de 54 cuadros de nado, el rayo chocó 2 veces, y
// las dos contra ESC_Lecho — el suelo. Ninguna contra una roca. Y tirar de la
// cámara hacia el pez porque el SUELO estorba es la respuesta equivocada: se
// perdía el plano entero (la cámara acababa pegada a la cola) para esquivar
// algo que se arregla subiendo quince centímetros.
//
// Así que son dos problemas distintos y cada uno lleva su rayo.

// El suelo no tapa: levanta. Se mira hacia abajo desde un poco por encima del
// punto, de modo que también funciona si la cámara ya ha quedado por debajo de
// la superficie — entonces el choque sale por encima y la corrección es mayor.
function sobreElLecho(objetivo) {
  if (!escenario || !escenario.visible) return objetivo;
  _alto.copy(objetivo).setY(objetivo.y + SUELO_MIN);
  rayo.set(_alto, ABAJO);
  rayo.near = 0;
  rayo.far = SUELO_MIN * 2;
  const golpes = rayo.intersectObject(escenario, true);
  if (golpes.length) objetivo.y = _alto.y - golpes[0].distance + SUELO_MIN;
  return objetivo;
}

// Las rocas sí tapan. Y cuando una se mete entre el pez y la cámara no oculta
// la vista — la ATRAVIESA, porque el plano cercano está a un centímetro y corta
// la piedra por la mitad dejando ver el hueco de dentro. De ahí el clipping.
//
// La cámara se queda entonces en el primer punto libre de esa MISMA línea: la
// composición no cambia, el ojo sigue en la misma dirección, sólo más cerca.
function apartarDeLaRoca(objetivo) {
  if (!escenario || !escenario.visible) return objetivo;
  _dirCam.copy(objetivo).sub(nadador.position);
  const largo = _dirCam.length();
  if (largo < 1e-4) return objetivo;
  _dirCam.divideScalar(largo);
  rayo.set(nadador.position, _dirCam);
  rayo.near = 0;
  rayo.far = largo;
  // Se descarta lo que sea suelo — una cara casi horizontal mirando hacia
  // arriba —, que es cosa del otro rayo. Se mira la normal y no el nombre de la
  // pieza: así vale igual para la meseta plana de una roca.
  const golpe = rayo.intersectObject(escenario, true).find((h) => {
    if (!h.face) return true;
    _nor.copy(h.face.normal).transformDirection(h.object.matrixWorld);
    return _nor.y < 0.55;
  });
  if (!golpe) return objetivo;
  // Nunca más cerca del 60 % de lo que el plano pedía. Sin ese tope, un plano
  // general se desplomaba a un primer plano y el tiro de cámara se perdía;
  // acercarse un poco se lee como esquivar, acercarse del todo se lee como un
  // fallo.
  const d = Math.max(largo * 0.60, golpe.distance - MARGEN_ROCA);
  return objetivo.copy(nadador.position).addScaledVector(_dirCam, d);
}

// ───────────────── que el pez no se salga del encuadre ─────────────────
// El retardo de la cámara es a propósito: es lo que la hace parecer cámara y no
// un palo. Pero tiene un precio — en un giro cerrado del dash el pez se va a la
// esquina y durante medio segundo el plano es agua.
//
// No se arregla quitando el retardo, que es lo que se habia ganado, sino
// poniéndole un límite: si el pez se asoma fuera de la caja segura, la mira se
// corrige lo justo para devolverlo dentro. Dentro de la caja no se toca nada,
// así que cada plano conserva su composición — la "Cola" sigue mirando por
// detrás y el "Morro" sigue dejando aire delante.
const CAJA = 0.42;              // medio lado de la caja segura, en coordenadas de pantalla
const _ndc = new THREE.Vector3();
const _frente = new THREE.Vector3();

function noPerderAlPez() {
  // Lo primero es el caso peor: que el pez haya quedado DETRÁS de la cámara.
  // Ahí la proyección ya no dice nada útil, así que se recentra en seco; un
  // tirón de cámara es malo, perder al sujeto es peor.
  camara.getWorldDirection(_frente);
  if (_frente.dot(_ndc.copy(nadador.position).sub(camara.position)) <= 0) {
    control.target.copy(nadador.position);
    camara.lookAt(control.target);
    return;
  }
  _ndc.copy(nadador.position).project(camara);
  const fx = Math.max(0, Math.abs(_ndc.x) - CAJA);
  const fy = Math.max(0, Math.abs(_ndc.y) - CAJA);
  if (fx === 0 && fy === 0) return;
  // Se corrige la MIRA, no la posición: mover la cámara cambiaría el plano,
  // girarla sólo lo recentra.
  control.target.lerp(nadador.position,
                      Math.min(1, Math.max(fx, fy) / (1 - CAJA)));
  camara.lookAt(control.target);
}

// ───────────────────────── cámara de a bordo ─────────────────────────
// El SoFi lleva una cámara de gran angular en el morro, y es con lo que graba.
// Esto pone el punto de vista AHÍ: a 185 mm de proa y 51 de alto, que es donde
// está el conjunto óptico medido en el modelo, mirando al frente.
//
// Lo que la hace valer no es la posición sino el HORIZONTE: la vertical de la
// cámara se toma del pez, no del mundo, así que cuando el bicho se apoya en un
// giro el mar se inclina. Con la vertical del mundo se ve un travelling; con la
// del pez se ve que lo lleva puesto.
const FPV_LOCAL = new THREE.Vector3(0, 0.0514, 0.196);
const FPV_MIRA = new THREE.Vector3(0, 0.0514, 1.40);
const _fpvP = new THREE.Vector3();
const _fpvM = new THREE.Vector3();
const _fpvU = new THREE.Vector3();

const FOV_NORMAL = 32;
const FOV_FPV = 78;      // la del SoFi es una lente de gran angular

function aplicarFPV() {
  // Vale tanto en modo nado como dentro de la demo: lo que la hace posible es
  // que el pez se esté moviendo, no en qué modo está la barra.
  const puesta = estado.fpv && estado.nado;
  // Con la cámara a bordo el mando de órbita sobra: el punto de vista lo manda
  // el pez. Y al salir hay que devolverle la vertical del mundo o la órbita se
  // queda torcida.
  control.enabled = !puesta;
  // Y el campo se abre. A los 32 grados del encuadre técnico la vista de a
  // bordo parecía un teleobjetivo mirando arena; la cámara del SoFi es un gran
  // angular, y con 78 grados entra el arrecife y se nota la velocidad, que es
  // de lo que va ir montado en el bicho.
  const fov = puesta ? FOV_FPV : FOV_NORMAL;
  if (camara.fov !== fov) {
    camara.fov = fov;
    camara.updateProjectionMatrix();
  }
  if (!puesta) {
    camara.up.set(0, 1, 0);
    estado.fpv = false;
  }
}

function seguirFPV() {
  _fpvP.copy(FPV_LOCAL).applyQuaternion(nadador.quaternion).add(nadador.position);
  _fpvM.copy(FPV_MIRA).applyQuaternion(nadador.quaternion).add(nadador.position);
  _fpvU.set(0, 1, 0).applyQuaternion(nadador.quaternion);
  camara.position.copy(_fpvP);
  camara.up.copy(_fpvU);
  control.target.copy(_fpvM);
  camara.lookAt(_fpvM);
}

function seguir(dt) {
  if (estado.fpv) { seguirFPV(); return; }
  elegirPlano();
  if (planoActual) {
    // Un segundo de recorrido entre planos. Más rápido parece un corte, más
    // lento se pierde la marcha que se quería enseñar.
    const k = Math.min(1, dt / 1.0);
    SEGUIMIENTO.lerp(planoActual.ojo, k);
    MIRA_PLANO.lerp(planoActual.mira, k);
  }
  _camObj.copy(SEGUIMIENTO).applyQuaternion(nadador.quaternion).add(nadador.position);
  _mira.copy(MIRA_PLANO).applyQuaternion(nadador.quaternion).add(nadador.position);
  // Las dos correcciones se hacen sobre el punto de DESTINO, no sobre la cámara
  // ya colocada: así entran por el mismo retardo que todo lo demás y se leen
  // como movimiento de cámara y no como un salto. Primero se sube sobre el
  // lecho y después se esquiva la roca, porque subir puede meter el ojo detrás
  // de una piedra que antes no estorbaba.
  apartarDeLaRoca(sobreElLecho(_camObj));
  // El retardo va atado a la velocidad. Con uno fijo, en el dash (2,7x) el pez
  // se salía del encuadre y la cámara se quedaba mirando agua vacía.
  const r = nado.velocidad / V_BASE;
  // Dos retardos distintos: la mira va más suelta que la posición, así el
  // encuadre respira en vez de ir clavado.
  camara.position.lerp(_camObj, Math.min(1, (2.2 + 2.8 * r) * dt));
  control.target.lerp(_mira, Math.min(1, (3.6 + 3.2 * r) * dt));
  // Y un tope por si acaso: perder al sujeto es peor que un tirón de cámara.
  const tope = SEGUIMIENTO.length() * 1.55;
  const d = camara.position.distanceTo(nadador.position);
  if (d > tope) {
    camara.position.sub(nadador.position).setLength(tope).add(nadador.position);
  }
  camara.lookAt(control.target);
  noPerderAlPez();
}

function avanzarNado(dt) {
  if (estado.nado) {
    nado.actualizar(dt);
    seguir(dt);
    if (accion) accion.timeScale = nado.ritmo;
    $("#m-estado").textContent = nado.marcha;
    return;
  }
  if (volviendo && nado) {
    // Ya no se espera a que el pez "vuelva" solo: se para, la cámara vuela a su
    // destino y el pez entra por la derecha mientras tanto.
    nado.parar();
    volviendo = false;
    control.enabled = true;
    const destino = pendiente || estado.vista;
    pendiente = null;
    // ORDEN. El pez se pone en reposo ANTES de calcular el encuadre, porque
    // irA() encuadra la geometría donde esté en ese momento. Llamándolo con el
    // pez todavía en mitad del arrecife, la cámara volaba a encuadrarlo ALLÍ y
    // luego el pez se venía al origen: la cámara acababa a 1,3 m mirando agua
    // vacía con 40 grados de desvío. Medido así, no deducido.
    const reposo0 = nado.reposo;
    nadador.position.copy(reposo0.pos);
    nadador.quaternion.copy(reposo0.quat);
    nadador.updateMatrixWorld(true);
    irA(destino);
    // Y sólo después se aparta fuera de cuadro, ya con la cámara de destino
    // calculada sobre la posición buena.
    arrancarEntrada();
    $("#m-estado").textContent = estado.conjunto ? "Isolated" : "Idle";
  }
  avanzarEntrada(dt);
}

// ───────────────────────── cinemática ─────────────────────────
// Una pasada guiada de minuto y medio, pensada para grabarla. Cada paso fija a
// dónde mira la cámara, cuánta radiografía se ve y qué se lee abajo; entre paso
// y paso todo se interpola, así que no hay cortes secos.
const GUION = [
  // Se abre con el bicho entero en su sitio, con el arrecife puesto y la cámara
  // dando una vuelta lenta. Lo primero que hay que entender es QUÉ es.
  { seg: 7, vista: "hero", giro: true, rayosx: 0, entorno: 1,
    titulo: "SoFi", pie: "Soft robotic fish · independent reconstruction" },
  { seg: 5, vista: "lateral", rayosx: 0, entorno: 1,
    titulo: "339 mm", pie: "18 m depth · 40 min dive · untethered" },

  // El agua se retira y el pez se vuelve transparente a la vez. Antes esto eran
  // dos pasos —"Radiografía" y luego el interior— y era contar dos veces lo
  // mismo: la radiografía no es un capítulo, es la transición hacia el interior.
  { seg: 6, vista: "hero", rayosx: 1, entorno: 0, giro: true,
    titulo: "342 parts", pie: "Everything inside, measured on the model" },

  // Y ahora los subsistemas, uno a uno, con su encuadre y su halo. Esto es lo
  // que la herramienta hace y un vídeo no: aislar y contar.
  { seg: 6, punto: "cabeza", rayosx: 0.42, entorno: 0,
    titulo: "Electronics", pie: "Control board · LiPo batteries · wiring" },
  // La óptica, con el tren desplegándose en cámara: es el gesto más vistoso que
  // tiene el modelo.
  { seg: 7, punto: "optica", optica: true, rayosx: 0.42, entorno: 0,
    titulo: "Recording camera", pie: "Dome · three elements · iris · sensor" },
  // Bomba y cilindro de lastre JUNTOS. Separados se contaban como dos cosas y
  // no lo son: mueven el mismo fluido y es uno el que explica al otro.
  // Bomba y cilindro de lastre son UN punto, fusionados en el exportador.
  { seg: 8, punto: "hidraulica", optica: false, rayosx: 0.42, entorno: 0,
    titulo: "Hydraulic system",
    pie: "Pump and ballast cylinder · one fluid drives both the tail and the depth" },
  { seg: 6, punto: "cola", rayosx: 0.42, entorno: 0,
    titulo: "Actuated tail", pie: "Travelling wave · progressive phase toward the caudal fin" },

  // Vuelve el arrecife y el bicho echa a nadar.
  { seg: 9, nado: true, rayosx: 0, entorno: 1,
    titulo: "Swimming", pie: "Cruise, dash and glide · the camera changes shot with the gait" },
  { seg: 7, nado: true, fpv: true, rayosx: 0, entorno: 1,
    titulo: "Onboard camera", pie: "Wide angle at the nose · the horizon rolls with it" },

  { seg: 7, vista: "hero", giro: true, rayosx: 0, entorno: 1,
    titulo: "LIBELA MEDIA", pie: "Real-time 3D configurator · not a video" },
];



let cine = null;

function pintarCine(paso, alfa) {
  const t = $("#cine-titulo");
  if (!t) return;
  t.textContent = paso ? paso.titulo : "";
  $("#cine-pie").textContent = paso ? paso.pie : "";
  $("#cine").style.opacity = paso ? alfa : 0;
}

function arrancarCine() {
  cine = { i: -1, t: 0, desde: estado.rayosx };
  aplicarGrabacion();
  pasoCine(0);
}

function pararCine() {
  cine = null;
  control.autoRotate = estado.giro;
  aplicarGrabacion();
  pintarCine(null, 0);
  // Si la demo se corta —el usuario ha tocado la escena— el modo tiene que
  // dejar de decir "Demo", o la barra miente sobre lo que está pasando.
  if (estado.modo === "demo") {
    estado.modo = "estatico";
    for (const k in botonesModo) botonesModo[k].setAttribute("aria-pressed", String(k === "estatico"));
    aplicarMando();
  }
}

function pasoCine(i) {
  if (!cine) return;
  // Vuelve a empezar al acabar: así se puede dejar grabando en bucle.
  cine.i = i % GUION.length;
  cine.t = 0;
  cine.desde = estado.rayosx;
  const p = GUION[cine.i];

  // Durante la demo manda el guion, no la regla automática que enciende el
  // arrecife según la vista y la radiografía. Si no, el fondo entraba y salía
  // por su cuenta en mitad de un paso.
  entornoManual = true;
  if (p.entorno !== undefined) {
    estado.entorno = !!p.entorno;
    aplicarEntorno();
  }

  control.autoRotate = !!p.giro;

  // Nado primero: todo lo demás depende de si el pez se está moviendo.
  if (p.nado && !estado.nado) { empezarNado(); aplicarEntorno(); }
  else if (!p.nado && estado.nado) terminarNado();
  estado.fpv = !!p.fpv;
  aplicarFPV();

  if (p.punto) {
    if (estado.conjunto !== p.punto) seleccionarPunto(p.punto);
  } else {
    if (estado.conjunto) seleccionarPunto(null);
    if (p.vista && !estado.nado) irA(p.vista);
  }

  if (p.optica !== undefined) ponerOptica(!!p.optica);
}

function avanzarCine(dt) {
  const p = GUION[cine.i];
  cine.t += dt;
  // La radiografía se mueve en el primer 55 % del paso y luego se queda quieta:
  // así da tiempo a mirar lo que ha quedado al descubierto.
  const k = Math.min(1, cine.t / (p.seg * 0.55));
  const v = cine.desde + (p.rayosx - cine.desde) * suave(k);
  if (Math.abs(v - estado.rayosx) > 0.001) {
    estado.rayosx = v;
    aplicarRayosX();
  }
  // El rótulo entra y sale; en medio se queda quieto.
  const ent = Math.min(1, cine.t / 0.7);
  const sal = Math.min(1, Math.max(0, (p.seg - cine.t) / 0.7));
  pintarCine(p, Math.min(ent, sal));
  if (cine.t >= p.seg) pasoCine(cine.i + 1);
}

// ───────────────────────── bucle ─────────────────────────
// ───────────────────────── postproceso ─────────────────────────
// Lo que el navegador NO tiene es trazado de rayos en tiempo real: ni WebGL ni
// WebGPU dan acceso al hardware de RT. Lo que sí da el mismo resultado a ojo es
// esto: oclusión ambiental en espacio de pantalla, que oscurece los rincones
// donde una pieza se junta con otra, y un bloom corto que hace que lo claro
// sangre un poco sobre el agua, como ocurre de verdad bajo el agua.
//
// El orden importa: primero se dibuja la escena, luego se le resta la oclusión
// y por último se suma el bloom; invertir los dos últimos haría brillar
// justamente lo que se acaba de meter en sombra.
function montarCompositor() {
  const r = lienzo.getBoundingClientRect();
  const an = Math.max(1, r.width), al = Math.max(1, r.height);
  // HalfFloat porque entre pasada y pasada el color se sale de 0..1 y en 8 bits
  // se recortaría; samples 4 porque el compositor se salta el antialias del
  // lienzo y sin esto los cantos del pez salen de sierra.
  const destino = new THREE.WebGLRenderTarget(an, al, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  compositor = new EffectComposer(render, destino);
  compositor.addPass(new RenderPass(escena, camara));

  pasoAO = new GTAOPass(escena, camara, an, al);
  // El radio va en metros de escena: 18 mm. El pez mide 364, así que esto
  // oscurece juntas, tornillos y el hueco entre pieza y pieza, que es donde la
  // oclusión cuenta algo — con un radio grande sólo saldría una sombra sucia
  // por encima de todo.
  pasoAO.updateGtaoMaterial({
    radius: 0.018,
    distanceExponent: 1.0,
    // 2 mm, y este número costó. Venía puesto en 0,4 — CUARENTA CENTÍMETROS —
    // porque copié el valor por defecto sin mirar sus unidades. El `thickness`
    // le dice a la oclusión cuánto se supone que ocupa hacia atrás lo que
    // encuentra, así que con 40 cm la electrónica que está cinco milímetros por
    // detrás del casco contaba como si lo estuviera tocando: la placa entera se
    // dibujaba en sombra SOBRE el morro, como si el casco fuese transparente.
    // El casco mide 1 mm de pared; dos milímetros es lo que hay que permitir.
    thickness: 0.002,
    scale: 1.0,
    samples: 16,
    screenSpaceRadius: false,
  });
  compositor.addPass(pasoAO);

  // Profundidad de campo. Va DESPUÉS de la oclusión y ANTES del bloom: la
  // oclusión necesita una imagen nítida para leer bordes, y el bloom tiene que
  // derramar lo que ya está desenfocado — al revés se ven halos nítidos sobre
  // fondo borroso, que no ocurre en ninguna lente.
  //
  // El foco NO es fijo: sigue a lo que la cámara está mirando, que es lo que
  // hace un operador. Con un foco fijo, en cuanto te acercas a una ficha el
  // sujeto se va de foco y parece un fallo.
  pasoDOF = new BokehPass(escena, camara, {
    focus: 0.5,
    // Estos dos números los puse a ojo la primera vez y no hacían NADA. El
    // desenfoque de three.js calcula el radio del círculo de confusión así:
    //
    //     radio = acotar((foco − distancia) × aperture, maxblur)
    //
    // y el radio sale en unidades de pantalla (1,0 = el ancho entero). Con
    // aperture 0,00035 y el pez a 0,45 m, una roca a 3 m daba 0,00089 —siete
    // décimas de píxel en una ventana de 800—. Por eso no se veía: estaba bien
    // conectado y pintando menos de un píxel. Se comprobó subiéndolo a 0,02,
    // que emborrona hasta el propio pez.
    //
    // Con 0,002 y el sujeto a 0,45 m sale esta escalera, que es la de una lente
    // de verdad: el sujeto clavado, el arrecife separado, el fondo lejano
    // disuelto pero sin convertirse en una mancha.
    //
    //     cola del pez (+0,25 m)    0 px
    //     1 m                       1 px
    //     3 m                       4 px
    //     8 m                       8 px  (tope)
    //
    // El tope importa: sin él, lo que queda al borde del arrecife se deshace y
    // el agua deja de leerse como agua.
    aperture: 0.002,
    maxblur: 0.010,
  });
  compositor.addPass(pasoDOF);

  // Bloom corto y suave: 0,28 de fuerza y umbral alto, para que sólo sangre lo
  // que de verdad está encendido —el casco al sol, las cáusticas— y no el agua
  // entera, que la dejaría lechosa.
  pasoBloom = new UnrealBloomPass(new THREE.Vector2(an, al), 0.28, 0.55, 0.92);
  compositor.addPass(pasoBloom);

  // OutputPass es el que aplica el mapeo de tonos y pasa a sRGB al final de la
  // cadena. Sin él, con el compositor puesto, la imagen sale lavada.
  compositor.addPass(new OutputPass());

  // Ventanilla de diagnóstico. Un visor técnico que se va a grabar tiene que
  // poder decir cuánto le cuesta cada cuadro sin abrir las herramientas del
  // navegador — y sobre todo sin montar un bucle propio, que en una pestaña sin
  // foco el navegador estrangula y da medidas falsas. Esto lee lo que YA se
  // está midiendo.
  abrirRodaje();
  window.sofi = {
    get dibujo() {
      const ms = medianaDibujo();
      return {
        mediana_ms: +ms.toFixed(2),
        techo_fps: ms > 0 ? Math.round(1000 / ms) : 0,
        llamadas: render.info.render.calls,
        triangulos: render.info.render.triangles,
      };
    },
    get cuadro() {
      return { medio_ms: +(vigila.medio * 1000).toFixed(2),
               fps: Math.round(1 / (vigila.medio || 1)),
               fiable: !document.hidden };
    },
    get calidad() { return NIVELES[nivel].nombre; },
    // La escalera por dentro. Van dos veces que se baja sola por una medida
    // engañosa, y las dos a ciegas: sin esto no había forma de ver si había un
    // peldaño a prueba ni si la escalera se había cerrado.
    get vigilante() {
      return { nivel, de: NIVELES.length - 1, aPrueba: prueba ? NIVELES[prueba.nivel].nombre : null,
               techoFijo };
    },
    get horneado() { return { materiales_con_ao: conAO }; },
    get ultimaEntrada() { return testigoEntrada; },
    get entrada() {
      if (!entrada) return null;
      return {
        t: +entrada.t.toFixed(3),
        espera_s: +Math.max(0, entrada.espera).toFixed(2),
        desde: entrada.desde.toArray().map((v) => +v.toFixed(3)),
        hasta: entrada.hasta.toArray().map((v) => +v.toFixed(3)),
        recorrido_m: +entrada.desde.distanceTo(entrada.hasta).toFixed(3),
      };
    },
    nivelDeCalidad: (i) => ponerCalidad(i),
    ao: (modo) => { pasoAO.output = modo; },
    get pasos() { return { ao: pasoAO, bloom: pasoBloom, compositor }; },
    MODOS_AO: GTAOPass.OUTPUT,
  };
}

// ─────────────────── mandos para rodar ───────────────────
// Lo que `pelicula.js` necesita para dirigir la escena fotograma a fotograma.
// Va aparte de `sofi`, que es la ventanilla de diagnostico: esto no se mira, se
// conduce. Y va en una sola puerta en vez de exportar quince cosas sueltas,
// porque todo lo de aqui existe para una cosa y conviene que se vea.
function abrirRodaje() {
  window.sofiRodaje = {
    // el reloj en la mano
    paso,
    parar: () => render.setAnimationLoop(null),
    seguir: () => { reloj.getDelta(); render.setAnimationLoop(bucle); },

    // el escenario
    get render() { return render; },
    get camara() { return camara; },
    get control() { return control; },
    get escena() { return escena; },
    get compositor() { return compositor; },
    get lienzo() { return lienzo; },
    get nadador() { return nadador; },
    get estado() { return estado; },
    get modelo() { return modelo; },
    get marcha() { return nado ? nado.marcha : null; },

    // la direccion
    modo: (m) => ponerModo(m),
    punto: (id) => seleccionarPunto(id),
    optica: (v) => ponerOptica(v),
    rayosX: (v) => ponerRayosX(v),
    fpv: (v) => { estado.fpv = v; aplicarFPV(); },
    entorno: (v) => { estado.entorno = v; entornoManual = true; aplicarEntorno(); },
    vista: (id, ya) => irA(id, ya),
    rotulos: (v) => { estado.rotulos = v; aplicarMando(); },

    // Para rodar hace falta un lienzo de medida fija, no el hueco que haya
    // dejado la ventana: el video es 1920x1080 y punto. `medir()` lo volveria
    // a atar al tamano del panel en cuanto alguien tocara el borde, asi que
    // durante el rodaje se desconecta.
    fijarLienzo(an, al) {
      fijo = { an, al };
      aplicarTamano(an, al);
    },
    soltarLienzo() { fijo = null; medir(); },

    // Compilar por adelantado los sombreadores del estado actual. Cambiar de
    // punto de interes o mover los rayos X dispara recompilaciones, y la
    // recompilacion se come el fotograma en el que cae: sale medio negro.
    compilar() { try { render.compile(escena, camara); } catch (e) {} },
  };
}


// ───────────────────────── estudio ─────────────────────────
// Lo que sale de aquí es un vídeo, y grabando sobran los botones.
//
// Hubo también un ciclador de formato —libre, 1:1, 9:16— que recortaba el
// lienzo y recomponía el encuadre. Funcionaba, pero se quitó: un pez de 36 cm
// de largo en un 9:16 deja la mitad del cuadro en agua, y recortar no arregla
// una composición, solo la estrecha. Si vuelve, tendrá que venir con encuadres
// pensados para vertical, no con el mismo encuadre cortado.
function ponerGrabacion(v) {
  estado.grabando = v;
  aplicarGrabacion();
  if (v) avisarEstudio("Recording · G to exit · X for X-ray");
}

function aplicarGrabacion() {
  document.body.classList.toggle("grabando", estado.grabando || !!cine);
}

let avisoT = null;

function avisarEstudio(txt) {
  const el = $("#aviso-estudio");
  if (!el) return;
  el.textContent = txt;
  el.classList.add("visible");
  clearTimeout(avisoT);
  avisoT = setTimeout(() => el.classList.remove("visible"), 2600);
}

function medir() {
  if (fijo) { aplicarTamano(fijo.an, fijo.al); return; }
  // Se mide el HUECO, no el lienzo: el lienzo es justo lo que estamos a punto
  // de redimensionar, y leerlo aquí sería morderse la cola.
  const r = $(".escena").getBoundingClientRect();
  aplicarTamano(Math.max(1, r.width), Math.max(1, r.height));
}

function aplicarTamano(an, al) {
  // 1,5 y no 2: a partir de ahí se pagan el doble de píxeles por una mejora
  // que no se ve, y este visor ya va justo por otro lado. Rodando se pone a 1:
  // el búfer ya es de 1920x1080 de verdad, y multiplicarlo sería pintar en 4K
  // para tirar tres cuartas partes al codificar.
  render.setPixelRatio(fijo ? 1 : Math.min(devicePixelRatio, 1.5));
  // El tercer parametro es si se toca el CSS, y es que NO: el lienzo lo coloca
  // la hoja de estilo. Rodando, el bufer pasa a 1920x1080 mientras el elemento
  // sigue ocupando lo que ocupa en pantalla.
  render.setSize(an, al, false);
  if (compositor) {
    const pr = render.getPixelRatio();
    compositor.setPixelRatio(pr);
    compositor.setSize(an, al);
    if (pasoAO) pasoAO.setSize(an * pr, al * pr);
    if (pasoDOF) pasoDOF.setSize(an * pr, al * pr);
  }
  camara.aspect = an / al;
  camara.updateProjectionMatrix();
  // Al cambiar el tamaño cambia el encuadre que hace falta. Solo se recoloca si
  // el usuario no ha orbitado: si lo ha hecho, el punto de vista es suyo.
  if (modelo && !tocado && !fijo) irA(estado.vista, true);
}

// Lo que ocupa de alto un marcador, para no dejar que se solapen.
const ALTO_MARCA = 26;

const _v = new THREE.Vector3();

// El bucle se parte en dos. `bucle()` lee el reloj real y es lo que corre
// mientras alguien mira; `paso(dt)` hace el trabajo y no sabe de donde sale ese
// dt. Con eso, rodar la pelicula es llamar a paso(1/60) tantas veces como haga
// falta: el resultado son 60 fps clavados tarde lo que tarde cada fotograma.
function bucle() {
  // El paso de tiempo se acota a 1/20 de segundo. Cuando el navegador
  // estrangula la pestaña —sin foco, en segundo plano— entrega un fotograma
  // cada dos segundos, y con ese dt CUALQUIER animación por tiempo se consume
  // entera en un solo paso: la entrada del pez, el vuelo de cámara, el halo.
  // Se ve como un salto en vez de como un movimiento. Y el nado avanzaría dos
  // segundos de recorrido de golpe.
  //
  // Acotarlo hace que al volver a la pestaña todo siga desde donde estaba, a su
  // ritmo, en vez de haberse comido el gesto mientras nadie miraba.
  const dt = Math.min(reloj.getDelta(), 0.05);
  paso(dt);
}

function paso(dt) {
  if (mezclador && estado.reproduciendo) mezclador.update(dt);

  if (viaje) {
    viaje.t = Math.min(1, viaje.t + dt / 0.75);
    const k = viaje.t < 0.5 ? 4 * viaje.t ** 3 : 1 - (-2 * viaje.t + 2) ** 3 / 2;  // easeInOutCubic
    camara.position.lerpVectors(viaje.p0, viaje.p1, k);
    control.target.lerpVectors(viaje.m0, viaje.m1, k);
    if (viaje.t >= 1) viaje = null;
  }

  avanzarDespliegue(dt);
  vigilarCalidad(dt);
  consumirBateria(dt);
  if (servos) gobernarServos(dt);
  if (nado) avanzarNado(dt);
  if (cine) avanzarCine(dt);
  if (oceano) oceano.actualizar(dt);

  avanzarEntorno(dt);
  avanzarRayosX(dt);
  if (banco && banco.grupo.visible) banco.actualizar(dt);
  seguirConLaLuz();
  if (halo.valor !== halo.meta) {
    const k = Math.min(1, dt / (halo.meta > halo.valor ? 0.5 : 0.25));
    halo.valor += (halo.meta - halo.valor) * k;
    if (Math.abs(halo.meta - halo.valor) < 0.002) halo.valor = halo.meta;
    oceano?.ponerHalo(halo.valor);
  }
  control.update();
  // Se cronometra el DIBUJO, no el intervalo entre cuadros. El intervalo lo
  // estrangula el navegador en cuanto la pestaña pierde el foco —me ha dado
  // medidas falsas tres veces ya— mientras que lo que tarda una pasada de
  // dibujo es lo que es, mire quien mire. (Es tiempo de CPU: la GPU va por
  // detrás, así que esto es un suelo, no el coste total.)
  render.info.autoReset = false;
  render.info.reset();
  const t0 = performance.now();
  enfocar();
  if (compositor) compositor.render(dt);
  else render.render(escena, camara);
  apuntarDibujo(performance.now() - t0);
  paneles();
}

let ultimoRefresco = 0;

// El encuadre de la sombra va donde está el pez. Si no, en cuanto nada se sale
// del mapa y la sombra desaparece de golpe — que es peor que no tenerla.
function seguirConLaLuz() {
  if (!clave) return;
  _focoLuz.copy(nadador ? nadador.position : escena.position);
  clave.target.position.copy(_focoLuz);
  clave.position.copy(_focoLuz).add(DIR_CLAVE);
  clave.target.updateMatrixWorld();
}

function paneles() {
  if (!accion) return;
  const clip = accion.getClip();
  const t = accion.time % clip.duration;

  $("#m-t").textContent = t.toFixed(2) + " s";

  // Ángulos vivos: a 20 Hz, que leerlos 60 veces por segundo no se aprecia.
  const ahora = performance.now();
  if (ahora - ultimoRefresco > 50) {
    ultimoRefresco = ahora;
    pintarEnergia();
    let punta = 0;
    for (const h of huesos) {
      const a = anguloVivo(h);
      const n = Math.max(-1, Math.min(1, a / h.maximo));
      // La barra crece desde el centro: izquierda o derecha según el signo.
      h.el.style.left = (n < 0 ? 50 + n * 50 : 50) + "%";
      h.el.style.width = Math.abs(n) * 50 + "%";
      h.val.textContent = grados(a).toFixed(1) + "°";
      if (Math.abs(a) > Math.abs(punta)) punta = a;
    }
    $("#amp").textContent = grados(punta).toFixed(0) + "°";

    // Servos: ángulo real, par hidrodinámico calculado sobre el área medida de
    // la pala y carga respecto al par nominal del servo.
    if (servos) {
      const Uv = estado.nado && nado ? nado.velocidad : 0;
      const ang = servos.angulos;
      const filasServo = [];
      for (const nombre of ["PECT_D", "PECT_I"]) {
        const g = grados(ang[nombre]);
        const par = Math.abs(servos.par(nombre, Uv, modelo.hidro.densidad_kg_m3));
        filasServo.push({
          id: nombre === "PECT_D" ? "Pectoral R" : "Pectoral L",
          g, par, carga: Math.min(1, par / PAR_NOMINAL),
          n: Math.max(-1, Math.min(1, ang[nombre] / servos.tope)),
        });
      }
      pintarServos(filasServo);
    }

    // Lo que de verdad dice cómo nada. La velocidad sale del recorrido cuando
    // está nadando; parado se declara cero y las cifras que dependen de ella se
    // apagan, porque un Strouhal sin velocidad no significa nada.
    const U = estado.nado && nado ? nado.velocidad : 0;
    const Lm = modelo.cota_mm.largo / 1000;
    const f = (modelo.animacion.frecuencia_hz || 0.556) * (accion ? accion.timeScale : 1);
    const n = fisNado(U, Lm, f, amplitudCaudal, modelo.hidro);
    const js = juicioStrouhal(n.st);
    $("#m-vel").textContent = U > 0 ? U.toFixed(2) + " m/s" : "at rest";
    filas("#nado-datos", [
      ["Body lengths per second", U > 0 ? n.longitudes.toFixed(2) + " L/s" : "—"],
      ["Caudal amplitude", (amplitudCaudal * 1000).toFixed(0) + " mm"],
      ["Strouhal", U > 0 ? n.st.toFixed(3) + " · " + js.texto : "—"],
      ["Reynolds", U > 0 ? Math.round(n.re).toLocaleString("en") + " · " + regimen(n.re) : "—"],
      ["Drag", U > 0 ? (n.arrastre * 1000).toFixed(1) + " mN" : "—"],
      ["Useful power", U > 0 ? (n.potencia * 1000).toFixed(1) + " mW" : "—"],
    ]);

    const carga = Math.min(1, Math.abs(punta) / (huesos.reduce((m, h) => Math.max(m, h.maximo), 1e-4)));
    $("#carga-pct").textContent = Math.round(carga * 100) + " %";
    const bs = $("#carga-barras").children;
    for (let i = 0; i < bs.length; i++) bs[i].classList.toggle("on", i < Math.round(carga * BARRAS));
  }

  // Rótulos proyectados, con su línea guía hasta el conjunto que señalan.
  if (estado.rotulos) {
    const r = lienzo.getBoundingClientRect();
    // Primero se proyecta todo, y después se separan los que se pisen. Siete
    // marcadores vistos de frente acaban amontonados —"Casco y piel" encima de
    // "Cola actuada"— y entonces no se puede pulsar ni leer ninguno.
    const vistos = [];
    for (const ro of rotulos) {
      _v.copy(ro.pos).project(camara);
      const visible = _v.z < 1 && (!estado.conjunto || estado.conjunto === ro.id);
      ro._x = (_v.x * 0.5 + 0.5) * r.width;
      ro._y = (-_v.y * 0.5 + 0.5) * r.height;
      ro._vis = visible;
      _v.copy(ro.pieza).project(camara);
      ro._px = (_v.x * 0.5 + 0.5) * r.width;
      ro._py = (-_v.y * 0.5 + 0.5) * r.height;
      if (visible) vistos.push(ro);
    }

    // Separación en vertical, que es donde hay sitio: se ordenan de arriba
    // abajo y cada uno se empuja lo justo para no tocar al anterior. La línea
    // guía sigue apuntando a su pieza, así que el empujón no miente.
    vistos.sort((a, b) => a._y - b._y);
    for (let i = 1; i < vistos.length; i++) {
      const prev = vistos[i - 1], act = vistos[i];
      const solapa = Math.abs(act._x - prev._x) < 150;
      if (solapa && act._y - prev._y < ALTO_MARCA) act._y = prev._y + ALTO_MARCA;
    }

    for (const ro of rotulos) {
      ro.el.style.opacity = ro._vis ? "1" : "0";
      ro.el.style.pointerEvents = ro._vis ? "auto" : "none";
      ro.el.style.left = ro._x + "px";
      ro.el.style.top = ro._y + "px";
      ro.linea.setAttribute("x1", ro._x);
      ro.linea.setAttribute("y1", ro._y);
      ro.linea.setAttribute("x2", ro._px);
      ro.linea.setAttribute("y2", ro._py);
      ro.linea.style.opacity = ro._vis ? "1" : "0";
    }
  }
}
