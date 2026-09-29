// LIBELAMEDIA — modular storage configurator (Three.js).
// One GLB holds the room, every module design (sku1a…sku3a) and three handle meshes.
// Every module sits against one of three walls (left, back, right) at a position `s`
// along that wall; it can be dragged along the wall, onto another wall, and wall units
// also up and down. Nothing ever overlaps: positions are resolved against every other
// module's footprint, corners included. State lives in the URL hash so any layout can
// be shared.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/aortiz1992/libelamodelos3d@3eedae800f7b81c8e30c7167f701643a80581ba0/furniture_configurator.glb';

// Room interior, in metres (Three.js space: +y up, +z towards the open side of the room).
const FLOOR_Y = 0.074;
const WALL_Z = -1.926;
const WALL_X = 2.426;
const CEILING_Y = 2.526;
const OPEN_Z = 1.65;          // side walls stay usable up to here, short of the open front
const WALL_UNIT_Y = 1.45;     // default hanging height of wall units, above the floor
const SNAP = 0.05;            // magnet distance to neighbours and wall ends
const EPS = 0.001;

// Each wall: position along it `s` (left to right, seen from inside the room), where a
// module's back-left-bottom corner lands, its rotation, and the inward normal.
const WALLS = {
  left:  { range: [-OPEN_Z, -WALL_Z], rot: Math.PI / 2,  n: new THREE.Vector3(1, 0, 0),
           at: (s, y) => new THREE.Vector3(-WALL_X, y, -s), s: (p) => -p.z, dist: (p) => p.x + WALL_X },
  back:  { range: [-WALL_X, WALL_X],  rot: 0,            n: new THREE.Vector3(0, 0, 1),
           at: (s, y) => new THREE.Vector3(s, y, WALL_Z), s: (p) => p.x, dist: (p) => p.z - WALL_Z },
  right: { range: [WALL_Z, OPEN_Z],   rot: -Math.PI / 2, n: new THREE.Vector3(-1, 0, 0),
           at: (s, y) => new THREE.Vector3(WALL_X, y, s), s: (p) => p.z, dist: (p) => WALL_X - p.x },
};
const WALL_ORDER = ['left', 'back', 'right'];

// Both leg meshes hang below their anchor, which sits on the underside of the carcass,
// so a leg's height is exactly how far the floor units stand off the floor. `lift` is
// re-measured from the model on load; these are the values it ships with.
const LEGS = {
  ninguna: { mesh: null,         lift: 0,      price: 0 },
  disco:   { mesh: 'pata_disco', lift: 0.0181, price: 12 },
  alta:    { mesh: 'pata_alta',  lift: 0.0672, price: 28 },
};
const legLift = () => (LEGS[state.legs] || LEGS.disco).lift;

// ------------------------------------------------------------------ catalogue --
const FAMILIES = {
  col:  { designs: ['sku1a', 'sku1b', 'sku1c'], mount: 'floor' },
  low:  { designs: ['sku2a', 'sku2b'], mount: 'floor' },
  wall: { designs: ['sku3a'], mount: 'wall' },
};
const DESIGNS = {
  sku1a: { family: 'col',  price: 149, fronts: false },
  sku1b: { family: 'col',  price: 239, fronts: true, doors: true },
  sku1c: { family: 'col',  price: 259, fronts: true },
  sku2a: { family: 'low',  price: 199, fronts: false },
  sku2b: { family: 'low',  price: 279, fronts: true },
  sku3a: { family: 'wall', price: 119, fronts: false },
};
const FRONTS = {
  blanco: { color: '#f1efe9', rough: 0.55, extra: 0 },
  arena:  { color: '#d6c7ac', rough: 0.6,  extra: 15 },
  salvia: { color: '#8e9c88', rough: 0.6,  extra: 15 },
  negro:  { color: '#1d1d1d', rough: 0.45, extra: 15 },
  nogal:  { texture: true,    rough: 0.5,  extra: 40 },
};
const BODIES = {
  blanco: { color: '#f4f3ef', rough: 0.5 },
  gris:   { color: '#a3a19b', rough: 0.55 },
  negro:  { color: '#222222', rough: 0.45 },
};
const HANDLE_TYPES = { barra: 9, pomo: 6, ninguno: 0 };
const HANDLE_FINISHES = {
  negro:  { color: '#161616', metal: 0.2, rough: 0.45 },
  laton:  { color: '#b8924f', metal: 1.0, rough: 0.32 },
  cromo:  { color: '#d9d9d9', metal: 1.0, rough: 0.18 },
};
const isWallUnit = (design) => FAMILIES[DESIGNS[design].family].mount === 'wall';

