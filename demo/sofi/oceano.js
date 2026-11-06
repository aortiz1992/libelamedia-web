// ─────────────────────────────────────────────────────────────────────────────
// El agua.
//
// Cinco cosas, y ninguna es un vídeo de fondo: todo se genera aquí y responde a
// la cámara, que es lo que hace que parezca agua de verdad y no un decorado.
//
//   1. La bóveda   — degradado de profundidad, más oscuro abajo que arriba.
//   2. La niebla   — lo lejano se va al azul. Es lo que da sensación de metros.
//   3. Los rayos   — haces de luz desde la superficie, en movimiento lento.
//   4. La nieve    — partículas en suspensión, que es lo que delata que hay agua.
//   5. Las cáusticas — las venas de luz que la superficie proyecta sobre todo.
//
// La bóveda sirve además de mapa de entorno: los reflejos del pez salen del agua
// que lo rodea, no de un estudio. Sin eso el bicho parece recortado y pegado.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from "three";

// Estos colores van subidos a proposito. El mapeado de tonos ACES comprime y
// dessatura, asi que un azul "correcto" en el codigo sale casi negro en
// pantalla: medido, el #0f4a63 de la primera version acababa en un #0a1a26.
const ARRIBA = new THREE.Color("#5fc4de");   // hacia la superficie
const MEDIO  = new THREE.Color("#1d6d8e");
const ABAJO  = new THREE.Color("#06202e");   // hacia el fondo

const VERT_BOVEDA = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG_BOVEDA = `
  uniform vec3 arriba, medio, abajo;
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
    // Dos tramos en vez de uno: con un degradado lineal el agua se ve plana.
    vec3 c = h < 0.5
      ? mix(abajo, medio, smoothstep(0.0, 0.5, h))
      : mix(medio, arriba, smoothstep(0.5, 1.0, h));
    // Claro hacia el cenit: es por donde entra el sol.
    c += vec3(0.16, 0.22, 0.20) * pow(clamp(vDir.y, 0.0, 1.0), 5.0);
    gl_FragColor = vec4(c, 1.0);
  }
`;

function boveda(radio) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radio, 32, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        arriba: { value: ARRIBA }, medio: { value: MEDIO }, abajo: { value: ABAJO },
      },
      vertexShader: VERT_BOVEDA, fragmentShader: FRAG_BOVEDA,
    })
  );
}