// ----------------------------------------------------------------------- copy --
const LANG = document.documentElement.lang === 'es' ? 'es' : 'en';
const T = {
  en: {
    loading: 'Loading the room', loadError: 'The 3D model could not be loaded. Check your connection and reload the page.',
    col: 'Tall column', low: 'Low unit', wall: 'Wall unit',
    sku1a: 'Open shelving', sku1b: 'Three doors', sku1c: 'Shelves and drawers',
    sku2a: 'Four compartments', sku2b: 'Shelf and drawers', sku3a: 'Open with shelf',
    blanco: 'White', arena: 'Sand', salvia: 'Sage', negro: 'Black', nogal: 'Walnut', gris: 'Grey',
    laton: 'Brass', cromo: 'Chrome', barra: 'Bar', pomo: 'Knob', ninguno: 'None',
    legs: 'Legs', disco: 'Disc feet', alta: 'Tall legs', ninguna: 'No legs', legsLine: 'Legs',
    add: 'Add a module', composition: 'Your layout', applyAll: 'Style everything',
    design: 'Design', front: 'Fronts', body: 'Frame', handle: 'Handles', handleFinish: 'Handle finish', hinge: 'Door opens',
    hingeL: 'Hinge left', hingeR: 'Hinge right', wallPick: 'Wall',
    left: 'Left', back: 'Back', right: 'Right',
    noFronts: 'This design is open: no fronts or handles.',
    moveL: 'Nudge left', moveR: 'Nudge right', duplicate: 'Duplicate', remove: 'Remove', close: 'Back to layout',
    dims: 'Dimensions', shuffle: 'Another layout', tv: 'TV for scale', resetView: 'Reset view',
    dollHouse: 'Whole room', dollHouseLong: 'See the whole room from above',
    undo: 'Undo', redo: 'Redo', summary: 'Summary', share: 'Copy link', copied: 'Link copied',
    clear: 'Start over', total: 'Total', demoPrices: 'Demo prices, for illustration only.',
    noRoom: 'There is no free space for that. Move or remove a module first.',
    empty: 'The room is empty. Add a module from the panel to start.',
    moduleN: (n) => 'Module ' + n, qty: 'Qty',
    count: (n, m) => `${n} ${n === 1 ? 'module' : 'modules'} · ${m} m of wall`,
    summaryTitle: 'Your storage', handlesLine: 'Handles',
    ctaTitle: 'Want a configurator like this for your catalogue?', cta: 'Talk to us',
    cm: 'cm', dragHint: 'Drag a module to move it along the wall or onto another wall.',
    canvasLabel: '3D view of the room. Drag the background to orbit, scroll to zoom, drag a module to move it, click it to edit it.',
  },
  es: {
    loading: 'Cargando la habitación', loadError: 'No se ha podido cargar el modelo 3D. Revisa tu conexión y recarga la página.',
    col: 'Columna alta', low: 'Mueble bajo', wall: 'Módulo de pared',
    sku1a: 'Estantería abierta', sku1b: 'Tres puertas', sku1c: 'Baldas y cajones',
    sku2a: 'Cuatro huecos', sku2b: 'Balda y cajones', sku3a: 'Abierto con balda',
    blanco: 'Blanco', arena: 'Arena', salvia: 'Salvia', negro: 'Negro', nogal: 'Nogal', gris: 'Gris',
    laton: 'Latón', cromo: 'Cromo', barra: 'Barra', pomo: 'Pomo', ninguno: 'Sin tirador',
    legs: 'Patas', disco: 'Pie de disco', alta: 'Pata alta', ninguna: 'Sin patas', legsLine: 'Patas',
    add: 'Añadir módulo', composition: 'Tu composición', applyAll: 'Estilo para todo',
    design: 'Diseño', front: 'Frentes', body: 'Estructura', handle: 'Tiradores', handleFinish: 'Acabado del tirador', hinge: 'Apertura de puertas',
    hingeL: 'Bisagra izquierda', hingeR: 'Bisagra derecha', wallPick: 'Pared',
    left: 'Izquierda', back: 'Fondo', right: 'Derecha',
    noFronts: 'Este diseño es abierto: no lleva frentes ni tiradores.',
    moveL: 'Desplazar a la izquierda', moveR: 'Desplazar a la derecha', duplicate: 'Duplicar', remove: 'Eliminar', close: 'Volver a la composición',
    dims: 'Medidas', shuffle: 'Otra composición', tv: 'TV de referencia', resetView: 'Centrar vista',
    dollHouse: 'Toda la sala', dollHouseLong: 'Ver la habitación entera desde arriba',
    undo: 'Deshacer', redo: 'Rehacer', summary: 'Resumen', share: 'Copiar enlace', copied: 'Enlace copiado',
    clear: 'Empezar de cero', total: 'Total', demoPrices: 'Precios de demostración, solo orientativos.',
    noRoom: 'No queda hueco libre para eso. Mueve o quita antes algún módulo.',
    empty: 'La habitación está vacía. Añade un módulo desde el panel para empezar.',
    moduleN: (n) => 'Módulo ' + n, qty: 'Uds.',
    count: (n, m) => `${n} ${n === 1 ? 'módulo' : 'módulos'} · ${m} m de pared`,
    summaryTitle: 'Tu mueble', handlesLine: 'Tiradores',
    ctaTitle: '¿Quieres un configurador así para tu catálogo?', cta: 'Hablemos',
    cm: 'cm', dragHint: 'Arrastra un módulo para moverlo por la pared o llevarlo a otra.',
    canvasLabel: 'Vista 3D de la habitación. Arrastra el fondo para girar, usa la rueda para acercar, arrastra un módulo para moverlo y púlsalo para editarlo.',
  },
}[LANG];
const money = new Intl.NumberFormat(LANG === 'es' ? 'es-ES' : 'en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const num = (v, d = 1) => v.toLocaleString(LANG === 'es' ? 'es-ES' : 'en-GB', { maximumFractionDigits: d });
const cm = (m) => num(Math.round(m * 1000) / 10);

// ---------------------------------------------------------------------- state --
// s = where the module starts along its wall; y = height of its base above the floor
const M = (design, wall, s, extra = {}) => ({ design, front: 'nogal', body: 'blanco', handle: 'barra', hinge: 'l', wall, s, y: isWallUnit(design) ? WALL_UNIT_Y : LEGS.disco.lift, ...extra });
// Seven compositions built by hand. "Otra composición" walks them in a random order, so
// however often a visitor presses it they land on a layout that works, never on a pile of
// furniture. Each run is a list of designs laid end to end and centred at `at` on its wall.
const PRESETS = [
  { // the opening layout, the same composition as DEFAULT_STATE below
    front: 'nogal', body: 'blanco', handle: 'barra', handleFinish: 'negro', legs: 'disco', tv: true,
    runs: [
      { wall: 'back',  at: -0.11, items: [['sku1b'], ['sku2b'], ['sku1c']] },
      { wall: 'left',  at: 0.34,  items: [['sku1a', { hinge: 'r' }], ['sku1a', { hinge: 'r' }]] },
      { wall: 'right', at: -0.43, items: [['sku3a', { y: 1.34 }]] },
    ],
  },
  { // white and quiet, on tall legs
    front: 'blanco', body: 'blanco', handle: 'pomo', handleFinish: 'cromo', legs: 'alta', tv: true,
    runs: [
      { wall: 'back', at: 0,   items: [['sku1c'], ['sku2b'], ['sku1c']] },
      { wall: 'left', at: 0.5, items: [['sku3a', { y: 1.5 }]] },
    ],
  },
  { // a wall of columns, no low unit
    front: 'salvia', body: 'blanco', handle: 'barra', handleFinish: 'negro', legs: 'disco', tv: false,
    runs: [
      { wall: 'back', at: 0,    items: [['sku1b'], ['sku1a'], ['sku1c'], ['sku1a'], ['sku1b', { hinge: 'r' }]] },
      { wall: 'left', at: -0.2, items: [['sku3a', { y: 1.45 }]] },
    ],
  },
  { // turning the right-hand corner
    front: 'arena', body: 'gris', handle: 'barra', handleFinish: 'laton', legs: 'alta', tv: true,
    runs: [
      { wall: 'back',  at: 0.45, items: [['sku1c'], ['sku2b'], ['sku1a']] },
      { wall: 'right', at: 0.5,  items: [['sku1b', { hinge: 'r' }]] },
      { wall: 'left',  at: 0.5,  items: [['sku3a', { y: 1.34 }]] },
    ],
  },
  { // long and low, with storage overhead on both sides
    front: 'arena', body: 'blanco', handle: 'barra', handleFinish: 'laton', legs: 'alta', tv: true,
    runs: [
      { wall: 'back',  at: 0,    items: [['sku2a'], ['sku2b']] },
      { wall: 'left',  at: 0.4,  items: [['sku3a', { y: 1.4 }]] },
      { wall: 'right', at: -0.5, items: [['sku3a', { y: 1.4 }]] },
    ],
  },
  { // dark fronts, dark frame
    front: 'negro', body: 'negro', handle: 'barra', handleFinish: 'cromo', legs: 'alta', tv: true,
    runs: [
      { wall: 'back',  at: 0,   items: [['sku1c'], ['sku2b'], ['sku1c']] },
      { wall: 'left',  at: 0.6, items: [['sku1b', { hinge: 'r' }]] },
      { wall: 'right', at: 0,   items: [['sku3a', { y: 1.5 }]] },
    ],
  },
  { // walnut fronts across the whole back wall
    front: 'nogal', body: 'blanco', handle: 'pomo', handleFinish: 'negro', legs: 'disco', tv: true,
    runs: [
      { wall: 'back',  at: 0,    items: [['sku1a'], ['sku1c'], ['sku2a'], ['sku1c'], ['sku1a']] },
      { wall: 'right', at: -0.6, items: [['sku3a', { y: 1.45 }]] },
    ],
  },
  // Two three-door columns with their hinges facing each other read as one wardrobe: the
  // handles meet down the middle instead of running off to the sides. An item's own
  // settings override the composition's, which is how one door of a pair goes dark.
  { // wardrobe in two tones, beside the television
    front: 'blanco', body: 'blanco', handle: 'barra', handleFinish: 'cromo', legs: 'alta', tv: true,
    runs: [
      { wall: 'back', at: 0.2,  items: [['sku2b', { body: 'negro' }], ['sku1b', { hinge: 'l' }], ['sku1b', { hinge: 'r', front: 'negro' }]] },
      { wall: 'back', at: -1.7, items: [['sku3a', { y: 1.55, body: 'negro' }]] },
    ],
  },
  { // a wardrobe framed by open shelving
    front: 'salvia', body: 'blanco', handle: 'barra', handleFinish: 'negro', legs: 'disco', tv: false,
    runs: [
      { wall: 'back',  at: 0,   items: [['sku1a'], ['sku1b', { hinge: 'l' }], ['sku1b', { hinge: 'r' }], ['sku1a']] },
      { wall: 'right', at: 0.2, items: [['sku3a', { y: 1.4 }]] },
    ],
  },
  { // a wall of wardrobes, with the television off to one side
    front: 'nogal', body: 'blanco', handle: 'pomo', handleFinish: 'laton', legs: 'alta', tv: true,
    runs: [
      { wall: 'back', at: 0,   items: [['sku1b', { hinge: 'l' }], ['sku1b', { hinge: 'r' }], ['sku1b', { hinge: 'l' }], ['sku1b', { hinge: 'r' }]] },
      { wall: 'left', at: 0.1, items: [['sku2a']] },
    ],
  },
  { // wardrobe in the corner, drawers along the back
    front: 'arena', body: 'gris', handle: 'barra', handleFinish: 'laton', legs: 'alta', tv: true,
    runs: [
      { wall: 'back',  at: -0.6, items: [['sku2b'], ['sku1c']] },
      { wall: 'right', at: 0.3,  items: [['sku1b', { hinge: 'l' }], ['sku1b', { hinge: 'r', front: 'negro' }]] },
    ],
  },
];

const DEFAULT_STATE = {
  // Antonio's chosen opening layout (2026-09-18)
  modules: [
    M('sku1b', 'back', -1.5067548872215974),
    M('sku2b', 'back', -0.9067548633797395),
    M('sku1c', 'back', 0.6947964905516875),
    M('sku1a', 'left', -0.26334549296598375, { hinge: 'r' }),
    M('sku1a', 'left', 0.33665453087587416, { hinge: 'r' }),
    M('sku3a', 'right', -0.8343484323027521, { y: 1.3399553402947204 }),
  ],
  handleFinish: 'negro',
  legs: 'disco',
  tv: true,
};
let state = loadState();
let selected = -1;
// ?snap keeps the frame buffer readable and hides dimensions, for thumbnail captures
const SNAP_MODE = new URLSearchParams(location.search).has('snap');
let showDims = !SNAP_MODE;
let dollHouse = false;
const undoStack = [];
const redoStack = [];

function clone(o) { return JSON.parse(JSON.stringify(o)); }

// Legs are one choice for the whole room, so every floor module rides at the same height.
function syncLegs(st) {
  const lift = (LEGS[st.legs] || LEGS.disco).lift;
  for (const m of st.modules) if (!isWallUnit(m.design)) m.y = lift;
}

function loadState() {
  try {
    if (location.hash.startsWith('#c=')) {
      const s = JSON.parse(atob(decodeURIComponent(location.hash.slice(3))));
      if (Array.isArray(s.modules) && s.modules.every((m) => DESIGNS[m.design])) {
        if (!LEGS[s.legs]) s.legs = 'disco';   // links shared before legs existed
        return s;
      }
    }
  } catch (e) { /* fall through to the default layout */ }
  return clone(DEFAULT_STATE);
}

function commit(mutator) {
  undoStack.push(clone(state));
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
  mutator(state);
  onStateChange();
}

function onStateChange() {
  history.replaceState(null, '', '#c=' + encodeURIComponent(btoa(JSON.stringify(state))));
  rebuild();
  renderPanel();
}

// ---------------------------------------------------------------- renderer --
const stage = document.getElementById('cfg-stage');
const canvasHost = document.getElementById('cfg-canvas');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: SNAP_MODE });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.shadowMap.enabled = true;
// VSM gives a blur you can dial, but it pays for it with its two signature faults, and
// this room shows both: a bright rim leaking along the silhouette of every wall, and wavy
// banding across shelves, where its squared-depth buffer runs out of precision. PCF soft
// has neither. Its penumbra comes from the texel size of the map, so the map is sized for
// the softness we want rather than for sharpness.
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.setAttribute('role', 'img');
renderer.domElement.setAttribute('aria-label', T.canvasLabel);
canvasHost.appendChild(renderer.domElement);
if (SNAP_MODE) renderer.domElement.style.transition = 'none';

const scene = new THREE.Scene();
// A flat fill behind the room reads like a 3D viewer. A vertical gradient reads like air:
// brighter overhead, settling towards the floor, so the room sits in something.
function skyTexture(top, bottom) {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top); g.addColorStop(0.55, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
scene.background = skyTexture('#fdfcfa', '#e9e5dc');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.42;

const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 40);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.2;
controls.maxDistance = 7.5;
controls.minPolarAngle = THREE.MathUtils.degToRad(35);
controls.maxPolarAngle = THREE.MathUtils.degToRad(92);
controls.minAzimuthAngle = THREE.MathUtils.degToRad(-75);
controls.maxAzimuthAngle = THREE.MathUtils.degToRad(75);
controls.screenSpacePanning = true;

// Daylight through the open side of the room, warm and high; a cool fill from the far
// side so nothing falls to black; a hemisphere for the warm bounce off the oak floor.
const SHADOW_RES = Math.min(2048, renderer.capabilities.maxTextureSize,
  matchMedia('(pointer: coarse)').matches ? 1024 : 2048);
const sun = new THREE.DirectionalLight('#fff3e2', 4.4);
// Almost head-on through the opening. Swing it further to the side and the right-hand
// wall throws a hard diagonal across the parquet — correct, but it reads as a glitch in a
// room with no window to explain it.
sun.position.set(1.2, 3.9, 3.4);
sun.target.position.set(0.1, 0.8, -1.0);
sun.castShadow = true;
sun.shadow.mapSize.set(SHADOW_RES, SHADOW_RES);
// the ortho box is fitted to the room once it loads, in fitShadowCamera()
sun.shadow.bias = -0.0004;
// The walls have no thickness: each lands in the shadow map at its own depth and would
// shadow itself. Offsetting the lookup along the surface normal lifts it clear. Keep it
// small — this is also how far a contact shadow slides away from what casts it, and the
// disc feet only stand 18 mm off the floor.
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

const fill = new THREE.DirectionalLight('#e2ecfa', 0.16);
fill.position.set(-3.2, 2.1, 1.6);
fill.target.position.set(0.4, 0.9, -1.2);
scene.add(fill, fill.target);

scene.add(new THREE.HemisphereLight('#f6f7ff', '#c8ab86', 0.22));

// The four inner surfaces of the room arrive as one mesh: three walls and the ceiling.
// The walls have to stop the sun. The ceiling must not — it covers the whole room, so with
// it casting, the top of the back wall goes grey and hard diagonals fall across the floor.
// One mesh cannot cast and not cast, so split it by face normal.
function freeTheCeiling(mesh) {
  const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const pos = src.attributes.position;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
  const upright = [], flat = [];
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize();
    const into = Math.abs(n.y) < 0.5 ? upright : flat;
    into.push(i, i + 1, i + 2);
  }
  if (!upright.length || !flat.length) return;   // one mesh per surface already: nothing to do
  const part = (rows) => {
    const g = new THREE.BufferGeometry();
    for (const key of Object.keys(src.attributes)) {
      const at = src.attributes[key], w = at.itemSize;
      const out = new at.array.constructor(rows.length * w);
      rows.forEach((v, k) => { for (let j = 0; j < w; j++) out[k * w + j] = at.array[v * w + j]; });
      g.setAttribute(key, new THREE.BufferAttribute(out, w, at.normalized));
    }
    const m = new THREE.Mesh(g, mesh.material);
    m.position.copy(mesh.position); m.quaternion.copy(mesh.quaternion); m.scale.copy(mesh.scale);
    return m;
  };
  const wallMesh = part(upright), ceilingMesh = part(flat);
  wallMesh.name = mesh.name + '_muros';
  ceilingMesh.name = mesh.name + '_techo';
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  ceilingMesh.castShadow = false;
  ceilingMesh.receiveShadow = true;
  mesh.parent.add(wallMesh, ceilingMesh);
  mesh.removeFromParent();
}

// A shadow map only covers its own ortho box. Where the box ends the VSM blur has nothing
// to sample and draws a band across the floor — the U-shaped line that used to run parallel
// to the walls. Fit the box to the room, in the light's own space, and keep a margin wide
// enough that the blur never reaches the edge.
function fitShadowCamera(room) {
  const box = new THREE.Box3().setFromObject(room);
  const toWorld = new THREE.Matrix4().lookAt(sun.position, sun.target.position, new THREE.Vector3(0, 1, 0));
  const toLight = toWorld.clone().invert();
  const p = new THREE.Vector3();
  const b = new THREE.Box3();
  for (let i = 0; i < 8; i++) {
    p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    b.expandByPoint(p.sub(sun.position).applyMatrix4(toLight));
  }
  b.expandByScalar(0.9);   // room for the blur kernel, well outside anything visible
  const cam = sun.shadow.camera;
  cam.left = b.min.x; cam.right = b.max.x;
  cam.bottom = b.min.y; cam.top = b.max.y;
  cam.near = Math.max(0.05, -b.max.z);   // the light looks down its own -z
  cam.far = -b.min.z;
  cam.updateProjectionMatrix();
}

const world = new THREE.Group();     // placed modules
const dimsGroup = new THREE.Group(); // dimension lines
scene.add(world, dimsGroup);

// Ambient occlusion is what makes an interior read as built rather than assembled: the
// inside of an open shelf, the seam where a unit meets the wall, the ground under a leg.
// It needs a composer, which means tone mapping moves to OutputPass at the very end.
const composer = new EffectComposer(renderer,
  new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera);
gtao.output = GTAOPass.OUTPUT.Default;
gtao.blendIntensity = 0.6;
gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1, thickness: 0.9, scale: 1.1, samples: 16, screenSpaceRadius: false });
composer.addPass(gtao);
composer.addPass(new OutputPass());
const draw = () => composer.render();
// ?dev opens the scene up for tuning from the console; it ships inert without the flag
if (new URLSearchParams(location.search).has('dev')) {
  window.cfg = { THREE, scene, camera, controls, renderer, composer, gtao, draw, get sun() { return sun; }, get fill() { return fill; },
    pose(px, py, pz, tx, ty, tz) { controls.target.set(tx, ty, tz); camera.position.set(px, py, pz); controls.update(); draw(); } };
}

let dirty = true;
const requestRender = () => { dirty = true; if (SNAP_MODE) draw(); };
controls.addEventListener('change', requestRender);

function resize() {
  const r = canvasHost.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  composer.setSize(r.width, r.height);
  camera.aspect = r.width / Math.max(r.height, 1);
  camera.updateProjectionMatrix();
  requestRender();
}
new ResizeObserver(resize).observe(canvasHost);
resize();

// ------------------------------------------------------------------- assets --
const templates = {};   // design key -> { node, box, size, anchors[] }
const handleMeshes = {};
const legMeshes = {};
let tvTemplate = null;  // { node, box }
let frontTexture = null;
const baseMats = {};

const loaderEl = document.getElementById('cfg-loading');
const loaderBar = loaderEl.querySelector('.cfg-loading-bar span');
loaderEl.querySelector('.cfg-loading-label').textContent = T.loading;

new GLTFLoader().load(MODEL_URL, onLoaded, (e) => {
  if (e.total) loaderBar.style.transform = `scaleX(${e.loaded / e.total})`;
}, () => {
  loaderEl.classList.add('is-error');
  loaderEl.querySelector('.cfg-loading-label').textContent = T.loadError;
});

function localBox(node) {
  node.updateMatrixWorld(true);
  const box = new THREE.Box3();
  node.traverse((o) => { if (o.isMesh) box.expandByObject(o); });
  return box;
}