// ── cáusticas ────────────────────────────────────────────────────────────────
// Interferencia de varias ondas; el mínimo de dos capas desplazadas deja las
// venas finas que hace la superficie del agua. Se dibuja una vez, se repite.
function texturaCausticas(n = 256) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = n;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(n, n);
  const TAU = Math.PI * 2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = (x / n) * TAU, v = (y / n) * TAU;
      let s = 0;
      s += Math.sin(u * 3.0 + Math.sin(v * 2.0) * 1.7);
      s += Math.sin(v * 3.0 + Math.sin(u * 2.0) * 1.7);
      s += Math.sin((u + v) * 2.0 + Math.cos(u * 3.0) * 1.1);
      s = Math.abs(s) / 3.0;
      // La potencia alta es lo que afila las venas: sin ella queda una nube.
      const k = Math.pow(1.0 - Math.min(1, s), 7.0);
      const c = Math.round(Math.min(255, k * 255));
      const i = (y * n + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// ── grano de superficie ──────────────────────────────────────────────────────
// Mapa de normales repetible, generado aquí. Se aplica por proyección triplanar
// en coordenadas de mundo, así que NO depende de cómo estén desplegadas las UV
// de cada malla: el pez venía de un modelado de producto y sus UV no servían
// para esto.
//
// Es lo que quita el aspecto de plástico recién sacado del molde: una silicona
// real tiene poro, y una carcasa pintada tiene grano de pintura. Sin esto, las
// superficies son matemáticamente perfectas y el ojo lo nota aunque no sepa por
// qué.
function texturaGrano(n = 256) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = n;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(n, n);

  // Campo de alturas: varias octavas de ruido de valor, repetible por
  // construcción porque la rejilla base divide a n.
  const alt = new Float32Array(n * n);
  for (const [celdas, peso] of [[8, 0.5], [16, 0.3], [32, 0.2]]) {
    const g = new Float32Array(celdas * celdas);
    for (let i = 0; i < g.length; i++) g[i] = Math.random();
    const suav = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const fx = (x / n) * celdas, fy = (y / n) * celdas;
        const x0 = Math.floor(fx) % celdas, y0 = Math.floor(fy) % celdas;
        const x1 = (x0 + 1) % celdas, y1 = (y0 + 1) % celdas;
        const tx = suav(fx - Math.floor(fx)), ty = suav(fy - Math.floor(fy));
        const a = g[y0 * celdas + x0] * (1 - tx) + g[y0 * celdas + x1] * tx;
        const b = g[y1 * celdas + x0] * (1 - tx) + g[y1 * celdas + x1] * tx;
        alt[y * n + x] += (a * (1 - ty) + b * ty) * peso;
      }
    }
  }

  // De alturas a normales: la pendiente en cada eje, codificada en el color.
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const dx = alt[y * n + ((x + 1) % n)] - alt[y * n + ((x - 1 + n) % n)];
      const dy = alt[((y + 1) % n) * n + x] - alt[((y - 1 + n) % n) * n + x];
      const l = Math.hypot(-dx, -dy, 0.12);
      const p = i * 4;
      img.data[p] = Math.round(((-dx / l) * 0.5 + 0.5) * 255);
      img.data[p + 1] = Math.round(((-dy / l) * 0.5 + 0.5) * 255);
      img.data[p + 2] = Math.round(((0.12 / l) * 0.5 + 0.5) * 255);
      img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// ── rayos de luz ─────────────────────────────────────────────────────────────
const FRAG_RAYO = `
  uniform vec3 color;
  uniform float opacidad;
  varying vec2 vUv;
  void main() {
    // Se apaga por los bordes y hacia abajo: un haz con filo se ve de cartón.
    float lado = smoothstep(0.0, 0.42, vUv.x) * smoothstep(1.0, 0.58, vUv.x);
    float alto = smoothstep(0.0, 0.55, vUv.y);
    gl_FragColor = vec4(color, lado * alto * opacidad);
  }
`;

const VERT_RAYO = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function rayos(n, alcance) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const an = 0.30 + Math.random() * 0.75;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(an, alcance * 2.1),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, fog: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: {
          color: { value: new THREE.Color("#b8f0ff") },
          opacidad: { value: 0.16 + Math.random() * 0.14 },
        },
        vertexShader: VERT_RAYO, fragmentShader: FRAG_RAYO,
      })
    );
    const ang = (i / n) * Math.PI * 2 + Math.random();
    // Mas cerca del sujeto: a la distancia de antes caian todos fuera de cuadro
    // y no se veia ni uno. El encuadre es ajustado al pez.
    const rad = alcance * (0.08 + Math.random() * 0.30);
    m.position.set(Math.cos(ang) * rad, alcance * 0.55, Math.sin(ang) * rad);
    m.rotation.set((Math.random() - 0.5) * 0.3, ang, (Math.random() - 0.5) * 0.22);
    m.userData.giro = 0.012 + Math.random() * 0.02;
    m.userData.fase = Math.random() * 10;
    g.add(m);
  }
  g.renderOrder = -2;
  return g;
}