function onLoaded(gltf) {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.isMesh && o.material) baseMats[o.material.name] = o.material; });
  // the floor tiles ten times across the room, so at a grazing angle it turns to mush
  // without anisotropic filtering; every cloned material reuses these same textures
  const aniso = renderer.capabilities.getMaxAnisotropy();
  for (const m of Object.values(baseMats)) {
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
      if (m[k]) { m[k].anisotropy = aniso; m[k].needsUpdate = true; }
    }
  }

  // Room as a doll's house: outer shell hidden, inner faces one-sided, so whichever wall
  // stands between the camera and the room drops away as you orbit.
  const room = root.getObjectByName('habitacion');
  room.traverse((o) => {
    if (!o.isMesh) return;
    o.receiveShadow = true;
    const m = o.material;
    if (m.name === 'mat_pared_exterior') { o.visible = false; return; }
    m.side = THREE.FrontSide;   // roughness and maps stay as the .blend authored them
    // The walls are what keeps the sun out: without them the light goes straight through
    // and hangs the shadow of a right-hand wall unit on the floor. One-sided geometry, so
    // the shadow pass has to look at both faces.
    if (m.name === 'mat_pared') { o.castShadow = true; m.shadowSide = THREE.DoubleSide; }
    // The 74 mm rim around the opening. With the outer shell hidden it is the only thing
    // left giving the walls thickness, and from the doll's-house angle it reads as a white
    // frame floating across the room. The walls are cleaner cut off flush.
    if (m.name === 'mat_pared_canto') { o.visible = false; return; }
  });
  let inner = null;
  room.traverse((o) => { if (o.isMesh && o.material.name === 'mat_pared') inner = o; });
  if (inner) freeTheCeiling(inner);
  scene.add(room);
  fitShadowCamera(room);

  frontTexture = { map: baseMats.mat_frente.map, normalMap: baseMats.mat_frente.normalMap };

  for (const key of Object.keys(DESIGNS)) {
    const node = root.getObjectByName(key);
    node.removeFromParent();
    node.position.set(0, 0, 0);
    const box = localBox(node);
    const anchors = [];
    const legAnchors = [];
    node.traverse((o) => {
      if (o.isMesh) return;
      const m = o.name.match(/_tirador_(\d+)(?:_([lr]))?$/);
      if (m) anchors.push({ pos: o.position.clone(), side: m[2] || null });
      else if (/_pata_\d+$/.test(o.name)) legAnchors.push(o.position.clone());
    });
    templates[key] = { node, box, size: box.getSize(new THREE.Vector3()), anchors, legAnchors };
  }
  for (const n of ['tirador_horizontal', 'tirador_vertical', 'tirador_pomo']) {
    handleMeshes[n] = root.getObjectByName(n);
  }
  for (const [key, leg] of Object.entries(LEGS)) {
    if (!leg.mesh) continue;
    const node = root.getObjectByName(leg.mesh);
    legMeshes[key] = node;
    leg.lift = -localBox(node).min.y;   // the model, not this file, sets the ride height
  }
  // with no legs a unit sits flat, lifted only enough to clear its deepest lapped front
  LEGS.ninguna.lift = Math.max(0, ...Object.keys(DESIGNS)
    .filter((k) => !isWallUnit(k)).map((k) => -templates[k].box.min.y));
  syncLegs(state);
  const tv = root.getObjectByName('tv');
  tv.removeFromParent();
  tv.position.set(0, 0, 0);
  tv.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  tvTemplate = { node: tv, box: localBox(tv) };

  // old shared links carry no wall positions: lay those modules out automatically
  if (state.modules.some((m) => !m.wall)) {
    const mods = state.modules;
    state.modules = [];
    for (const m of mods) { const p = findSpot(m.design, m.wall ? m : null); if (p) state.modules.push({ ...m, ...p }); }
  }

  loaderEl.hidden = true;
  stage.classList.add('is-ready');
  onStateChange();
  frameAll(false);
}

// ------------------------------------------------------------------ materials --
function frontMaterial(finish) {
  const f = FRONTS[finish] || FRONTS.blanco;
  const m = baseMats.mat_frente.clone();
  if (f.texture) { m.map = frontTexture.map; m.normalMap = frontTexture.normalMap; m.color.set('#ffffff'); }
  else { m.map = null; m.normalMap = null; m.color.set(f.color); }
  m.roughness = f.rough; m.metalness = 0;
  return m;
}
function bodyMaterial(finish) {
  const b = BODIES[finish] || BODIES.blanco;
  const m = baseMats.mat_estructura.clone();
  m.map = null; m.color.set(b.color); m.roughness = b.rough; m.metalness = 0;
  return m;
}
function handleMaterial(finish) {
  const h = HANDLE_FINISHES[finish] || HANDLE_FINISHES.negro;
  const m = baseMats.mat_tirador.clone();
  m.color.set(h.color); m.metalness = h.metal; m.roughness = h.rough;
  return m;
}

// ------------------------------------------------------------------- geometry --
// World-space box of a local box [x0..x1]×[y0..y1]×[z0..z1] (z = distance from the wall)
// placed at (wall, s, y).
function wallBox(wall, s, y, x0, x1, y0, y1, z0, z1) {
  const W = WALLS[wall];
  const o = W.at(s, FLOOR_Y + y);
  const u = W.at(s + 1, 0).sub(W.at(s, 0));
  const box = new THREE.Box3();
  for (const x of [x0, x1]) for (const z of [z0, z1]) {
    box.expandByPoint(o.clone().addScaledVector(u, x).addScaledVector(W.n, z).setY(FLOOR_Y + y + y0));
    box.expandByPoint(o.clone().addScaledVector(u, x).addScaledVector(W.n, z).setY(FLOOR_Y + y + y1));
  }
  return box;
}
function moduleBox(m) {
  const t = templates[m.design].size;
  return wallBox(m.wall, m.s, m.y, 0, t.x, 0, t.y, 0, t.z);
}
function tvHost() { return state.modules.findIndex((m) => DESIGNS[m.design].family === 'low'); }
function tvBox(host) {
  const m = state.modules[host];
  const t = templates[m.design].size;
  const tb = tvTemplate.box.getSize(new THREE.Vector3());
  return wallBox(m.wall, m.s, m.y, t.x / 2 - tb.x / 2, t.x / 2 + tb.x / 2, t.y, t.y + tb.y, 0.2 - tb.z / 2, 0.2 + tb.z / 2);
}

// Closest free position to `want` along `wall` for a module of this design at height y.
// `skip` is the index of the module being moved (ignored as an obstacle). Null if no gap.
function resolve(design, wall, want, y, skip) {
  const W = WALLS[wall];
  const t = templates[design].size;
  const band = wallBox(wall, 0, y, -100, 100, 0, t.y, 0, t.z); // everything this module could touch on the wall
  const hits = [];
  const host = tvHost();
  state.modules.forEach((m, j) => {
    if (j === skip) return;
    const b = moduleBox(m);
    if (b.intersectsBox(band.clone().expandByScalar(-EPS))) hits.push(project(W, b));
  });
  if (state.tv && host >= 0 && host !== skip && isWallUnit(design)) {
    const b = tvBox(host);
    if (b.intersectsBox(band.clone().expandByScalar(-EPS))) hits.push(project(W, b));
  }
  hits.sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let from = W.range[0];
  for (const [a, b] of hits) { if (a > from) gaps.push([from, a]); from = Math.max(from, b); }
  if (W.range[1] > from) gaps.push([from, W.range[1]]);

  let best = null;
  for (const [a, b] of gaps) {
    if (b - a < t.x - EPS) continue;
    let s = THREE.MathUtils.clamp(want, a, b - t.x);
    if (Math.abs(s - a) < SNAP) s = a;
    if (Math.abs(s + t.x - b) < SNAP) s = b - t.x;
    if (best == null || Math.abs(s - want) < Math.abs(best - want)) best = s;
  }
  return best;
}
function project(W, b) {
  const a = W.s(b.min), c = W.s(b.max);
  return [Math.min(a, c), Math.max(a, c)];
}

// A free spot for a new module: next to `near` if given, else the first wall with room.
function findSpot(design, near) {
  const y = isWallUnit(design) ? WALL_UNIT_Y : legLift();
  const w = templates[design].size.x;
  const walls = near ? [near.wall, ...WALL_ORDER.filter((k) => k !== near.wall)] : ['back', 'left', 'right'];
  for (const wall of walls) {
    const tries = [];
    if (near && wall === near.wall) tries.push(near.s + templates[near.design].size.x, near.s - w);
    const on = state.modules.filter((m) => m.wall === wall);
    if (on.length) tries.push(Math.max(...on.map((m) => m.s + templates[m.design].size.x)));
    tries.push((WALLS[wall].range[0] + WALLS[wall].range[1]) / 2 - w / 2);
    for (const want of tries) {
      const s = resolve(design, wall, want, y, -1);
      if (s != null) return { wall, s, y };
    }
  }
  return null;
}

// -------------------------------------------------------------------- build --
const instances = [];

function placeHolder(holder, m) {
  holder.position.copy(WALLS[m.wall].at(m.s, FLOOR_Y + m.y));
  holder.rotation.set(0, WALLS[m.wall].rot, 0);
}

function rebuild() {
  if (!Object.keys(templates).length) return;
  world.clear();
  instances.length = 0;
  const host = tvHost();

  state.modules.forEach((mod, i) => {
    const t = templates[mod.design];
    const holder = new THREE.Group();
    const body = t.node.clone(true);
    // back-left corner onto the holder origin; vertically, the plane the legs bolt to —
    // the underside of the carcass, which a lapped drawer front may overhang
    body.position.set(-t.box.min.x, isWallUnit(mod.design) ? -t.box.min.y : 0, -t.box.min.z);
    holder.add(body);
    placeHolder(holder, mod);

    const fm = frontMaterial(mod.front);
    const bm = bodyMaterial(mod.body);
    const hm = handleMaterial(state.handleFinish);
    body.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      if (o.name.endsWith('_frentes')) { o.material = fm; o.userData.front = true; }
      else o.material = bm;
      o.userData.index = i;
    });

    // doors (anchors with a side) take a vertical bar opposite the hinge; drawers a horizontal one
    if (DESIGNS[mod.design].fronts && mod.handle !== 'ninguno') {
      for (const a of t.anchors) {
        if (a.side && a.side !== (mod.hinge === 'l' ? 'r' : 'l')) continue;
        const kind = mod.handle === 'pomo' ? 'tirador_pomo' : (a.side ? 'tirador_vertical' : 'tirador_horizontal');
        const h = new THREE.Mesh(handleMeshes[kind].geometry, hm);
        h.position.copy(a.pos);
        h.castShadow = true;
        h.userData.front = true;
        h.userData.index = i;
        body.add(h);
      }
    }

    const legMesh = legMeshes[state.legs];
    if (legMesh && !isWallUnit(mod.design)) {
      for (const pos of t.legAnchors) {
        const leg = new THREE.Mesh(legMesh.geometry, legMesh.material);
        leg.position.copy(pos);
        leg.castShadow = true;
        leg.userData.index = i;
        body.add(leg);
      }
    }

    if (i === host && state.tv) {
      const tv = tvTemplate.node.clone(true);
      const tb = tvTemplate.box;
      tv.position.set(t.size.x / 2 - (tb.min.x + tb.max.x) / 2, t.size.y - tb.min.y, 0.2 - (tb.min.z + tb.max.z) / 2);
      tv.traverse((o) => { if (o.isMesh) o.userData.index = i; });
      holder.add(tv);
    }
    world.add(holder);
    instances.push(holder);
  });

  buildDims();
  buildSelection();
  requestRender();
}

// ------------------------------------------------------------- dimensions --
const labels = [];
function label(i) {
  if (!labels[i]) {
    const el = document.createElement('span');
    el.className = 'cfg-dim';
    document.getElementById('cfg-labels').appendChild(el);
    labels[i] = { el, pos: new THREE.Vector3(), on: false, text: '' };
  }
  return labels[i];
}
const lineMat = new THREE.LineBasicMaterial({ color: '#111111', transparent: true, opacity: 0.75, depthTest: false });

function buildDims() {
  dimsGroup.clear();
  labels.forEach((l) => { l.on = false; });
  if (!showDims || !state.modules.length || !Object.keys(templates).length) return syncLabels();
  const pts = [];
  let n = 0;
  const tick = (a, b, dir) => { pts.push(a.clone().addScaledVector(dir, 0.03), a.clone().addScaledVector(dir, -0.03), b.clone().addScaledVector(dir, 0.03), b.clone().addScaledVector(dir, -0.03)); };
  const up = new THREE.Vector3(0, 1, 0);

  const runs = selected >= 0 ? [[state.modules[selected]]] : WALL_ORDER.map((w) => state.modules.filter((m) => m.wall === w)).filter((r) => r.length);
  for (const run of runs) {
    const W = WALLS[run[0].wall];
    const s0 = Math.min(...run.map((m) => m.s));
    const s1 = Math.max(...run.map((m) => m.s + templates[m.design].size.x));
    const top = Math.max(...run.map((m) => m.y + templates[m.design].size.y));
    const depth = Math.max(...run.map((m) => templates[m.design].size.z));
    const ty = FLOOR_Y + top + 0.09;
    const a = W.at(s0, ty).addScaledVector(W.n, depth + 0.02);
    const b = W.at(s1, ty).addScaledVector(W.n, depth + 0.02);
    pts.push(a, b); tick(a, b, up);
    const l = label(n++); l.pos.copy(a).add(b).multiplyScalar(0.5); l.text = cm(s1 - s0); l.on = true;

    if (selected >= 0) {
      const m = run[0], sz = templates[m.design].size;
      const lo = W.at(s0 - 0.09, FLOOR_Y + m.y).addScaledVector(W.n, sz.z + 0.02);
      const hi = W.at(s0 - 0.09, FLOOR_Y + m.y + sz.y).addScaledVector(W.n, sz.z + 0.02);
      const along = W.at(1, 0).sub(W.at(0, 0));
      pts.push(lo, hi); tick(lo, hi, along);
      const lh = label(n++); lh.pos.copy(lo).add(hi).multiplyScalar(0.5); lh.text = cm(sz.y); lh.on = true;
      const ld = label(n++); ld.pos.copy(W.at(s1 + 0.06, FLOOR_Y + m.y + 0.02)).addScaledVector(W.n, sz.z / 2); ld.text = cm(sz.z); ld.on = true;
    }
  }
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
  lines.renderOrder = 10;
  dimsGroup.add(lines);
  syncLabels();
}

const tmp = new THREE.Vector3();
function toScreen(v, r) {
  tmp.copy(v).project(camera);
  return [(tmp.x * 0.5 + 0.5) * r.width, (-tmp.y * 0.5 + 0.5) * r.height, tmp.z < 1];
}
function syncLabels() {
  const r = canvasHost.getBoundingClientRect();
  for (const l of labels) {
    l.el.hidden = !l.on;
    if (!l.on) continue;
    if (l.el.textContent !== l.text) l.el.textContent = l.text;
    const [x, y] = toScreen(l.pos, r);
    l.el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
  }
  const tb = document.getElementById('cfg-float');
  const m = state.modules[selected];
  if (m && templates[m.design] && !dragging) {
    const sz = templates[m.design].size;
    const top = WALLS[m.wall].at(m.s + sz.x / 2, FLOOR_Y + m.y + sz.y).addScaledVector(WALLS[m.wall].n, sz.z);
    const [x, y] = toScreen(top, r);
    tb.hidden = false;
    tb.style.transform = `translate(-50%, calc(-100% - 14px)) translate(${x}px, ${y}px)`;
  } else tb.hidden = true;
}

function glide(target, pos, smooth) {
  if (!smooth || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    controls.target.copy(target); camera.position.copy(pos); controls.update(); requestRender(); return;
  }
  const t0 = performance.now(), fromT = controls.target.clone(), fromP = camera.position.clone();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 650);
    const e = 1 - Math.pow(1 - k, 4);
    controls.target.lerpVectors(fromT, target, e);
    camera.position.lerpVectors(fromP, pos, e);
    controls.update(); requestRender();
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// -------------------------------------------------------------- selection --
const edgeMat = new THREE.LineBasicMaterial({ color: '#000000' });
function buildSelection() {
  world.traverse((o) => { if (o.userData.edge) o.removeFromParent(); });
  const inst = instances[selected];
  if (!inst) return;
  const meshes = [];
  inst.traverse((o) => { if (o.isMesh && /_estructura$|_frentes$/.test(o.name)) meshes.push(o); });
  for (const o of meshes) {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 30), edgeMat);
    e.userData.edge = true;
    e.raycast = () => {};
    o.add(e);
  }
}

function select(i) {
  selected = i;
  buildSelection();
  buildDims();
  renderPanel();
  requestRender();
}

// ------------------------------------------------------------ drag & pick --
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let press = null;       // pointer down on a module, not yet a drag
let dragging = null;    // { index, snapshot, grab, plane, wallUnit }

function setRay(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}
function pick(e) {
  setRay(e);
  const hit = raycaster.intersectObjects(world.children, true).find((h) => h.object.visible && h.object.userData.index != null);
  return hit || null;
}

// capture phase, so OrbitControls never starts orbiting when a module is grabbed
canvasHost.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const hit = pick(e);
  press = { x: e.clientX, y: e.clientY, hit };
  if (hit) controls.enabled = false;
}, true);

canvasHost.addEventListener('pointermove', (e) => {
  if (press && press.hit && !dragging && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 4) startDrag(e);
  if (dragging) return dragMove(e);
  if (!press) renderer.domElement.style.cursor = pick(e) ? 'grab' : '';
});

addEventListener('pointerup', (e) => {
  if (dragging) endDrag();
  else if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) <= 4 && e.target === renderer.domElement) {
    select(press.hit ? press.hit.object.userData.index : -1);
  }
  press = null;
  controls.enabled = true;
});