// ── nieve marina ─────────────────────────────────────────────────────────────
function puntoRedondo() {
  const n = 64, cv = document.createElement("canvas");
  cv.width = cv.height = n;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(220,245,255,.65)");
  g.addColorStop(1, "rgba(200,235,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, n, n);
  return new THREE.CanvasTexture(cv);
}

function nieve(cuantas, caja) {
  const pos = new Float32Array(cuantas * 3);
  const vel = new Float32Array(cuantas);
  const tam = new Float32Array(cuantas);
  for (let i = 0; i < cuantas; i++) {
    pos[i * 3] = (Math.random() - 0.5) * caja;
    pos[i * 3 + 1] = (Math.random() - 0.5) * caja;
    pos[i * 3 + 2] = (Math.random() - 0.5) * caja;
    vel[i] = 0.006 + Math.random() * 0.016;
    tam[i] = 0.0016 + Math.random() * 0.0055;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(tam, 1));
  const mat = new THREE.PointsMaterial({
    size: 0.0075, map: puntoRedondo(), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0.8, sizeAttenuation: true,
    color: new THREE.Color("#cfefff"), fog: false,
  });
  const p = new THREE.Points(geo, mat);
  p.userData = { vel, caja };
  p.frustumCulled = false;
  return p;
}

// ─────────────────────────────────────────────────────────────────────────────
export function crearOceano(escena, render, opciones = {}) {
  const radio = opciones.radio ?? 9;
  const alcance = opciones.alcance ?? 2.4;

  const cielo = boveda(radio);
  escena.add(cielo);

  // La niebla es lo que convierte un fondo de color en profundidad. La densidad
  // está medida sobre la escena real: el pez mide 36 cm y la cámara se le pone a
  // menos de un metro, así que valores de niebla "normales" no harían nada.
  escena.fog = new THREE.FogExp2(new THREE.Color("#0b3e55"), opciones.niebla ?? 0.42);

  const haces = rayos(opciones.rayos ?? 7, alcance);
  escena.add(haces);

  // La caja de motas se cine al sujeto: repartidas por toda la escena quedaban
  // demasiado lejos para verse con el encuadre cerrado.
  const motas = nieve(opciones.motas ?? 650, alcance * 0.55);
  escena.add(motas);

  // Mapa de entorno sacado del propio agua: los reflejos del pez vienen de donde
  // está, no de un estudio. Es la diferencia entre estar dentro del agua y estar
  // recortado encima.
  const aparte = new THREE.Scene();
  aparte.add(boveda(radio));
  const sol = new THREE.Mesh(
    new THREE.SphereGeometry(radio * 0.26, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color("#dff6ff") })
  );
  sol.position.set(radio * 0.18, radio * 0.78, -radio * 0.22);
  aparte.add(sol);
  const pmrem = new THREE.PMREMGenerator(render);
  escena.environment = pmrem.fromScene(aparte, 0.03).texture;
  pmrem.dispose();

  // ── cáusticas sobre los materiales ────────────────────────────────────────
  const uniformes = {
    uCaus: { value: texturaCausticas() },
    uCausT: { value: 0 },
    uCausInt: { value: opciones.causticas ?? 0.26 },
    uCausCol: { value: new THREE.Color("#bfefff") },
    uGrano: { value: texturaGrano() },
    // El halo de las fichas. La FUERZA es compartida por todos los materiales
    // —un solo valor que se anima en un sitio— y cada material lleva aparte su
    // propio interruptor, que dice si esta pieza es de las aisladas. Así el
    // halo entra y sale con una sola variable en vez de recorrer 342 piezas
    // cada cuadro.
    uHaloFuerza: { value: 0 },
    uHaloCol: { value: new THREE.Color("#8fe4ff") },
  };

  // relieve: 0 deja la superficie como viene; 1 es poro de silicona. escala es
  // el tamaño del grano en metros (más pequeño = poro más fino).
  // cola: si es > 0, la transmisión sube hacia la punta de la caudal. Una
  // silicona fina deja pasar más luz cuanto menos material hay, y la caudal
  // del SoFi se afila: translúcida y uniforme se ve de plástico.
  function aplicarCausticas(material, relieve = 0, escala = 170, aspereza = 0, cola = 0) {
    if (!material || material.userData.conCausticas) return;
    material.userData.conCausticas = true;
    material.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniformes);
      sh.uniforms.uRelieve = { value: relieve };
      sh.uniforms.uGranoEsc = { value: escala };
      sh.uniforms.uGranoRug = { value: aspereza };
      sh.uniforms.uCola = { value: cola };
      // Interruptor propio de este material: 0 normal, 1 cuando su conjunto
      // está aislado. Se guarda el sombreador en el material para poder
      // tocarlo desde fuera una vez compilado.
      sh.uniforms.uHaloEste = { value: 0 };
      material.userData.sh = sh;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>",
          "#include <common>\nvarying vec3 vCaus;\nvarying vec3 vNorMundo;\nvarying vec3 vLocal;")
        .replace(
          "#include <project_vertex>",
          "#include <project_vertex>\n"
          + "vCaus = (modelMatrix * vec4(transformed, 1.0)).xyz;\n"
          + "vNorMundo = normalize(mat3(modelMatrix) * objectNormal);\n"
          // En coordenadas LOCALES del pez, no de mundo: ahora nada y gira,
          // así que el mundo ya no dice dónde cae la cola.
          + "vLocal = transformed;"
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           varying vec3 vCaus;
           varying vec3 vNorMundo;
           varying vec3 vLocal;
           uniform sampler2D uCaus;
           uniform sampler2D uGrano;
           uniform float uCausT, uCausInt, uRelieve, uGranoEsc, uGranoRug, uCola;
           uniform float uHaloFuerza, uHaloEste;
           uniform vec3 uCausCol, uHaloCol;
           vec3 vGranoN;`
        )
        // El grano se mete DESPUES de que el sombreador haya resuelto la normal
        // y ANTES de iluminar: perturbarla ahí es lo que hace que la luz la vea.
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
           if (uRelieve > 0.0) {
             // Triplanar: tres muestras, una por plano, mezcladas por lo que
             // mire la cara. Así no hacen falta UV.
             vec3 an = abs(vNorMundo);
             an /= max(an.x + an.y + an.z, 1e-4);
             vec3 gx = texture2D(uGrano, vCaus.zy * uGranoEsc).rgb * 2.0 - 1.0;
             vec3 gy = texture2D(uGrano, vCaus.xz * uGranoEsc).rgb * 2.0 - 1.0;
             vec3 gz = texture2D(uGrano, vCaus.xy * uGranoEsc).rgb * 2.0 - 1.0;
             vec3 gr = gx.zyx * an.x + gy.xzy * an.y + gz.xyz * an.z;
             // Una superficie real tampoco tiene la aspereza uniforme: donde hay
             // poro, mate; donde no, brillo. Eso rompe el reflejo de plástico.
             roughnessFactor = clamp(roughnessFactor + gr.z * uGranoRug, 0.04, 1.0);
             vGranoN = gr;
           } else { vGranoN = vec3(0.0); }`
        )
        .replace(
          "#include <transmission_fragment>",
          `#ifdef USE_TRANSMISSION
             if (uCola > 0.0) {
               // La punta de la caudal cae en z local negativa: cuanto más
               // atrás, más fina la pala y más luz la atraviesa.
               float k = smoothstep(-0.02, -0.17, vLocal.z);
               material.transmission = mix(material.transmission,
                                           min(0.95, material.transmission + 0.33),
                                           k * uCola);
               material.thickness = mix(material.thickness, 0.0016, k * uCola);
             }
           #endif
           #include <transmission_fragment>`
        )
        .replace(
          "#include <normal_fragment_begin>",
          `#include <normal_fragment_begin>
           if (uRelieve > 0.0) normal = normalize(normal + vGranoN * uRelieve);`
        )
        .replace(
          "#include <dithering_fragment>",
          `{
             // Dos capas a distinta escala y en sentidos opuestos: el mínimo de
             // las dos deja las venas finas en vez de una mancha.
             vec2 a = vCaus.xz * 3.4 + vec2(uCausT * 0.030, uCausT * 0.019);
             vec2 b = vCaus.xz * 2.2 - vec2(uCausT * 0.024, uCausT * 0.011);
             float c = min(texture2D(uCaus, a).r, texture2D(uCaus, b).r);
             // Pegan desde arriba: en los bajos de la pieza no hay cáustica.
             float desde = smoothstep(-0.35, 0.30, vCaus.y);
             gl_FragColor.rgb += uCausCol * c * desde * uCausInt;
           }
           // Halo de pieza aislada. Es un término de Fresnel: brilla donde la
           // superficie se va de canto respecto a la cámara, que es justo el
           // contorno. No se pinta un borde en 2D —eso se nota plano y se
           // rompe al girar— sino que es la propia geometría la que se
           // enciende por el filo. Y como se SUMA, el bloom que ya hay en la
           // cadena lo recoge y lo derrama sobre el agua.
           if (uHaloFuerza * uHaloEste > 0.001) {
             float fres = 1.0 - abs(dot(normalize(vViewPosition), normal));
             // Exponente alto y fuerza moderada: a 2,6 y 2,3 una brida vista
             // casi de canto se quemaba entera, porque ahi el Fresnel vale
             // casi uno en toda su cara y deja de ser contorno. A 3,6 el
             // termino se aprieta contra el filo y la pieza conserva su forma.
             gl_FragColor.rgb += uHaloCol * pow(fres, 3.6) * uHaloFuerza * uHaloEste * 1.55;
           }
           #include <dithering_fragment>`
        );
    };
    material.needsUpdate = true;
  }

  let t = 0;
  function actualizar(dt) {
    t += dt;
    uniformes.uCausT.value = t;

    for (const r of haces.children) {
      r.rotation.y += r.userData.giro * dt;
      const at = r.userData.atenua ?? 1;
      r.material.uniforms.opacidad.value =
        (0.05 + 0.045 * (1 + Math.sin(t * 0.5 + r.userData.fase)) * 0.5) * at;
    }

    // Las motas suben despacio y reaparecen por abajo al salirse: así no hay que
    // guardar ni reciclar nada.
    const p = motas.geometry.attributes.position;
    const { vel, caja } = motas.userData;
    for (let i = 0; i < vel.length; i++) {
      let y = p.array[i * 3 + 1] + vel[i] * dt;
      if (y > caja / 2) y = -caja / 2;
      p.array[i * 3 + 1] = y;
      p.array[i * 3] += Math.sin(t * 0.3 + i) * 0.00006;
    }
    p.needsUpdate = true;
  }

  // La profundidad manda sobre el agua, no sólo sobre las cifras: a quince
  // metros apenas llega luz de la superficie, el rojo se ha ido hace rato y las
  // cáusticas son un recuerdo. Es lo que hace que el deslizador se SIENTA.
  const colBase = { arriba: ARRIBA.clone(), medio: MEDIO.clone(), abajo: ABAJO.clone() };
  const causBase = uniformes.uCausInt.value;
  const nieblaBase = escena.fog.density;

  function ponerProfundidad(L) {
    const u = cielo.material.uniforms;
    for (const k of ["arriba", "medio", "abajo"]) {
      u[k].value.setRGB(
        colBase[k].r * L.rojo * 1.35 + colBase[k].r * 0.10,
        colBase[k].g * L.verde * 1.15 + colBase[k].g * 0.10,
        colBase[k].b * L.azul * 1.02 + colBase[k].b * 0.10
      );
    }
    // Las cáusticas vienen de la superficie: con el agua encima se deshacen.
    uniformes.uCausInt.value = causBase * Math.pow(L.total, 1.4);
    // Y el agua se cierra: más profundidad, menos visibilidad.
    escena.fog.density = nieblaBase * (1 + 0.55 * (1 - L.total));
    for (const r of haces.children) r.userData.atenua = L.total;
  }

  // La fuerza del halo la pone el configurador: un solo valor para toda la
  // escena, animado donde se anima todo lo demás.
  function ponerHalo(v) { uniformes.uHaloFuerza.value = v; }

  return { actualizar, aplicarCausticas, cielo, haces, motas, ponerProfundidad, ponerHalo };
}