function startDrag(e) {
  const i = press.hit.object.userData.index;
  const m = state.modules[i];
  if (selected !== i) select(i);
  const wallUnit = isWallUnit(m.design);
  const p = press.hit.point;
  dragging = {
    index: i, snapshot: clone(state), wallUnit,
    grabS: WALLS[m.wall].s(p) - m.s,          // keep the grabbed point under the cursor
    grabY: p.y - (FLOOR_Y + m.y),
    plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -p.y),
    wall: m.wall,
  };
  renderer.domElement.setPointerCapture?.(e.pointerId);
  renderer.domElement.style.cursor = 'grabbing';
}

const wallPlanes = {
  left:  new THREE.Plane(new THREE.Vector3(1, 0, 0), WALL_X),
  back:  new THREE.Plane(new THREE.Vector3(0, 0, 1), -WALL_Z),
  right: new THREE.Plane(new THREE.Vector3(-1, 0, 0), WALL_X),
};

function dragMove(e) {
  setRay(e);
  const d = dragging;
  const m = state.modules[d.index];
  const sz = templates[m.design].size;
  let wall, want, y = m.y;

  if (d.wallUnit) {
    // wall units ride on the wall planes, sideways and up and down
    let best = null;
    for (const k of WALL_ORDER) {
      const p = raycaster.ray.intersectPlane(wallPlanes[k], new THREE.Vector3());
      if (!p) continue;
      const dist = p.distanceTo(raycaster.ray.origin);
      const s = WALLS[k].s(p);
      const [a, b] = WALLS[k].range;
      if (s < a - 0.6 || s > b + 0.6 || p.y < FLOOR_Y - 0.2 || p.y > CEILING_Y + 0.2) continue;
      if (!best || dist < best.dist) best = { k, p, dist };
    }
    if (!best) return;
    wall = best.k;
    if (wall !== d.wall) { d.grabS = sz.x / 2; d.wall = wall; }
    want = WALLS[wall].s(best.p) - d.grabS;
    y = THREE.MathUtils.clamp(best.p.y - d.grabY - FLOOR_Y, 0.35, CEILING_Y - FLOOR_Y - sz.y - 0.02);
  } else {
    // floor units slide on the floor; the nearest wall to the cursor wins
    const p = raycaster.ray.intersectPlane(d.plane, new THREE.Vector3());
    if (!p) return;
    p.x = THREE.MathUtils.clamp(p.x, -WALL_X, WALL_X);
    p.z = THREE.MathUtils.clamp(p.z, WALL_Z, OPEN_Z);
    wall = WALL_ORDER.reduce((a, k) => (WALLS[k].dist(p) < WALLS[a].dist(p) ? k : a), m.wall);
    // hysteresis: only change wall when clearly closer to the new one
    if (wall !== m.wall && WALLS[m.wall].dist(p) - WALLS[wall].dist(p) < 0.25) wall = m.wall;
    if (wall !== d.wall) { d.grabS = sz.x / 2; d.wall = wall; }
    want = WALLS[wall].s(p) - d.grabS;
  }

  const s = resolve(m.design, wall, want, y, d.index);
  if (s == null) {
    // no room on that wall at that height: try keeping the height we had
    if (d.wallUnit && y !== m.y) {
      const s2 = resolve(m.design, wall, want, m.y, d.index);
      if (s2 != null) { m.wall = wall; m.s = s2; }
    }
  } else { m.wall = wall; m.s = s; m.y = y; }

  placeHolder(instances[d.index], m);
  buildDims();
  requestRender();
}

function endDrag() {
  const d = dragging;
  dragging = null;
  renderer.domElement.style.cursor = '';
  if (JSON.stringify(d.snapshot) !== JSON.stringify(state)) {
    undoStack.push(d.snapshot);
    redoStack.length = 0;
    onStateChange();
  } else requestRender();
}

// ------------------------------------------------------------------ camera --
// The whole room from one corner, high up, through a very long lens: at 16 degrees the
// verticals barely splay, so the walls read flat and the room looks like a model on a
// table. The angle is the isometric one — 45 degrees round, 35 degrees down.
function frameRoom(smooth) {
  const box = new THREE.Box3(new THREE.Vector3(-WALL_X, FLOOR_Y, WALL_Z),
                             new THREE.Vector3(WALL_X, CEILING_Y, OPEN_Z));
  const target = box.getCenter(new THREE.Vector3());
  const az = THREE.MathUtils.degToRad(42), pol = THREE.MathUtils.degToRad(54.7);
  const dir = new THREE.Vector3(Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az));
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  // seen from a corner the room is as wide as its diagonal, so measure the eight corners
  // against the camera's own axes instead of guessing from width and height
  let halfW = 0, halfH = 0, halfD = 0;
  const p = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(target);
    halfW = Math.max(halfW, Math.abs(p.dot(right)));
    halfH = Math.max(halfH, Math.abs(p.dot(up)));
    halfD = Math.max(halfD, Math.abs(p.dot(dir)));
  }
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  // fitting from the centre undershoots a little in perspective, hence the margin; the
  // depth term is only there to keep the nearest corner clear of the near plane
  const dist = Math.max(halfH / tanV, halfW / (tanV * camera.aspect)) * 1.12 + halfD * 0.2;
  controls.minDistance = dist * 0.45;
  controls.maxDistance = dist * 1.5;
  glide(target, target.clone().addScaledVector(dir, dist), smooth);
}

// Leaving the mode behind: the lens, the orbit limits and the framing all go back.
function setDollHouse(on) {
  dollHouse = on;
  camera.fov = on ? 20 : 40;
  camera.far = on ? 120 : 40;     // a 20-degree lens stands a long way back
  camera.updateProjectionMatrix();
  controls.minPolarAngle = THREE.MathUtils.degToRad(on ? 12 : 35);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(on ? 88 : 92);
  controls.minAzimuthAngle = on ? -Infinity : THREE.MathUtils.degToRad(-75);
  controls.maxAzimuthAngle = on ? Infinity : THREE.MathUtils.degToRad(75);
  if (!on) { controls.minDistance = 1.2; controls.maxDistance = 7.5; }
  frameAll(true);
  renderPanel();
}

function frameAll(smooth = true) {
  if (dollHouse) return frameRoom(smooth);
  const box = new THREE.Box3();
  if (state.modules.length && Object.keys(templates).length) state.modules.forEach((m) => box.union(moduleBox(m)));
  else box.set(new THREE.Vector3(-1.5, FLOOR_Y, WALL_Z), new THREE.Vector3(1.5, 2.2, WALL_Z + 0.4));
  const size = box.getSize(new THREE.Vector3());
  const w = Math.max(size.x, 1.2) + 0.9, h = size.y + 0.8;
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const need = Math.max((h / 2) / tanV, (w / 2) / (tanV * camera.aspect)) + size.z * 0.5 + 0.3;
  controls.maxDistance = Math.max(7.5, need + 1.5);
  const dist = THREE.MathUtils.clamp(need, controls.minDistance, controls.maxDistance);
  const c = box.getCenter(new THREE.Vector3());
  const target = new THREE.Vector3(c.x, FLOOR_Y + size.y * 0.5 + (box.min.y - FLOOR_Y) * 0.5, Math.min(c.z, WALL_Z + 0.9));
  const az = THREE.MathUtils.degToRad(10);
  const pos = new THREE.Vector3(target.x + Math.sin(az) * dist, target.y + 0.35, target.z + Math.cos(az) * dist);
  // never back off further than the mouth of the room: from there the whole back wall
  // and the side walls read like a photograph of the room
  const maxZ = 3.1 + Math.max(0, 1.4 - camera.aspect) * 4;
  if (pos.z > maxZ) { pos.z = maxZ; pos.x = target.x * 0.6; }
  glide(target, pos, smooth);
}

// ------------------------------------------------------------------- loop --
renderer.setAnimationLoop(() => {
  if (controls.update()) dirty = true;
  if (!dirty) return;
  dirty = false;
  draw();
  syncLabels();
});

// ------------------------------------------------------------------- panel --
const panel = document.getElementById('cfg-panel-body');
const priceEl = document.getElementById('cfg-price');
const dimsEl = document.getElementById('cfg-size');

function price(mod) {
  const d = DESIGNS[mod.design];
  let p = d.price;
  if (d.fronts) p += FRONTS[mod.front].extra + handleCount(mod) * HANDLE_TYPES[mod.handle];
  if (!isWallUnit(mod.design)) p += (LEGS[state.legs] || LEGS.disco).price;
  return p;
}
function handleCount(mod) {
  if (!DESIGNS[mod.design].fronts || mod.handle === 'ninguno' || !templates[mod.design]) return 0;
  return templates[mod.design].anchors.filter((a) => !a.side || a.side === (mod.hinge === 'l' ? 'r' : 'l')).length;
}
function total() { return state.modules.reduce((s, m) => s + price(m), 0); }

function icon(design, size = 56) {
  // line pictograms drawn from the real proportions of each design
  const [w, h] = { sku1a: [24, 64], sku1b: [24, 64], sku1c: [24, 64], sku2a: [60, 32], sku2b: [60, 32], sku3a: [36, 36] }[design];
  const x = (64 - w) / 2, y = (68 - h) / 2;
  const L = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  let inner = '';
  if (design === 'sku1a') for (let k = 1; k < 5; k++) inner += L(x, y + (h * k) / 5, x + w, y + (h * k) / 5);
  if (design === 'sku1b') { for (let k = 1; k < 3; k++) inner += L(x, y + (h * k) / 3, x + w, y + (h * k) / 3) + L(x + w - 4, y + (h * k) / 3 - 7, x + w - 4, y + (h * k) / 3 - 3); inner += L(x + w - 4, y + h - 7, x + w - 4, y + h - 3); }
  if (design === 'sku1c') { inner += L(x, y + h * 0.2, x + w, y + h * 0.2) + L(x, y + h * 0.4, x + w, y + h * 0.4); for (let k = 0; k < 3; k++) { const yy = y + h * 0.56 + (h * 0.44 * k) / 3; inner += L(x, yy, x + w, yy) + L(x + w / 2 - 3, yy + 4, x + w / 2 + 3, yy + 4); } }
  if (design === 'sku2a') inner += L(x + w / 2, y, x + w / 2, y + h) + L(x, y + h / 2, x + w, y + h / 2);
  if (design === 'sku2b') { inner += L(x, y + h / 2, x + w, y + h / 2) + L(x + w / 2, y + h / 2, x + w / 2, y + h) + L(x, y + h * 0.75, x + w, y + h * 0.75); for (const cx of [x + w / 4, x + (3 * w) / 4]) inner += L(cx - 3, y + h * 0.62, cx + 3, y + h * 0.62) + L(cx - 3, y + h * 0.87, cx + 3, y + h * 0.87); }
  if (design === 'sku3a') inner += L(x, y + h / 2, x + w, y + h / 2);
  return `<svg class="cfg-ico" width="${size}" height="${size}" viewBox="0 0 64 68" aria-hidden="true"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/>${inner}</svg>`;
}

function swatchRow(name, options, current) {
  return `<div class="cfg-swatches" role="radiogroup" aria-label="${T[name] || name}">` + Object.entries(options).map(([k, v]) =>
    `<button type="button" class="cfg-swatch" role="radio" aria-checked="${k === current}" data-set="${name}" data-value="${k}">
      <span class="cfg-swatch-chip" style="background:${v.texture ? 'var(--walnut)' : v.color}"></span><span class="cfg-swatch-name">${T[k]}</span></button>`).join('') + '</div>';
}
function segmented(name, options, current, label) {
  return `<div class="cfg-seg" role="radiogroup" aria-label="${label || T[name] || name}">` + options.map(([k, text]) =>
    `<button type="button" role="radio" aria-checked="${k === current}" data-set="${name}" data-value="${k}">${text}</button>`).join('') + '</div>';
}
function sizeText(design) {
  const s = templates[design] ? templates[design].size : null;
  return s ? `${cm(s.x)} × ${cm(s.z)} × ${cm(s.y)} ${T.cm}` : '';
}
function layoutText() {
  if (!state.modules.length || !Object.keys(templates).length) return '—';
  const run = state.modules.filter((m) => !isWallUnit(m.design)).reduce((s, m) => s + templates[m.design].size.x, 0);
  return T.count(state.modules.length, num(run, 2));
}

function renderPanel() {
  priceEl.textContent = money.format(total());
  dimsEl.textContent = layoutText();
  document.getElementById('cfg-empty').hidden = state.modules.length > 0;
  document.getElementById('btn-undo').disabled = !undoStack.length;
  document.getElementById('btn-redo').disabled = !redoStack.length;
  document.getElementById('btn-tv').setAttribute('aria-pressed', String(state.tv));
  document.getElementById('btn-tv').disabled = tvHost() < 0;
  document.getElementById('btn-dims').setAttribute('aria-pressed', String(showDims));
  document.getElementById('btn-doll').setAttribute('aria-pressed', String(dollHouse));

  if (selected >= 0 && state.modules[selected]) return renderModulePanel();

  const add = Object.keys(DESIGNS).map((k) => `
    <button type="button" class="cfg-add" data-add="${k}">
      ${icon(k)}
      <span class="cfg-add-text"><span class="cfg-add-name">${T[DESIGNS[k].family]}</span><span class="cfg-add-design">${T[k]}</span><span class="cfg-add-size">${sizeText(k)}</span></span>
      <span class="cfg-add-price">${money.format(DESIGNS[k].price)}</span>
    </button>`).join('');

  const comp = state.modules.length ? `<ol class="cfg-list">` + state.modules.map((m, i) => `
    <li><button type="button" data-select="${i}">${icon(m.design, 32)}<span>${T[DESIGNS[m.design].family]} · ${T[m.design]}<small>${T.wallPick}: ${T[m.wall]}</small></span><span class="cfg-list-price">${money.format(price(m))}</span></button></li>`).join('') + '</ol>'
    : `<p class="cfg-note">${T.empty}</p>`;

  const same = (k) => (state.modules.length && state.modules.every((m) => m[k] === state.modules[0][k]) ? state.modules[0][k] : null);
  panel.innerHTML = `
    <section class="cfg-sec"><h3>${T.add}</h3><div class="cfg-adds">${add}</div><p class="cfg-msg" id="cfg-msg" role="status"></p></section>
    <section class="cfg-sec"><h3>${T.composition}</h3><p class="cfg-note cfg-hint">${T.dragHint}</p>${comp}</section>
    <section class="cfg-sec"><h3>${T.applyAll}</h3>
      <h4>${T.front}</h4>${swatchRow('all-front', FRONTS, same('front'))}
      <h4>${T.body}</h4>${swatchRow('all-body', BODIES, same('body'))}
      <h4>${T.handle}</h4>${segmented('all-handle', Object.keys(HANDLE_TYPES).map((k) => [k, T[k]]), same('handle'), T.handle)}
      <h4>${T.handleFinish}</h4>${swatchRow('handleFinish', HANDLE_FINISHES, state.handleFinish)}
      <h4>${T.legs}</h4>${segmented('legs', Object.keys(LEGS).map((k) => [k, T[k]]), state.legs, T.legs)}
      ${state.modules.length ? `<button type="button" class="cfg-link" data-action="clear">${T.clear}</button>` : ''}
    </section>`;
}

function renderModulePanel() {
  const mod = state.modules[selected];
  const d = DESIGNS[mod.design];
  const designs = FAMILIES[d.family].designs.map((k) => `
    <button type="button" class="cfg-design" role="radio" aria-checked="${k === mod.design}" data-set="design" data-value="${k}">${icon(k, 48)}<span>${T[k]}</span></button>`).join('');
  panel.innerHTML = `
    <div class="cfg-mod-head">
      <button type="button" class="cfg-back" data-action="deselect">${svgBack()}<span>${T.close}</span></button>
      <p class="cfg-mod-title"><span>${T.moduleN(selected + 1)}</span> ${T[d.family]}</p>
      <p class="cfg-mod-meta">${sizeText(mod.design)} · <strong>${money.format(price(mod))}</strong></p>
    </div>
    <section class="cfg-sec"><h3>${T.design}</h3><div class="cfg-designs" role="radiogroup" aria-label="${T.design}">${designs}</div></section>
    <section class="cfg-sec"><h3>${T.wallPick}</h3>${segmented('wall', WALL_ORDER.map((k) => [k, T[k]]), mod.wall, T.wallPick)}</section>
    <section class="cfg-sec"><h3>${T.front}</h3>
      ${d.fronts ? swatchRow('front', FRONTS, mod.front) : `<p class="cfg-note">${T.noFronts}</p>`}
    </section>
    <section class="cfg-sec"><h3>${T.body}</h3>${swatchRow('body', BODIES, mod.body)}</section>
    ${isWallUnit(mod.design) ? '' : `<section class="cfg-sec"><h3>${T.legs}</h3>${segmented('legs', Object.keys(LEGS).map((k) => [k, T[k]]), state.legs, T.legs)}</section>`}
    ${d.fronts ? `<section class="cfg-sec"><h3>${T.handle}</h3>
      ${segmented('handle', Object.keys(HANDLE_TYPES).map((k) => [k, T[k]]), mod.handle)}
      <h4>${T.handleFinish}</h4>${swatchRow('handleFinish', HANDLE_FINISHES, state.handleFinish)}
      ${d.doors ? `<h4>${T.hinge}</h4>${segmented('hinge', [['l', T.hingeL], ['r', T.hingeR]], mod.hinge)}` : ''}
    </section>` : ''}
    <section class="cfg-sec cfg-actions">
      <button type="button" data-action="left">${svgArrow(-1)}<span>${T.moveL}</span></button>
      <button type="button" data-action="right">${svgArrow(1)}<span>${T.moveR}</span></button>
      <button type="button" data-action="duplicate">${svgDup()}<span>${T.duplicate}</span></button>
      <button type="button" data-action="remove" class="is-danger">${svgBin()}<span>${T.remove}</span></button>
    </section>
    <p class="cfg-msg" id="cfg-msg" role="status"></p>`;
}

const svgArrow = (dir) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg>`;
const svgBack = () => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`;
const svgDup = () => `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/></svg>`;
const svgBin = () => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>`;

function flash(msg) {
  const el = document.getElementById('cfg-msg');
  if (el) { el.textContent = msg; clearTimeout(flash.t); flash.t = setTimeout(() => { el.textContent = ''; }, 4000); }
}

function addModule(design) {
  const near = state.modules[selected] || state.modules[state.modules.length - 1] || null;
  const spot = findSpot(design, near && isWallUnit(near.design) === isWallUnit(design) ? near : null) || findSpot(design, null);
  if (!spot) return flash(T.noRoom);
  const base = near || DEFAULT_STATE.modules[0];
  commit((s) => { s.modules.push({ design, front: base.front, body: base.body, handle: base.handle, hinge: 'l', ...spot }); });
  select(state.modules.length - 1);
}

function nudge(dir) {
  const m = state.modules[selected];
  const s = resolve(m.design, m.wall, m.s + dir * 0.1, m.y, selected);
  if (s == null || Math.abs(s - m.s) < EPS) return;
  commit((st) => { st.modules[selected].s = s; });
}

function onPanelClick(e) {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.add) return addModule(b.dataset.add);
  if (b.dataset.select) return select(+b.dataset.select);
  const set = b.dataset.set, v = b.dataset.value;
  if (set) {
    if (set === 'handleFinish') return commit((s) => { s.handleFinish = v; });
    if (set === 'legs') return commit((s) => { s.legs = v; syncLegs(s); });
    if (set.startsWith('all-')) { const k = set.slice(4); return commit((s) => s.modules.forEach((m) => { m[k] = v; })); }
    const m = state.modules[selected];
    if (set === 'design') {
      const s = resolve(v, m.wall, m.s, m.y, selected);
      if (s == null) return flash(T.noRoom);
      return commit((st) => { Object.assign(st.modules[selected], { design: v, s }); });
    }
    if (set === 'wall') {
      if (v === m.wall) return;
      const r = WALLS[v].range;
      const s = resolve(m.design, v, (r[0] + r[1]) / 2 - templates[m.design].size.x / 2, m.y, selected);
      if (s == null) return flash(T.noRoom);
      commit((st) => { Object.assign(st.modules[selected], { wall: v, s }); });
      return frameAll(true);
    }
    return commit((s) => { s.modules[selected][set] = v; });
  }
  const act = b.dataset.action;
  if (act === 'deselect') return select(-1);
  if (act === 'clear') { commit((s) => { s.modules = []; }); return select(-1); }
  if (act === 'remove') { commit((s) => { s.modules.splice(selected, 1); }); return select(-1); }
  if (act === 'left') return nudge(-1);
  if (act === 'right') return nudge(1);
  if (act === 'duplicate') {
    const m = state.modules[selected];
    const spot = findSpot(m.design, m);
    if (!spot) return flash(T.noRoom);
    commit((s) => { s.modules.push({ ...clone(m), ...spot }); });
    return select(state.modules.length - 1);
  }
}
panel.addEventListener('click', onPanelClick);
document.getElementById('cfg-float').addEventListener('click', onPanelClick);

// ------------------------------------------------------------ compositions --
// Every module still goes through resolve(), so a preset can never drop one on top of
// another or outside the room, whatever its authored position says.
function applyPreset(p) {
  commit((st) => {
    st.legs = p.legs; st.handleFinish = p.handleFinish; st.tv = p.tv;
    st.modules = [];
    for (const r of p.runs) {
      const width = r.items.reduce((w, [d]) => w + templates[d].size.x, 0);
      const [lo, hi] = WALLS[r.wall].range;
      let at = THREE.MathUtils.clamp(r.at - width / 2, lo, Math.max(lo, hi - width));
      for (const [design, extra] of r.items) {
        const y = (extra && extra.y) || (isWallUnit(design) ? WALL_UNIT_Y : LEGS[p.legs].lift);
        const s = resolve(design, r.wall, at, y, -1);
        if (s != null) st.modules.push({ front: p.front, body: p.body, handle: p.handle, hinge: 'l', ...extra, design, wall: r.wall, s, y });
        at += templates[design].size.x;
      }
    }
  });
  select(-1);
  frameAll(true);
}

// A bag that empties before it refills, so pressing again never repeats what is on screen.
let presetShown = 0;
let presetBag = [];
function shuffleLayout() {
  if (!Object.keys(templates).length) return;
  if (!presetBag.length) {
    presetBag = PRESETS.map((_, i) => i).filter((i) => i !== presetShown);
    for (let i = presetBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [presetBag[i], presetBag[j]] = [presetBag[j], presetBag[i]];
    }
  }
  presetShown = presetBag.pop();
  applyPreset(PRESETS[presetShown]);
}

// ------------------------------------------------------------ stage tools --
function undo() { if (!undoStack.length) return; redoStack.push(clone(state)); state = undoStack.pop(); if (selected >= state.modules.length) selected = -1; onStateChange(); }
function redo() { if (!redoStack.length) return; undoStack.push(clone(state)); state = redoStack.pop(); if (selected >= state.modules.length) selected = -1; onStateChange(); }
document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);
document.getElementById('btn-dims').addEventListener('click', () => { showDims = !showDims; buildDims(); renderPanel(); requestRender(); });
document.getElementById('btn-shuffle').addEventListener('click', shuffleLayout);
document.getElementById('btn-tv').addEventListener('click', () => commit((s) => { s.tv = !s.tv; }));
document.getElementById('btn-view').addEventListener('click', () => frameAll(true));
document.getElementById('btn-doll').addEventListener('click', () => setDollHouse(!dollHouse));

addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, dialog')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); return redo(); }
  if (selected < 0) return;
  if (e.key === 'Escape') return select(-1);
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (e.target.closest('.cfg-panel, .cfg-float, .cfg-tools')) return;
    e.preventDefault();
    return nudge(e.key === 'ArrowLeft' ? -1 : 1);
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.closest('button')) {
    commit((s) => { s.modules.splice(selected, 1); }); select(-1);
  }
});

// ------------------------------------------------------------------ summary --
const dlg = document.getElementById('cfg-summary');
document.getElementById('btn-summary').addEventListener('click', () => {
  const rows = {};
  for (const m of state.modules) {
    const key = [m.design, DESIGNS[m.design].fronts ? m.front : '', m.body].join('|');
    rows[key] = rows[key] || { m, qty: 0 };
    rows[key].qty++;
  }
  const handles = state.modules.reduce((s, m) => s + handleCount(m), 0);
  const hType = state.modules.find((m) => handleCount(m));
  const legSets = LEGS[state.legs].mesh ? state.modules.filter((m) => !isWallUnit(m.design)).length : 0;
  dlg.querySelector('.cfg-sum-rows').innerHTML = Object.values(rows).map(({ m, qty }) => `
    <tr><td>${icon(m.design, 36)}</td>
      <td><strong>${T[DESIGNS[m.design].family]} · ${T[m.design]}</strong><br><span>${sizeText(m.design)} · ${T.body}: ${T[m.body]}${DESIGNS[m.design].fronts ? ` · ${T.front}: ${T[m.front]}` : ''}</span></td>
      <td class="num">${qty}</td><td class="num">${money.format(price(m) * qty)}</td></tr>`).join('') +
    (handles ? `<tr class="cfg-sum-sub"><td></td><td>${T.handlesLine}: ${hType ? T[hType.handle] : ''} · ${T[state.handleFinish]}</td><td class="num">${handles}</td><td class="num"></td></tr>` : '') +
    (legSets ? `<tr class="cfg-sum-sub"><td></td><td>${T.legsLine}: ${T[state.legs]}</td><td class="num">${legSets * 4}</td><td class="num"></td></tr>` : '');
  dlg.querySelector('.cfg-sum-total').textContent = money.format(total());
  dlg.querySelector('.cfg-sum-size').textContent = layoutText();
  dlg.showModal();
});
dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
// in-page anchors would overwrite the #c= layout in the URL; scroll instead
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || a.getAttribute('href').length < 2) return;
  const el = document.getElementById(a.getAttribute('href').slice(1));
  if (!el) return;
  e.preventDefault();
  el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});
document.getElementById('btn-share').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  try { await navigator.clipboard.writeText(location.href); btn.querySelector('span').textContent = T.copied; }
  catch (err) { prompt(T.share, location.href); }
  setTimeout(() => { btn.querySelector('span').textContent = T.share; }, 2500);
});

// static labels
for (const el of document.querySelectorAll('[data-t]')) el.textContent = T[el.dataset.t];
for (const el of document.querySelectorAll('[data-t-label]')) { el.setAttribute('aria-label', T[el.dataset.tLabel]); el.title = T[el.dataset.tLabel]; }
document.getElementById('cfg-demo-note').textContent = T.demoPrices;
