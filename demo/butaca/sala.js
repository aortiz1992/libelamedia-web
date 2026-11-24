// ─────────────────────────────────────────────────────────────────────────────
// De la disposición a geometría de verdad.
//
// Aquí NO se decide dónde va ninguna butaca: eso está resuelto en
// `disposicion.js` y comprobado con números. Esto pone las mallas donde esa
// lista dice y les da el aspecto de un teatro a la italiana: terciopelo rojo,
// marfil, pan de oro y madera.
//
// Tercera versión. Antonio pidió revisar bien el modelo y que todo fuera «más
// elegante y realista». Mirando desde las butacas salieron fallos que no eran
// de gusto, eran errores:
//   · las columnas del anfiteatro NO EXISTÍAN: apartaban butacas, pero nadie
//     las construía;
//   · las molduras de oro del frente del anfiteatro iban por DENTRO, del lado
//     de sus butacas: desde el patio el frente se veía negro;
//   · el zócalo era una caja recta de 0 a 1,1 m y el patio sube 1,4 m hasta el
//     fondo: se hundía en la rampa;
//   · el faldón de los palcos de arriba bajaba 0,8 m y dejaba a los de abajo
//     mirando por una rendija de 70 cm;
//   · la embocadura era un marco de 1,2 m: entre el marco y la pared de la sala
//     quedaba un hueco de suelo a techo;
//   · el relleno del fondo del anfiteatro era una caja recta detrás de gradas
//     curvas: en los lados quedaba un agujero de casi metro y medio;
//   · debajo del anfiteatro no había techo: desde el fondo del patio se veía
//     el envés escalonado de las gradas, a oscuras.
// Todo sigue saliendo del JSON: no hay ningún GLB.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { disposicion, centroCurva, radioFila, semiancho } from "./disposicion.js";

// ════════════════════════ texturas pintadas al arrancar ═══════════════════════
// Ninguna imagen incrustada: cada textura se pinta en un canvas en el navegador.

function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lienzo(an, al, pintar, color = true) {
  const c = document.createElement("canvas");
  c.width = an; c.height = al;
  pintar(c.getContext("2d"), an, al);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

// Tablas de escenario: roble oscuro, juntas a tope al azar, vetas finas.
function texturaTablas() {
  const r = azar(11);
  const t = lienzo(1024, 1024, (g, an, al) => {
    const filas = 16, h = al / filas;
    for (let f = 0; f < filas; f++) {
      let x = r() * an, hecho = 0;
      while (hecho < an) {
        const largo = 260 + r() * 460;
        const k = 0.8 + r() * 0.34;
        const tono = `rgb(${Math.round(84 * k)},${Math.round(58 * k)},${Math.round(38 * k)})`;
        const vetas = Array.from({ length: 7 }, (_, v) => [v % 2, r() * h, 1 + r() * 2]);
        // la tabla que se sale por la derecha entra por la izquierda: así la
        // textura casa consigo misma y no aparece una junta cada 1,9 m
        for (const dx of [0, -an]) {
          g.fillStyle = tono;
          g.fillRect(x + dx, f * h, largo, h);
          g.globalAlpha = 0.09;
          for (const [osc, y, grueso] of vetas) {
            g.fillStyle = osc ? "#2b1a0d" : "#d2a273";
            g.fillRect(x + dx, f * h + y, largo, grueso);
          }
          g.globalAlpha = 1;
          g.fillStyle = "rgba(20,10,5,0.9)";
          g.fillRect(x + dx, f * h, 2, h);
        }
        x = (x + largo) % an;
        hecho += largo;
      }
      g.fillStyle = "rgba(20,10,5,0.95)";
      g.fillRect(0, f * h, an, 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Damasco: medallón de dos tonos de granate sobre trama fina.
// Tapicería de pared: terciopelo granate LISO. El damasco de antes (Antonio,
// 17-nov) tenía el estampado demasiado presente. Aquí sólo hay lo que tiene una
// tela de verdad vista a unos metros: una trama vertical finísima y manchas muy
// suaves donde el pelo se peina distinto. El brillo lo pone el `sheen`.
function texturaDamasco() {
  const r = azar(23);
  const t = lienzo(512, 512, (g, an, al) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, an, al);
    // manchas de pelo peinado, muy suaves y repetibles en mosaico
    // Antonio (17-nov): con 70 manchas al 5 % la pared quedaba moteada. Ahora
    // son pocas, grandes y al 1,5 %: se intuye la tela, no se ven lunares.
    for (let k = 0; k < 18; k++) {
      const x = r() * an, y = r() * al, rad = 140 + r() * 160;
      const claro = r() < 0.5;
      for (const [dx, dy] of [[0, 0], [an, 0], [-an, 0], [0, al], [0, -al], [an, al], [-an, -al], [an, -al], [-an, al]]) {
        const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
        gr.addColorStop(0, claro ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)");
        gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr;
        g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
      }
    }
    // trama: hilos verticales, apenas visibles
    for (let x = 0; x < an; x += 2) {
      g.fillStyle = `rgba(0,0,0,${0.012 + r() * 0.016})`;
      g.fillRect(x, 0, 1, al);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Letras de fila: la placa que lleva el pie de la butaca del pasillo.
const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function texturaLetras() {
  return lienzo(1024, 512, (g) => {
    for (let k = 0; k < LETRAS.length; k++) {
      const cx = (k % 8) * 128, cy = Math.floor(k / 8) * 128;
      g.fillStyle = "#2a160c";
      g.fillRect(cx, cy, 128, 128);
      g.strokeStyle = "#c9a14e";
      g.lineWidth = 6;
      g.strokeRect(cx + 9, cy + 9, 110, 110);
      g.fillStyle = "#e4bf64";
      g.font = "bold 80px Georgia, 'Times New Roman', serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(LETRAS[k], cx + 64, cy + 70);
    }
  });
}

// El escudo de la embocadura: la M de Mirabel.
function texturaMonograma(inicial) {
  return lienzo(512, 320, (g, an, al) => {
    const fondo = g.createRadialGradient(an / 2, al / 2, 20, an / 2, al / 2, an / 2);
    fondo.addColorStop(0, "#7d1824");
    fondo.addColorStop(1, "#3a0910");
    g.fillStyle = fondo;
    g.fillRect(0, 0, an, al);
    g.strokeStyle = "#d9b25d";
    g.lineWidth = 5;
    g.beginPath();
    g.ellipse(an / 2, al / 2, an / 2 - 30, al / 2 - 26, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#e8c36c";
    g.font = "italic bold 196px Georgia, 'Times New Roman', serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(inicial, an / 2, al / 2 + 12);
  });
}

// Números de butaca, 1 a 32, para la placa de latón del respaldo.
function texturaNumeros() {
  return lienzo(1024, 256, (g) => {
    for (let k = 0; k < 32; k++) {
      const cx = (k % 8) * 128, cy = Math.floor(k / 8) * 64;
      g.fillStyle = "#c9a04a";
      g.fillRect(cx, cy, 128, 64);
      g.strokeStyle = "#7a5a1e";
      g.lineWidth = 3;
      g.strokeRect(cx + 5, cy + 5, 118, 54);
      g.fillStyle = "#2a1808";
      g.font = "bold 44px Georgia, 'Times New Roman', serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(k + 1), cx + 64, cy + 35);
    }
  });
}

// La alfombra del piano: granate con cenefa dorada y un medallón, la de
// cualquier recital.
function texturaAlfombraEscena() {
  return lienzo(512, 384, (g, an, al) => {
    g.fillStyle = "#4a0d16";
    g.fillRect(0, 0, an, al);
    g.strokeStyle = "#b8893e";
    g.lineWidth = 10;
    g.strokeRect(18, 18, an - 36, al - 36);
    g.lineWidth = 3;
    g.strokeRect(40, 40, an - 80, al - 80);
    g.fillStyle = "#6a1420";
    g.fillRect(43, 43, an - 86, al - 86);
    g.strokeStyle = "#b8893e";
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(an / 2, al / 2, 120, 80, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#3a0a12";
    g.beginPath();
    g.ellipse(an / 2, al / 2, 100, 62, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.08;
    for (let y = 0; y < al; y += 2) { g.fillStyle = y % 4 ? "#000" : "#fff"; g.fillRect(0, y, an, 1); }
  });
}

function texturaSalida() {
  return lienzo(256, 96, (g, an, al) => {
    g.fillStyle = "#12a24c";
    g.fillRect(0, 0, an, al);
    g.fillStyle = "#ecfff2";
    g.font = "bold 50px Arial, Helvetica, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("SALIDA", an / 2, al / 2 + 3);
  });
}

// Sombra de contacto bajo cada butaca: degradado radial, se usa como alphaMap.
function texturaSombra() {
  return lienzo(128, 128, (g, an, al) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, an, al);
    const d = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    d.addColorStop(0, "rgba(255,255,255,1)");
    d.addColorStop(0.55, "rgba(255,255,255,0.55)");
    d.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = d;
    g.fillRect(0, 0, an, al);
  }, false);
}

// Teclado: 52 blancas desde el La; negras en la parte de atrás de la tecla.
function texturaTeclas() {
  return lienzo(1024, 128, (g, an, al) => {
    g.fillStyle = "#f3eee0";
    g.fillRect(0, 0, an, al);
    const n = 52, w = an / n;
    g.fillStyle = "#9b958a";
    for (let i = 1; i < n; i++) g.fillRect(i * w - 1, 0, 2, al);
    g.fillStyle = "#111";
    for (let i = 0; i < n - 1; i++) {
      const nota = (i + 5) % 7;            // 0=Do … 5=La 6=Si
      if ([0, 1, 3, 4, 5].includes(nota)) g.fillRect((i + 1) * w - w * 0.3, 0, w * 0.6, al * 0.62);
    }
  });
}

function texturas(datos) {
  return {
    tablas: texturaTablas(),
    damasco: texturaDamasco(),
    letras: texturaLetras(),
    monograma: texturaMonograma((datos.nombre || "M").replace(/^Teatro\s+/i, "").charAt(0) || "M"),
    salida: texturaSalida(),
    alfombraEscena: texturaAlfombraEscena(),
    numeros: texturaNumeros(),
    sombra: texturaSombra(),
    teclas: texturaTeclas(),
  };
}

// ════════════════════════ materiales ═══════════════════════
export const ROJO_TERCIOPELO = 0x74101c;

// El terciopelo lleva `sheen`: es lo que hace que un tejido de pelo corto
// brille en los bordes y se oscurezca de frente. El marfil es «marfil viejo»:
// con la lámpara encendida un marfil claro se quema y se come el rojo.
function materiales(T) {
  const fis = (o) => new THREE.MeshPhysicalMaterial(o);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // La placa de cada butaca enseña SU número: una sola textura con los 32
  // números y, por instancia, a qué casilla mira.
  const placa = std({ map: T.numeros, roughness: 0.38, metalness: 0.75 });
  placa.onBeforeCompile = (sh) => {
    sh.vertexShader = "attribute vec2 desfaseUV;\n" + sh.vertexShader.replace(
      "#include <uv_vertex>",
      "#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = vMapUv * vec2(0.125, 0.25) + desfaseUV;\n#endif",
    );
  };
  return {
    placa,
    terciopelo: fis({
      color: ROJO_TERCIOPELO, roughness: 0.8,
      sheen: 1.0, sheenColor: new THREE.Color(0xc85a68), sheenRoughness: 0.4,
    }),
    // El de las butacas va en BLANCO y el rojo lo pone el color de cada
    // instancia. Teñir multiplicando un granate no funciona: un granate casi
    // no tiene verde ni azul, y una butaca «verde» salía negra. Así el color
    // de cada butaca es el que se pide, tal cual.
    tapizado: fis({
      color: 0xffffff, roughness: 0.8,
      sheen: 1.0, sheenColor: new THREE.Color(0x7a6466), sheenRoughness: 0.4,
    }),
    terciopeloTelon: fis({
      color: 0x6a0d18, roughness: 0.85, side: THREE.DoubleSide,
      sheen: 1.0, sheenColor: new THREE.Color(0xc0505e), sheenRoughness: 0.45,
    }),
    madera: fis({ color: 0x3f2314, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.35 }),
    cristal: std({ color: 0xffffff, roughness: 0.05, metalness: 0.3, emissive: 0xffe2b0, emissiveIntensity: 0.25 }),
    hierro: std({ color: 0x1d1713, roughness: 0.45, metalness: 0.7 }),
    oro: std({ color: 0xd4ab5c, roughness: 0.36, metalness: 1.0 }),
    marfil: std({ color: 0xa88f68, roughness: 0.78 }),
    marfilTecho: std({ color: 0x7d6a4c, roughness: 0.9 }),
    pintura: std({ color: 0x1b2a3f, roughness: 0.9 }),
    moqueta: std({ color: 0x2e0b10, roughness: 0.97 }),
    alfombra: std({ color: 0x6c111b, roughness: 0.95 }),
    tablas: std({ map: T.tablas, roughness: 0.62 }),
    // el nombre se queda (lo usan paredes, palcos y anfiteatro), pero ya es terciopelo
    damasco: fis({
      map: T.damasco, color: 0x5e0f19, roughness: 0.9,
      sheen: 0.8, sheenColor: new THREE.Color(0x86303c), sheenRoughness: 0.75,
    }),
    negro: std({ color: 0x0b0a0a, roughness: 1.0 }),
    fondoFoso: std({ color: 0x0e0c0b, roughness: 1.0 }),
    ciclorama: new THREE.MeshBasicMaterial({ vertexColors: true }),
    terciopeloNegro: fis({
      color: 0x0c0a0b, roughness: 0.92, side: THREE.DoubleSide,
      sheen: 1.0, sheenColor: new THREE.Color(0x4a4046), sheenRoughness: 0.5,
    }),
    alfombraEscena: std({ map: T.alfombraEscena, roughness: 0.95 }),
    florBlanca: fis({ color: 0xf1ead9, roughness: 0.6, sheen: 0.6, sheenColor: new THREE.Color(0xffffff) }),
    florRoja: fis({ color: 0x8e1424, roughness: 0.6, sheen: 0.6, sheenColor: new THREE.Color(0xff8090) }),
    hoja: std({ color: 0x1d3a1f, roughness: 0.55 }),
    bombilla: std({ color: 0xffe6b8, emissive: 0xffc777, emissiveIntensity: 6, roughness: 0.3 }),
    pantalla: std({
      color: 0xf2dcb0, emissive: 0xffb25a, emissiveIntensity: 4, roughness: 0.8, side: THREE.DoubleSide,
    }),
    foco: std({ color: 0xfff4e0, emissive: 0xfff0d8, emissiveIntensity: 3 }),
    atril: std({ color: 0xfff1d0, emissive: 0xffd9a0, emissiveIntensity: 2 }),
    piano: fis({ color: 0x060606, roughness: 0.22, clearcoat: 1.0, clearcoatRoughness: 0.06 }),
    teclas: std({ map: T.teclas, roughness: 0.35 }),
    salida: new THREE.MeshBasicMaterial({ map: T.salida }),
    letras: std({ map: T.letras, roughness: 0.5, metalness: 0.2 }),
    monograma: std({ map: T.monograma, roughness: 0.4, metalness: 0.4 }),
    sombra: new THREE.MeshBasicMaterial({
      color: 0x000000, alphaMap: T.sombra, transparent: true, opacity: 0.72,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    }),
  };
}

// ════════════════════════ utilidades de geometría ═══════════════════════

function malla(geo, mat, sombra = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = sombra;
  m.receiveShadow = true;
  return m;
}

function caja(an, al, pr, mat, x, y, z, giro = 0) {
  const m = malla(new THREE.BoxGeometry(an, al, pr), mat);
  m.position.set(x, y, z);
  if (giro) m.rotation.y = giro;
  return m;
}

/** Caja con la posición metida en la geometría, para juntarla con otras. */
function cajaG(an, al, pr, x, y, z, giro = 0) {
  const g = new THREE.BoxGeometry(an, al, pr);
  if (giro) g.rotateY(giro);
  return g.translate(x, y, z);
}

function esferaG(r, x, y, z, seg = 12) {
  return new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0)).translate(x, y, z);
}

/**
 * UV en metros, proyectadas según hacia dónde mira cada cara. Las superficies
 * con textura que se repite (el damasco) casan así de una pieza a otra, sea
 * cual sea su tamaño.
 */
function uvMundo(g, escala) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else if (az >= ay) { u = p.getX(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getZ(i); }
    uv[i * 2] = u / escala;
    uv[i * 2 + 1] = v / escala;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * Sector de corona circular extruido en vertical: una grada curva, un frente
 * de anfiteatro, una franja de moldura. El arco es concéntrico a (0, zc).
 *
 * El dibujo se hace en el plano (u, v) con v = −z, y se extruye; al girar
 * −90° sobre X, (u, v, w) pasa a (u, w, −v) = (x, altura, z).
 */
function sectorAnular(zc, rIn, rOut, phi1, phi2, alto, segs = 48) {
  const forma = new THREE.Shape();
  const p = (r, f) => [r * Math.sin(f), -(zc + r * Math.cos(f))];
  forma.moveTo(...p(rOut, phi1));
  for (let i = 1; i <= segs; i++) forma.lineTo(...p(rOut, phi1 + (phi2 - phi1) * (i / segs)));
  for (let i = segs; i >= 0; i--) forma.lineTo(...p(rIn, phi1 + (phi2 - phi1) * (i / segs)));
  const g = new THREE.ExtrudeGeometry(forma, { depth: alto, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Un polígono en planta [[x,z],...] extruido de yBase hacia arriba. */
function losaG(poligono, yBase, alto) {
  const forma = new THREE.Shape();
  forma.moveTo(poligono[0][0], -poligono[0][1]);
  for (const [x, z] of poligono.slice(1)) forma.lineTo(x, -z);
  const g = new THREE.ExtrudeGeometry(forma, { depth: alto, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, yBase, 0);
  return g;
}

/** Un arco como curva 3D, para pasarle un tubo: barandillas y molduras. */
function arco(zc, r, phi1, phi2, y, segs = 48) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const f = phi1 + (phi2 - phi1) * (i / segs);
    pts.push(new THREE.Vector3(r * Math.sin(f), y, zc + r * Math.cos(f)));
  }
  return new THREE.CatmullRomCurve3(pts);
}

/** Puntos de un arco en planta, [[x,z],...]. */
function puntosArco(zc, r, phi1, phi2, segs) {
  return Array.from({ length: segs + 1 }, (_, i) => {
    const f = phi1 + (phi2 - phi1) * (i / segs);
    return [r * Math.sin(f), zc + r * Math.cos(f)];
  });
}

// Recorte de un polígono contra un semiplano (Sutherland–Hodgman). Sirve para
// que una grada curva acabe EXACTAMENTE en la pared y no antes ni dentro.
function recortar(pol, dentro, corte) {
  const out = [];
  for (let i = 0; i < pol.length; i++) {
    const a = pol[i], b = pol[(i + 1) % pol.length];
    const ia = dentro(a), ib = dentro(b);
    if (ia) out.push(a);
    if (ia !== ib) out.push(corte(a, b));
  }
  return out;
}
function recortarSala(pol, W, zMin = -Infinity) {
  const enX = (lim, s) => [
    (p) => s * p[0] <= lim,
    (a, b) => { const t = (s * lim - a[0]) / (b[0] - a[0]); return [s * lim, a[1] + t * (b[1] - a[1])]; },
  ];
  let r = recortar(pol, ...enX(W, 1));
  r = recortar(r, ...enX(W, -1));
  if (isFinite(zMin)) {
    r = recortar(r, (p) => p[1] >= zMin, (a, b) => {
      const t = (zMin - a[1]) / (b[1] - a[1]);
      return [a[0] + t * (b[0] - a[0]), zMin];
    });
  }
  return r;
}

/** Da la vuelta a los triángulos si la cara no mira hacia donde debe (±Y). */
function orientar(g, signo) {
  const p = g.attributes.position, ix = g.index.array;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  let suma = 0;
  for (let t = 0; t < ix.length; t += 3) {
    A.fromBufferAttribute(p, ix[t]);
    B.fromBufferAttribute(p, ix[t + 1]).sub(A);
    C.fromBufferAttribute(p, ix[t + 2]).sub(A);
    suma += B.cross(C).y;
  }
  if (Math.sign(suma) !== signo) {
    for (let t = 0; t < ix.length; t += 3) { const k = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = k; }
    g.index.needsUpdate = true;
  }
  return g;
}

/** Superficie sobre una rejilla (φ, d) alrededor de (0, zc), con y = altura(d). */
function rejillaPolar(zc, fis, dMin, dMax, altura, pasosD) {
  const pos = [], idx = [];
  for (const f of fis) {
    const a = dMin(f), b = Math.max(a, dMax(f));
    for (let j = 0; j <= pasosD; j++) {
      const d = a + ((b - a) * j) / pasosD;
      pos.push(d * Math.sin(f), altura(d), zc + d * Math.cos(f));
    }
  }
  for (let i = 0; i < fis.length - 1; i++) {
    for (let j = 0; j < pasosD; j++) {
      const a = i * (pasosD + 1) + j, b = a + 1, c = a + pasosD + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// Todo lo que es arquitectura fija se junta en UNA malla por material: con
// cada moldura por separado la sala pasaba de los 300 dibujados por fotograma,
// y un móvil no los aguanta.
function normalizar(g, conUV) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) {
    if (k !== "position" && k !== "normal" && !(conUV && k === "uv")) n.deleteAttribute(k);
  }
  if (!n.attributes.normal) n.computeVertexNormals();
  n.morphAttributes = {};
  return n;
}
function cubos() {
  const m = new Map();
  return {
    add(mat, geo) {
      if (!geo) return;
      if (!m.has(mat)) m.set(mat, []);
      m.get(mat).push(geo);
    },
    volcar(grupo, { sombra = true, nombre = "", lista = null } = {}) {
      for (const [mat, geos] of m) {
        const conUV = !!(mat.map || mat.alphaMap);
        const g = mergeGeometries(geos.map((x) => normalizar(x, conUV)));
        const me = malla(g, mat, sombra);
        me.name = nombre;
        grupo.add(me);
        if (lista) lista.push(me);
      }
    },
  };
}

// ════════════════════════ la butaca ═══════════════════════
// Una butaca de teatro de verdad: asiento y respaldo tapizados —el respaldo
// también por detrás, que es lo que ve el de la fila de atrás—, un remate de
// madera arriba con su plaquita de latón, y entre butaca y butaca un pie de
// fundición calado con su reposabrazos. El pie es COMPARTIDO entre vecinas: si
// cada una llevara el suyo quedarían cara con cara y parpadearían. En los
// extremos de cada bloque, un costado de madera con la letra de la fila.
//
// Marco local: la butaca mira a −Z, su derecha es +X, el suelo está en y = 0.
const INCL = 0.2;                         // respaldo reclinado ~11°
const PIVOTE = [0, 0.425, 0.165];         // donde el respaldo apoya en el asiento
const CONCAVO = 0.35;                      // el respaldo abraza un poco

/** Perfil lateral (z, y) extruido a lo ancho (x), centrado. */
// Cada butaca se repite ~480 veces: cada triángulo de más cuenta 480 veces.
// Por eso los pasos y segmentos son los justos para que la curva no se note.
function extruirPerfil(forma, ancho, bisel, segs, pasos, curvas = 5) {
  const g = new THREE.ExtrudeGeometry(forma, {
    depth: ancho - 2 * bisel, steps: pasos, curveSegments: curvas,
    bevelEnabled: bisel > 0, bevelThickness: bisel, bevelSize: bisel, bevelSegments: segs,
  });
  g.rotateY(-Math.PI / 2);                 // forma.x → z, forma.y → y, extrusión → −x
  g.translate((ancho - 2 * bisel) / 2, 0, 0);
  return g;
}

// Normales suaves: la extrusión sale facetada y un cojín facetado es de cartón.
function suavizar(g) {
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  const m = mergeVertices(g, 1e-4);
  m.computeVertexNormals();
  return m;
}

function curvar(g) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setZ(i, p.getZ(i) - CONCAVO * x * x);
  }
  g.computeVertexNormals();
  return g;
}

function aRespaldo(g) {
  g.rotateX(INCL);
  g.translate(...PIVOTE);
  return g;
}

// Dos niveles de detalle. «bajo» es para móviles: las mismas piezas con la
// mitad de triángulos (menos segmentos en cantos y curvas, pie sin calar,
// brazo sin redondear). A la distancia a la que un móvil enseña la sala no se
// distingue, y la butaca se repite ~480 veces.
let BAJO = false;
const seg = (alto, bajo) => (BAJO ? bajo : alto);

function geoAsiento() {
  const f = new THREE.Shape();
  f.moveTo(0.158, 0.352);
  f.lineTo(-0.2, 0.36);
  f.quadraticCurveTo(-0.253, 0.362, -0.253, 0.41);     // canto delantero en cascada
  f.quadraticCurveTo(-0.252, 0.452, -0.205, 0.456);
  f.quadraticCurveTo(-0.03, 0.47, 0.13, 0.452);         // abombado
  f.quadraticCurveTo(0.158, 0.45, 0.158, 0.425);
  f.lineTo(0.158, 0.352);
  return suavizar(extruirPerfil(f, 0.45, 0.012, seg(2, 1), 1, seg(5, 3)));
}

function geoRespaldo() {
  const f = new THREE.Shape();
  f.moveTo(0.0, 0.0);
  f.quadraticCurveTo(-0.045, 0.15, -0.012, 0.34);      // apoyo lumbar
  f.lineTo(-0.002, 0.53);
  f.quadraticCurveTo(0.0, 0.575, 0.04, 0.576);
  f.quadraticCurveTo(0.075, 0.575, 0.076, 0.53);
  f.lineTo(0.088, 0.03);
  f.quadraticCurveTo(0.088, 0.0, 0.06, 0.0);
  f.lineTo(0.0, 0.0);
  return aRespaldo(curvar(suavizar(extruirPerfil(f, 0.45, 0.012, seg(2, 1), seg(4, 2), seg(5, 3)))));
}

function geoRemate() {
  const f = new THREE.Shape();
  f.moveTo(-0.004, 0.556);
  f.lineTo(0.09, 0.556);
  f.quadraticCurveTo(0.104, 0.556, 0.104, 0.572);
  f.lineTo(0.104, 0.588);
  f.quadraticCurveTo(0.104, 0.604, 0.088, 0.604);
  f.lineTo(0.008, 0.604);
  f.quadraticCurveTo(-0.018, 0.604, -0.018, 0.58);
  f.quadraticCurveTo(-0.018, 0.556, -0.004, 0.556);
  return aRespaldo(curvar(suavizar(extruirPerfil(f, 0.47, 0.008, 1, seg(4, 2), seg(3, 2)))));
}

function geoPlaca() {
  return aRespaldo(new THREE.BoxGeometry(0.084, 0.042, 0.005).translate(0, 0.485, 0.0915));
}

// Pie de fundición: patas delante y detrás, arco entre ellas y un óvalo calado.
function geoPie() {
  const f = new THREE.Shape();
  // Las patas bajan 3 cm por debajo del suelo de la fila: en la rampa del
  // patio la de delante quedaba 2 cm en el aire.
  f.moveTo(-0.235, -0.03);
  f.lineTo(-0.16, -0.03);
  f.quadraticCurveTo(0.0, 0.13, 0.17, -0.03);
  f.lineTo(0.245, -0.03);
  f.quadraticCurveTo(0.215, 0.32, 0.215, 0.6);
  f.lineTo(-0.215, 0.6);
  f.quadraticCurveTo(-0.17, 0.3, -0.235, -0.03);
  if (BAJO) return extruirPerfil(f, 0.03, 0, 0, 1, 2);
  const hueco = new THREE.Path();
  hueco.absellipse(0.0, 0.37, 0.1, 0.15, 0, Math.PI * 2, false);
  f.holes.push(hueco);
  return extruirPerfil(f, 0.03, 0.004, 1, 1);
}

function geoBrazo() {
  if (BAJO) return new THREE.BoxGeometry(0.058, 0.036, 0.46).translate(0, 0.622, -0.015);
  return new RoundedBoxGeometry(0.058, 0.036, 0.46, 1, 0.014).translate(0, 0.622, -0.015);
}

function geoExtremo() {
  const f = new THREE.Shape();
  f.moveTo(-0.24, -0.03);
  f.lineTo(0.26, -0.03);
  f.lineTo(0.26, 0.6);
  f.quadraticCurveTo(0.26, 0.652, 0.21, 0.652);
  f.lineTo(-0.2, 0.652);
  f.quadraticCurveTo(-0.262, 0.652, -0.262, 0.6);
  f.quadraticCurveTo(-0.215, 0.32, -0.24, -0.03);
  return suavizar(extruirPerfil(f, 0.05, 0.008, seg(2, 1), 1, seg(5, 3)));
}

/** Placa con la letra de la fila, en la cara de fuera de un costado. */
function placaLetra(s, matriz) {
  const k = LETRAS.indexOf(s.fila);
  if (k < 0) return null;
  const g = new THREE.PlaneGeometry(0.08, 0.08);
  const uv = g.attributes.uv;
  const u0 = (k % 8) / 8, v0 = 1 - (Math.floor(k / 8) + 1) / 4;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / 8, v0 + uv.getY(i) / 4);
  g.rotateY((s.lado * Math.PI) / 2);
  g.translate(s.lado * 0.027, 0.47, 0.03);
  g.applyMatrix4(matriz);
  return g;
}

function construirButacas(grupo, M, porSeccion, seccion) {
  const G = {
    tapizado: mergeGeometries([geoAsiento(), geoRespaldo()]),
    remate: geoRemate(),
    placa: geoPlaca(),
    pie: geoPie(),
    brazo: geoBrazo(),
    extremo: geoExtremo(),
    sombra: new THREE.PlaneGeometry(0.64, 0.8).rotateX(-Math.PI / 2).translate(0, 0, 0.03),
  };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  const _e = new THREE.Euler(0, 0, 0, "YXZ");
  const componer = (x, y, z, giro, incl = 0) => {
    _e.set(incl, giro, 0, "YXZ");
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    return _m.compose(_p, _q, _s);
  };
  const crear = (geo, mat, n, nombre, sombra = true) => {
    const im = new THREE.InstancedMesh(geo, mat, n);
    im.name = nombre;
    im.castShadow = sombra;
    im.receiveShadow = true;
    return im;
  };

  const total = [...porSeccion.values()].reduce((t, l) => t + l.length, 0);
  const sombras = crear(G.sombra, M.sombra, total, "SOMBRAS_BUTACAS", false);
  sombras.receiveShadow = false;
  let iSombra = 0;
  const placas = [];
  const instancias = [];

  for (const [secId, lista] of porSeccion) {
    const sec = seccion(secId);
    const paso = sec.pasoButaca;
    // la sombra se tumba con la rampa del patio; en gradas y palcos el suelo es llano
    const incl = sec.tipo === "patio" ? -Math.atan2(sec.rake || 0, sec.pasoFila) : 0;

    const tapizado = crear(G.tapizado, M.tapizado, lista.length, `BUTACAS_${secId}`);
    const remate = crear(G.remate, M.madera, lista.length, `REMATES_${secId}`);
    const gPlaca = G.placa.clone();
    const desfase = new Float32Array(lista.length * 2);
    lista.forEach((b, i) => {
      const k = (b.numero - 1) % 32;
      desfase[i * 2] = (k % 8) / 8;
      desfase[i * 2 + 1] = 1 - (Math.floor(k / 8) + 1) / 4;
    });
    gPlaca.setAttribute("desfaseUV", new THREE.InstancedBufferAttribute(desfase, 2));
    const placa = crear(gPlaca, M.placa, lista.length, `PLACAS_${secId}`, false);
    const rojo = new THREE.Color(ROJO_TERCIOPELO);
    lista.forEach((b, i) => {
      componer(b.x, b.y, b.z, b.giro);
      tapizado.setMatrixAt(i, _m);
      tapizado.setColorAt(i, rojo);
      remate.setMatrixAt(i, _m);
      placa.setMatrixAt(i, _m);
      b.indice = i;
      b.malla = secId;
      componer(b.x, b.y + 0.008, b.z, b.giro, incl);
      sombras.setMatrixAt(iSombra++, _m);
    });

    // Separadores: entre cada dos butacas vecinas, y un costado en cada
    // extremo de bloque. «Vecinas» = misma fila, números seguidos y a un paso;
    // si las separa un pasillo o una butaca suprimida, son extremos.
    const sep = [];
    const porFila = new Map();
    for (const b of lista) {
      if (!porFila.has(b.fila)) porFila.set(b.fila, []);
      porFila.get(b.fila).push(b);
    }
    // el +X local de una butaca girada g es (cos g, −sen g)
    const borde = (b, lado) => ({
      x: b.x + lado * Math.cos(b.giro) * paso / 2,
      z: b.z - lado * Math.sin(b.giro) * paso / 2,
      y: b.y, giro: b.giro, extremo: true, lado, fila: b.fila,
    });
    for (const fila of porFila.values()) {
      fila.sort((a, c) => a.numero - c.numero);
      fila.forEach((b, i) => {
        const prev = fila[i - 1], sig = fila[i + 1];
        const juntoPrev = prev && prev.numero === b.numero - 1 &&
          Math.hypot(prev.x - b.x, prev.z - b.z) < paso * 1.3;
        const juntoSig = sig && sig.numero === b.numero + 1 &&
          Math.hypot(sig.x - b.x, sig.z - b.z) < paso * 1.3;
        if (juntoPrev) {
          sep.push({ x: (prev.x + b.x) / 2, z: (prev.z + b.z) / 2,
                     y: (prev.y + b.y) / 2, giro: (prev.giro + b.giro) / 2 });
        } else {
          sep.push(borde(b, -1));
        }
        if (!juntoSig) sep.push(borde(b, +1));
      });
    }
    const interiores = sep.filter((s) => !s.extremo);
    const extremos = sep.filter((s) => s.extremo);
    const mallas = [tapizado, remate, placa];
    if (interiores.length) {
      const pie = crear(G.pie, M.hierro, interiores.length, `PIES_${secId}`);
      const brazo = crear(G.brazo, M.madera, interiores.length, `BRAZOS_${secId}`);
      interiores.forEach((s, i) => {
        componer(s.x, s.y, s.z, s.giro);
        pie.setMatrixAt(i, _m);
        brazo.setMatrixAt(i, _m);
      });
      mallas.push(pie, brazo);
    }
    if (extremos.length) {
      const extremo = crear(G.extremo, M.madera, extremos.length, `COSTADOS_${secId}`);
      extremos.forEach((s, i) => {
        componer(s.x, s.y, s.z, s.giro);
        extremo.setMatrixAt(i, _m);
        placas.push(placaLetra(s, _m));
      });
      mallas.push(extremo);
    }
    for (const im of mallas) {
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      grupo.add(im);
    }
    instancias.push({ seccion: secId, tapizado, lista });
  }
  sombras.instanceMatrix.needsUpdate = true;
  sombras.computeBoundingSphere();
  grupo.add(sombras);
  const validas = placas.filter(Boolean);
  if (validas.length) {
    const letras = malla(mergeGeometries(validas), M.letras, false);
    letras.name = "LETRAS_FILA";
    grupo.add(letras);
  }
  return instancias;
}

// ════════════════════════ patio y foso ═══════════════════════
// El patio de un teatro no es una escalera: es una rampa suave. Y como las
// filas son concéntricas, la pendiente también lo es: la altura depende de la
// distancia al centro de curvatura, no de la Z. Por eso el suelo se teje sobre
// una rejilla polar —la rampa sale exacta— que acaba justo en las paredes.
function construirPatio(grupo, B, Bs, M, datos, L) {
  const patio = datos.secciones.find((s) => s.id === "patio");
  const zc = centroCurva(patio), R0 = patio.radio0;
  const alturaD = (d) => Math.max(0, ((d - R0) / patio.pasoFila) * patio.rake);
  const altura = (x, z) => alturaD(Math.hypot(x, z - zc));
  const { W, F } = L;
  const zLinea = -0.3;                     // el borde del suelo, metido bajo el escenario
  const P = (r, f) => [r * Math.sin(f), -(zc + r * Math.cos(f))];

  // 1. La media luna llana delante de la fila A, con el foso recortado.
  const fiL = Math.acos((zLinea - zc) / R0);
  const llano = new THREE.Shape();
  llano.moveTo(...P(R0, -fiL));
  for (let i = 1; i <= 96; i++) llano.lineTo(...P(R0, -fiL + (2 * fiL * i) / 96));

  const foso = datos.escenario.foso;
  let rP = 0, fiP = 0, pw = 0;
  const zHueco = -0.15;
  if (foso) {
    rP = foso.z - zc;
    pw = foso.semiancho;
    fiP = Math.asin(Math.min(1, pw / rP));
    const hueco = new THREE.Path();
    hueco.moveTo(-pw, -zHueco);
    for (let i = 0; i <= 64; i++) hueco.lineTo(...P(rP, -fiP + (2 * fiP * i) / 64));
    hueco.lineTo(pw, -zHueco);
    llano.holes.push(hueco);
  }
  const gl = new THREE.ShapeGeometry(llano);
  gl.rotateX(-Math.PI / 2);
  Bs.add(M.moqueta, gl);

  // 2. La rampa, de la fila A hasta la pared del fondo.
  const fiMax = Math.atan2(W, zLinea - zc);
  const angs = new Set();
  const N = 160;
  for (let i = 0; i <= N; i++) angs.add(-fiMax + (2 * fiMax * i) / N);
  for (const a of [Math.atan2(W, F - zc), Math.min(fiL, fiMax)]) { angs.add(a); angs.add(-a); }
  const fis = [...angs].sort((a, b) => a - b);
  const rampa = rejillaPolar(
    zc, fis,
    (f) => Math.max(R0, (zLinea - zc) / Math.cos(f)),
    (f) => Math.min((F - zc) / Math.cos(f), Math.abs(Math.sin(f)) > 1e-9 ? W / Math.abs(Math.sin(f)) : Infinity),
    alturaD, 14,
  );
  orientar(rampa, 1);
  rampa.computeVertexNormals();
  const mr = malla(rampa, M.moqueta, false);
  mr.name = "SUELO_PATIO";
  grupo.add(mr);

  // 3. Alfombras: los pasillos, siguiendo la rampa, y el pasillo de cruce
  //    entre el foso y la fila A.
  const rCruce = foso ? rP + 0.15 : R0 - 1.0;
  for (const xp of patio.pasillosX || []) {
    const ancho = patio.anchoPasillo - 0.3;
    const z0 = zc + Math.sqrt(Math.max(0, (rCruce + 0.25) ** 2 - xp * xp));
    const largo = F - 0.05 - z0;
    const ga = new THREE.PlaneGeometry(ancho, largo, 3, 80);
    ga.rotateX(-Math.PI / 2);
    ga.translate(xp, 0, z0 + largo / 2);
    const pa = ga.attributes.position;
    for (let i = 0; i < pa.count; i++) pa.setY(i, altura(pa.getX(i), pa.getZ(i)) + 0.006);
    ga.computeVertexNormals();
    Bs.add(M.alfombra, ga);
  }
  const fiC = Math.asin(Math.min(0.95, (patio.semiancho0 + 0.3) / (rCruce + 0.5)));
  Bs.add(M.alfombra, sectorAnular(zc, rCruce + 0.15, rCruce + 0.7, -fiC, fiC, 0.012, 64));

  // 4. El foso de la orquesta.
  if (foso) {
    const { hondo, alto } = foso;
    const fondo = new THREE.Shape();
    fondo.moveTo(-pw, -zHueco);
    for (let i = 0; i <= 64; i++) fondo.lineTo(...P(rP, -fiP + (2 * fiP * i) / 64));
    fondo.lineTo(pw, -zHueco);
    const gf = new THREE.ShapeGeometry(fondo);
    gf.rotateX(-Math.PI / 2);
    gf.translate(0, -hondo, 0);
    Bs.add(M.fondoFoso, gf);
    // antepecho curvo de madera, cojín de terciopelo y junquillo de oro
    B.add(M.madera, sectorAnular(zc, rP, rP + 0.15, -fiP, fiP, alto + hondo, 72).translate(0, -hondo, 0));
    B.add(M.terciopelo, sectorAnular(zc, rP - 0.025, rP + 0.175, -fiP, fiP, 0.06, 72).translate(0, alto, 0));
    B.add(M.oro, new THREE.TubeGeometry(arco(zc, rP + 0.158, -fiP, fiP, alto - 0.07, 72), 96, 0.016, 6, false));
    B.add(M.oro, new THREE.TubeGeometry(arco(zc, rP + 0.158, -fiP, fiP, 0.06, 72), 96, 0.02, 6, false));
    // vueltas del antepecho hasta el escenario
    const zFin = zc + rP * Math.cos(fiP);
    for (const s of [-1, 1]) {
      const largo = zFin + 0.02 - 0.12;
      B.add(M.madera, cajaG(0.15, alto + hondo, largo, s * (pw + 0.075), (alto - hondo) / 2, 0.12 + largo / 2));
      B.add(M.terciopelo, cajaG(0.2, 0.06, largo + 0.02, s * (pw + 0.075), alto + 0.03, 0.12 + largo / 2));
    }
    construirOrquesta(B, M, zc, rP, pw, hondo);
  }
  return { altura, zc, rCruce };
}

// Atriles con su lucecita y sillas: el foso no es un agujero negro, es donde
// está la orquesta. Desde los palcos y el anfiteatro se ve.
function construirOrquesta(B, M, zc, rP, pw, hondo) {
  const yS = -hondo;
  const director = [0, zc + rP - 0.55];
  const puestos = [];
  for (const [dd, n] of [[0.95, 7], [1.95, 6]]) {
    const r = rP - dd;
    const fiLim = Math.asin(Math.min(1, (pw - 0.6) / r));
    for (let k = 0; k < n; k++) {
      const f = -fiLim + (2 * fiLim * k) / (n - 1);
      const x = r * Math.sin(f), z = zc + r * Math.cos(f);
      if (z < 0.12 + 0.7 || Math.abs(x) > pw - 0.45) continue;
      puestos.push([x, z]);
    }
  }
  for (const [x, z] of puestos) {
    const giro = Math.atan2(-(director[0] - x), -(director[1] - z));
    const colocar = (g) => g.rotateY(giro).translate(x, yS, z);
    B.add(M.negro, colocar(new THREE.BoxGeometry(0.42, 0.04, 0.4).translate(0, 0.46, 0.05)));
    B.add(M.negro, colocar(new THREE.BoxGeometry(0.42, 0.4, 0.03).translate(0, 0.68, 0.25)));
    for (const [lx, lz] of [[-0.18, -0.12], [0.18, -0.12], [-0.18, 0.22], [0.18, 0.22]]) {
      B.add(M.negro, colocar(new THREE.BoxGeometry(0.025, 0.44, 0.025).translate(lx, 0.22, lz)));
    }
    B.add(M.hierro, colocar(new THREE.CylinderGeometry(0.011, 0.011, 1.0, 6).translate(0, 0.5, -0.5)));
    B.add(M.hierro, colocar(new THREE.BoxGeometry(0.5, 0.34, 0.012).rotateX(-0.5).translate(0, 1.06, -0.5)));
    B.add(M.atril, colocar(new THREE.BoxGeometry(0.22, 0.02, 0.03).translate(0, 1.25, -0.44)));
  }
  // el podio del director, pegado al antepecho
  B.add(M.negro, cajaG(0.8, 0.25, 0.7, director[0], yS + 0.125, director[1]));
}

// ════════════════════════ palcos ═══════════════════════
// Un palco no es un mueble: es una caja abierta en la pared, con el frente
// paralelo a ella —faldón, antepecho con su cojín, bambalina— y los tabiques
// perpendiculares hasta el muro. Dentro, las butacas en filas paralelas a la
// pared, cada una girada hacia la escena (eso lo decide `disposicion.js`).
//
// Historia, para no repetirla: la primera versión giraba la fila entera 38° y
// la metía en una caja girada; la segunda dejó los tabiques perpendiculares a
// la pared pero con la fila girada, y la fila B se salía de la caja por el
// tabique: sus butacas miraban a una pared. La comprobación de visibilidad lo
// destapó (100 % de escena tapada en cuatro butacas por palco).
//
// El faldón es sólo el canto del forjado (36 cm): uno más alto dejaba al palco
// de abajo mirando por una rendija.
function construirPalcos(B, M, datos, porSeccion, L) {
  let zLim = -Infinity;
  const cajas = [];
  const ALTO_CAJA = 2.3;
  for (const sec of datos.secciones) {
    if (sec.tipo !== "palco") continue;
    const lista = porSeccion.get(sec.id) || [];
    if (!lista.length) continue;
    const lado = Math.sign(sec.centroX);
    const xMuro = lado * L.W;
    // 53 cm del eje de la fila A al antepecho (más fondo tapa la escena al palco alto): con 45 las rodillas de una
    // butaca girada hacia la escena no cabían.
    const xFrente = sec.centroX - lado * 0.53;              // el antepecho, hacia la sala
    // La caja se alarga 40 cm hacia la escena: el tabique de ese lado es el
    // que tapa la vista a las butacas de atrás.
    const medio = (sec.butacas0 * sec.pasoButaca) / 2 + 0.25;
    const zA = sec.z0 - medio - 0.4, zB = sec.z0 + medio, largo = zB - zA, zM = (zA + zB) / 2;
    const planta = [[xFrente, zA], [xFrente, zB], [xMuro, zB], [xMuro, zA]];
    zLim = Math.max(zLim, zB + 0.05);
    const y = sec.y0;
    cajas.push({ lado, zA, zB, yMin: y - 0.4, yMax: y + ALTO_CAJA + 0.15, xFrente });

    B.add(M.marfil, losaG(planta, y - 0.34, 0.32));            // forjado
    B.add(M.moqueta, losaG(planta, y - 0.02, 0.02));           // moqueta
    B.add(M.marfil, losaG(planta, y + ALTO_CAJA, 0.14));       // techo
    // Tarima: cada fila de atrás un escalón más alta. Sin ella la fila B
    // miraba de frente al respaldo de la A y no veía la escena.
    for (let f = 1; f < sec.filas && sec.rake; f++) {
      const xEsc = sec.centroX + lado * (f - 0.5) * sec.pasoFila;
      const yT = y + f * sec.rake;
      B.add(M.moqueta, losaG([[xEsc, zA], [xEsc, zB], [xMuro, zB], [xMuro, zA]], y, f * sec.rake));
      B.add(M.oro, cajaG(0.03, 0.02, largo, xEsc, yT - 0.01, zM));
    }
    for (const z of [zA, zB]) {                                 // tabiques
      B.add(M.damasco, uvMundo(cajaG(Math.abs(xMuro - xFrente), ALTO_CAJA, 0.1,
        (xFrente + xMuro) / 2, y + ALTO_CAJA / 2, z), 1.6));
    }
    // el frente: piezas a lo largo de Z, «adelante» es hacia la sala
    const pon = (al, gr, mat, yy, adelante = 0, extra = 0) =>
      B.add(mat, cajaG(gr, al, largo + extra, xFrente - lado * adelante, yy, zM));
    pon(0.36, 0.16, M.marfil, y - 0.18, 0, 0.1);               // faldón
    pon(0.045, 0.19, M.oro, y - 0.36, 0, 0.14);                // filo bajo
    pon(0.04, 0.19, M.oro, y - 0.01, 0, 0.14);                 // filo a ras de suelo
    // Antepecho de 75 cm + cojín: con 84 cm el palco de arriba no veía la
    // boca del escenario sin asomarse.
    pon(0.75, 0.14, M.marfil, y + 0.375);                      // antepecho
    pon(0.07, 0.2, M.terciopelo, y + 0.785, 0, 0.04);          // cojín
    pon(0.025, 0.02, M.oro, y + 0.69, 0.075, 0.02);            // junquillos
    pon(0.025, 0.02, M.oro, y + 0.08, 0.075, 0.02);
    // sube 6 cm dentro del techo: a ras, su canto se peleaba con el forjado
    pon(0.36, 0.05, M.terciopeloTelon, y + ALTO_CAJA - 0.12, 0.03);  // bambalina
    pon(0.03, 0.07, M.oro, y + ALTO_CAJA - 0.3, 0.04);
    // rosetón en el centro del faldón, mirando a la sala
    const xr = xFrente - lado * 0.09;
    B.add(M.oro, new THREE.TorusGeometry(0.09, 0.02, 8, 24).rotateY(-lado * Math.PI / 2).translate(xr, y - 0.18, zM));
    B.add(M.oro, esferaG(0.04, xr, y - 0.18, zM));
    // pilastras de oro en las esquinas
    for (const z of [zA, zB]) {
      B.add(M.oro, cajaG(0.09, ALTO_CAJA + 0.36, 0.09, xFrente, y + ALTO_CAJA / 2 - 0.18, z));
    }
    const otros = datos.secciones.filter((o) => o.tipo === "palco" && o !== sec &&
      Math.sign(o.centroX) === lado && Math.abs(o.z0 - sec.z0) < 0.5);
    // Ménsulas bajo el palco más bajo: una caja colgada de la pared sin nada
    // debajo no se sostiene.
    if (!otros.some((o) => o.y0 < y)) {
      for (const z of [zA + 0.25, zM, zB - 0.25]) {
        const m = new THREE.Shape();
        m.moveTo(xMuro, y - 0.34);
        m.lineTo(xFrente + lado * 0.12, y - 0.34);
        m.quadraticCurveTo(xMuro - lado * 0.5, y - 0.6, xMuro - lado * 0.12, y - 1.25);
        m.lineTo(xMuro, y - 1.3);
        B.add(M.marfil, new THREE.ExtrudeGeometry(m, { depth: 0.12, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, z - 0.06));
        B.add(M.oro, esferaG(0.05, xMuro - lado * 0.14, y - 1.3, z));
      }
    }
    // Remate sobre el palco más alto: cornisa y un pequeño frontón.
    if (!otros.some((o) => o.y0 > y)) {
      const yC = y + ALTO_CAJA + 0.14;
      B.add(M.marfil, cajaG(0.26, 0.16, largo + 0.3, xFrente + lado * 0.03, yC + 0.08, zM));
      B.add(M.oro, cajaG(0.3, 0.035, largo + 0.36, xFrente + lado * 0.03, yC + 0.17, zM));
      const fr = new THREE.Shape();
      fr.moveTo(zM - 0.9, yC + 0.19);
      fr.lineTo(zM + 0.9, yC + 0.19);
      fr.quadraticCurveTo(zM, yC + 0.75, zM - 0.9, yC + 0.19);
      const gf = new THREE.ExtrudeGeometry(fr, { depth: 0.08, bevelEnabled: false, curveSegments: 12 });
      gf.rotateY(-Math.PI / 2).translate(xFrente + lado * 0.03 + 0.04, 0, 0);
      B.add(M.marfil, gf);
      B.add(M.oro, esferaG(0.07, xFrente - lado * 0.03, yC + 0.4, zM));
    }
    // la puerta del palco, en el muro, al nivel de la última fila
    const yP = y + (sec.filas - 1) * (sec.rake || 0), zP = zB - 0.6;
    const altoP = Math.min(2.0, y + ALTO_CAJA - yP - 0.02);
    B.add(M.marfil, cajaG(0.06, altoP, 0.98, xMuro - lado * 0.03, yP + altoP / 2, zP));
    B.add(M.madera, cajaG(0.05, altoP - 0.08, 0.82, xMuro - lado * 0.06, yP + altoP / 2 - 0.04, zP));
    B.add(M.oro, esferaG(0.025, xMuro - lado * 0.1, yP + 0.95, zP - 0.3));
    // lamparita con pantalla en el fondo del palco
    B.add(M.oro, cajaG(0.16, 0.02, 0.02, xMuro - lado * 0.08, y + 1.68, zM));
    B.add(M.pantalla, new THREE.CylinderGeometry(0.05, 0.085, 0.12, 16, 1, true)
      .translate(xMuro - lado * 0.16, y + 1.76, zM));
  }
  return { zLim, cajas };
}

// ════════════════════════ anfiteatro ═══════════════════════
function construirAnfiteatro(B, Bs, M, datos, porSeccion, L, alturaPatio, zLimPalcos) {
  let zLim = zLimPalcos;
  const anf = datos.secciones.find((s) => s.id === "anfiteatro");
  if (!anf) return { luces: [], yFondo: null };
  const zc = centroCurva(anf), p = anf.pasoFila;
  const lista = porSeccion.get("anfiteatro") || [];
  const { W, F } = L;

  // El frente va 75 cm por delante del eje de la fila A. Con 55 la auditoría
  // midió 21 cm entre el asiento y el antepecho: no cabían las piernas.
  const R = anf.radio0 - 0.75;
  const ext0 = Math.asin(Math.min(0.98, (semiancho(anf, 0) + 0.9) / R));
  const zEnd = zc + R * Math.cos(ext0), xEnd = R * Math.sin(ext0);
  // Nada del anfiteatro asoma por delante del remate del antepecho ni entra
  // en un palco.
  zLim = Math.max(zLim, zEnd + 0.07);
  const rDentro = (f) => (f === 0 ? R + 0.07 : radioFila(anf, f) - p / 2);

  // Gradas: cada fila una grada que sigue su arco y acaba EXACTAMENTE en la
  // pared —recortada contra ella—.
  for (let f = 0; f < anf.filas; f++) {
    const r = radioFila(anf, f);
    const y = anf.y0 + f * anf.rake;
    const alto = f === 0 ? 0.45 : anf.rake + 0.45;
    const fw = Math.asin(Math.min(0.999, (W + 0.6) / rDentro(f)));
    const pol = [...puntosArco(zc, r + p / 2, -fw, fw, 72), ...puntosArco(zc, rDentro(f), fw, -fw, 72)];
    const rec = recortarSala(pol, W, zLim);
    if (rec.length >= 3) B.add(M.moqueta, losaG(rec, y - alto, alto));
  }
  // y detrás de la última, hasta la pared del fondo
  const ultima = anf.filas - 1;
  const yFondo = anf.y0 + ultima * anf.rake;
  {
    const ro = radioFila(anf, ultima) + p / 2;
    const fw = Math.asin(Math.min(0.999, (W + 0.6) / ro));
    const pol = [...puntosArco(zc, ro, -fw, fw, 72), [W + 0.6, F], [-W - 0.6, F]];
    const rec = recortarSala(pol, W, zLim);
    if (rec.length >= 3) B.add(M.moqueta, losaG(rec, yFondo - 0.45, 0.45));
  }

  // Pasillos: alfombra roja en cada grada y un medio peldaño entre fila y fila.
  // Sin él, subir el anfiteatro eran escalones de 42 cm.
  for (const xa of anf.pasillosX || []) {
    const w = anf.anchoPasillo - 0.25;
    const fiA = (rr) => [Math.asin((xa - w / 2) / rr), Math.asin((xa + w / 2) / rr)];
    for (let f = 0; f < anf.filas; f++) {
      const r = radioFila(anf, f), y = anf.y0 + f * anf.rake;
      const [a1, a2] = fiA(r);
      Bs.add(M.alfombra, sectorAnular(zc, rDentro(f), r + p / 2, a1, a2, 0.012, 8).translate(0, y, 0));
      if (f > 0) {
        const rPrev = radioFila(anf, f - 1);
        const [b1, b2] = fiA(rPrev + p / 4);
        B.add(M.alfombra, sectorAnular(zc, rPrev + 0.02, rPrev + p / 2, b1, b2, anf.rake / 2, 8)
          .translate(0, y - anf.rake, 0));
      }
    }
  }

  // El frente: marfil con cojín de terciopelo, molduras de oro y rosetones.
  // Todo en la cara que mira AL PATIO —radio menor—, que es la que se ve.
  const baseY = anf.y0 - 0.95, altoFrente = 0.95 + 0.82;
  const cara = R - 0.07;
  // dos hojas: marfil hacia el patio y damasco hacia las butacas del
  // anfiteatro, que si no tenían delante una franja beige de lado a lado
  B.add(M.marfil, sectorAnular(zc, R - 0.07, R - 0.03, -ext0, ext0, altoFrente, 120).translate(0, baseY, 0));
  B.add(M.damasco, uvMundo(sectorAnular(zc, R - 0.03, R + 0.07, -ext0, ext0, altoFrente, 120).translate(0, baseY, 0), 1.6));
  B.add(M.terciopelo, sectorAnular(zc, R - 0.1, R + 0.1, -ext0, ext0, 0.075, 120).translate(0, anf.y0 + 0.82, 0));
  for (const [y, rad] of [[anf.y0 + 0.78, 0.022], [anf.y0 - 0.02, 0.03], [baseY + 0.05, 0.034]]) {
    B.add(M.oro, new THREE.TubeGeometry(arco(zc, cara - rad * 0.4, -ext0, ext0, y, 96), 160, rad, 8, false));
  }
  {
    const yR = (baseY + 0.05 + anf.y0 - 0.02) / 2;
    const n = Math.max(2, Math.round((2 * ext0 * cara) / 1.6));
    for (let k = 0; k <= n; k++) {
      const f = -ext0 + 0.04 + ((2 * ext0 - 0.08) * k) / n;
      const x = (cara - 0.012) * Math.sin(f), z = zc + (cara - 0.012) * Math.cos(f);
      B.add(M.oro, new THREE.TorusGeometry(0.1, 0.022, 8, 24).rotateY(f + Math.PI).translate(x, yR, z));
      B.add(M.oro, esferaG(0.045, x, yR, z));
    }
  }
  // remate del frente contra la pared, donde acaba el arco
  for (const s of [-1, 1]) {
    const largo = W - xEnd + 0.07;
    B.add(M.marfil, cajaG(largo, altoFrente, 0.14, s * (xEnd - 0.07 + largo / 2), baseY + altoFrente / 2, zEnd));
    B.add(M.terciopelo, cajaG(largo, 0.075, 0.2, s * (xEnd - 0.07 + largo / 2), anf.y0 + 0.8575, zEnd));
  }

  // Barandilla de seguridad sobre el antepecho, al pie de cada pasillo.
  for (const xa of anf.pasillosX || []) {
    const f1 = Math.asin((xa - 0.6) / R), f2 = Math.asin((xa + 0.6) / R), yB = anf.y0 + 0.895;
    B.add(M.oro, new THREE.TubeGeometry(arco(zc, R, f1, f2, yB + 0.26, 8), 12, 0.018, 6, false));
    for (const f of [f1, f2]) {
      B.add(M.oro, new THREE.CylinderGeometry(0.014, 0.014, 0.26, 6).translate(R * Math.sin(f), yB + 0.13, zc + R * Math.cos(f)));
    }
  }

  // El techo de debajo del anfiteatro: un sofito de marfil que sube con las
  // gradas, con sus focos empotrados. Antes no había nada: el fondo del patio
  // miraba al envés de las gradas, a oscuras.
  const pend = 0.19;
  const ySof = (d) => baseY + pend * (d - R);
  const dIni = R + 0.07;
  const dFin = (f) => Math.max(dIni, Math.min((F - zc) / Math.cos(f),
    Math.abs(Math.sin(f)) > 1e-9 ? W / Math.abs(Math.sin(f)) : Infinity));
  // Las columnas. Van retranqueadas —el frente vuela por delante de ellas,
  // como en los teatros de columnas de fundición— y cada una ocupa el sitio de
  // UNA butaca, sobre la línea de su fila. Antes estaban entre dos filas, bajo
  // el canto, y se llevaban butacas de las dos.
  for (const c of (datos.obstaculos || []).filter((o) => o.tipo === "columna")) {
    const dAnf = Math.hypot(c.x, c.z - zc);
    const yTop = dAnf > dIni ? ySof(dAnf) + 0.04 : c.alto;
    columna(B, M, c.x, alturaPatio(c.x, c.z), c.z, yTop);
  }
  const fis = Array.from({ length: 97 }, (_, i) => -ext0 + (2 * ext0 * i) / 96);
  const sofito = rejillaPolar(zc, fis, () => dIni, dFin, ySof, 16);
  orientar(sofito, -1);
  sofito.computeVertexNormals();
  B.add(M.marfil, sofito);
  // cierre del rincón entre el final del arco y la pared
  for (const s of [-1, 1]) {
    const A = [s * dIni * Math.sin(ext0), zc + dIni * Math.cos(ext0)];
    const dW = W / Math.sin(ext0);
    const C = [s * W, zc + dW * Math.cos(ext0)];
    const Bp = [s * W, A[1]];
    const v = [A, Bp, C].map(([x, z]) => new THREE.Vector3(x, ySof(Math.hypot(x, z - zc)), z));
    const g = new THREE.BufferGeometry().setFromPoints(v);
    g.setIndex([0, 1, 2]);
    orientar(g, -1);
    g.computeVertexNormals();
    B.add(M.marfil, g);
  }
  const luces = [];
  for (const dd of [1.3, 3.7, 6.1]) {
    const d = R + dd;
    const lim = ext0 - 0.06;
    const n = Math.max(2, Math.round((2 * lim * d) / 2.6));
    for (let k = 0; k <= n; k++) {
      const f = -lim + (2 * lim * k) / n;
      if (d > dFin(f) - 0.4) continue;
      B.add(M.foco, new THREE.CircleGeometry(0.07, 14).rotateX(Math.PI / 2)
        .translate(d * Math.sin(f), ySof(d) - 0.016, zc + d * Math.cos(f)));
    }
  }
  for (const f of [-0.3, 0, 0.3]) {
    const d = R + 3.4;
    luces.push(new THREE.Vector3(d * Math.sin(f), ySof(d) - 0.05, zc + d * Math.cos(f)));
  }
  // Para las paredes: dónde está el techo (sofito) y dónde el suelo del
  // anfiteatro en un punto. Las pilastras de la pared cruzaban los dos.
  const zEndPared = zc + R * Math.cos(ext0);
  const bajoAnfiteatro = (x, z) => {
    if (z < zEndPared) return null;
    const d = Math.hypot(x, z - zc);
    const f = Math.max(0, Math.min(anf.filas - 1, Math.floor((d - (anf.radio0 - p / 2)) / p)));
    return { techo: ySof(Math.max(d, dIni)), suelo: anf.y0 + f * anf.rake };
  };
  return { luces, yFondo, pasillosX: anf.pasillosX || [], bajoAnfiteatro };
}

// Columna de fundición: plinto, basa torneada, fuste estriado con éntasis,
// collarino y un capitel de campana con dos coronas de hojas, volutas y ábaco.
function columna(B, M, x, yPie, z, yTop) {
  const torno = (pts, mat) => B.add(mat, new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 32).translate(x, 0, z));
  // el plinto se hunde 4 cm: el suelo es una rampa y tiene que quedar a nivel
  B.add(M.marfil, new THREE.BoxGeometry(0.42, 0.14, 0.42).translate(x, yPie + 0.03, z));
  const y0 = yPie + 0.1;
  torno([[0.2, y0], [0.205, y0 + 0.025], [0.19, y0 + 0.05], [0.162, y0 + 0.065], [0.158, y0 + 0.085],
         [0.176, y0 + 0.105], [0.168, y0 + 0.125], [0.132, y0 + 0.14]], M.marfil);
  const yF = y0 + 0.14, yC = yTop - 0.44, largo = yC - yF;
  const fuste = new THREE.CylinderGeometry(1, 1, largo, 80, 8);
  const pf = fuste.attributes.position;
  for (let i = 0; i < pf.count; i++) {
    const px = pf.getX(i), pz = pf.getZ(i);
    if (Math.hypot(px, pz) < 1e-6) continue;
    const t = pf.getY(i) / largo + 0.5;                       // 0 abajo, 1 arriba
    const r = 0.128 - 0.02 * t * t;                           // éntasis
    const k = r * (1 - 0.05 * Math.pow(Math.max(0, Math.cos(20 * Math.atan2(pz, px))), 2));   // 20 estrías
    pf.setX(i, px * k);
    pf.setZ(i, pz * k);
  }
  fuste.computeVertexNormals();
  B.add(M.marfil, fuste.translate(x, yF + largo / 2, z));
  B.add(M.oro, new THREE.TorusGeometry(0.118, 0.016, 8, 32).rotateX(Math.PI / 2).translate(x, yC, z));
  torno([[0.108, yC], [0.112, yC + 0.06], [0.122, yC + 0.16], [0.15, yC + 0.26], [0.2, yC + 0.33], [0.19, yC + 0.36]], M.oro);
  for (const [n, yy, r, desf] of [[8, yC + 0.1, 0.125, 0], [8, yC + 0.22, 0.15, 0.5]]) {
    for (let i = 0; i < n; i++) {
      const a = ((i + desf) / n) * Math.PI * 2;
      B.add(M.oro, new THREE.SphereGeometry(0.045, 8, 6).scale(0.75, 1.5, 0.45).rotateX(0.35).rotateY(Math.PI / 2 - a)
        .translate(x + Math.cos(a) * r, yy, z + Math.sin(a) * r));
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    B.add(M.oro, new THREE.TorusGeometry(0.035, 0.014, 6, 14).rotateY(Math.atan2(sx, sz) + Math.PI / 2)
      .translate(x + sx * 0.17, yC + 0.325, z + sz * 0.17));
  }
  B.add(M.oro, new THREE.BoxGeometry(0.46, 0.08, 0.46).translate(x, yTop - 0.04, z));
}

// ════════════════════════ embocadura ═══════════════════════
// Un muro de embocadura de verdad, de pared a pared, con el hueco de escena.
// El marco anterior medía 1,2 m: entre él y la pared lateral había un hueco
// de suelo a techo por el que se veía la caja escénica.
function construirEmbocadura(grupo, B, M, datos, L) {
  const esc = datos.escenario;
  const a2 = esc.embocaduraAncho / 2, tope = esc.embocaduraY + esc.embocaduraAlto;
  const { W, H, zP0, zP1 } = L;

  const muro = new THREE.Shape();
  muro.moveTo(-W - 0.2, -0.05);
  muro.lineTo(-a2, -0.05);
  muro.lineTo(-a2, tope);
  muro.lineTo(a2, tope);
  muro.lineTo(a2, -0.05);
  muro.lineTo(W + 0.2, -0.05);
  muro.lineTo(W + 0.2, H + 0.2);
  muro.lineTo(-W - 0.2, H + 0.2);
  const gm = new THREE.ExtrudeGeometry(muro, { depth: zP1 - zP0, bevelEnabled: false });
  gm.translate(0, 0, zP0);
  B.add(M.damasco, uvMundo(gm, 1.6));

  // marco de marfil con junquillos de oro
  const AM = 0.62;
  const marco = new THREE.Shape();
  marco.moveTo(-a2 - AM, -0.05);
  marco.lineTo(-a2, -0.05);
  marco.lineTo(-a2, tope);
  marco.lineTo(a2, tope);
  marco.lineTo(a2, -0.05);
  marco.lineTo(a2 + AM, -0.05);
  marco.lineTo(a2 + AM, tope + AM);
  marco.lineTo(-a2 - AM, tope + AM);
  const gmf = new THREE.ExtrudeGeometry(marco, {
    depth: 0.05, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1,
  });
  gmf.translate(0, 0, zP1 + 0.012);
  B.add(M.marfil, gmf);
  const zO = zP1 + 0.074;
  for (const [off, g] of [[0.03, 0.075], [0.2, 0.04], [AM - 0.035, 0.06]]) {
    for (const s of [-1, 1]) {
      const alto = tope + off;
      B.add(M.oro, cajaG(g, alto, g, s * (a2 + off), alto / 2, zO + g / 2 - 0.006));
    }
    B.add(M.oro, cajaG(2 * (a2 + off) + g, g, g, 0, tope + off, zO + g / 2 - 0.006));
  }

  // el escudo con la inicial del teatro, en la clave del arco
  const cy = tope + AM / 2 + 0.02;
  const anillo = new THREE.Shape();
  anillo.absellipse(0, 0, 0.66, 0.4, 0, Math.PI * 2, false);
  const dentro = new THREE.Path();
  dentro.absellipse(0, 0, 0.55, 0.31, 0, Math.PI * 2, true);
  anillo.holes.push(dentro);
  B.add(M.oro, new THREE.ExtrudeGeometry(anillo, {
    depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 48,
  }).translate(0, cy, zO));
  const campo = new THREE.Shape();
  campo.absellipse(0, 0, 0.548, 0.308, 0, Math.PI * 2, false);
  const gc = new THREE.ShapeGeometry(campo, 48);
  const uv = gc.attributes.uv, pc = gc.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pc.getX(i) / 1.12 + 0.5, pc.getY(i) / 0.64 + 0.5);
  gc.translate(0, cy, zO + 0.004);
  grupo.add(malla(gc, M.monograma, false));

  // El telón, abierto y recogido a la italiana, con su alzapaño.
  const zTelon = -0.55, yNudo = esc.embocaduraY + 1.5, anchoNudo = 0.55;
  const panos = [];
  for (const s of [-1, 1]) {
    const xExt = s * (a2 + 0.15), lado = -s;
    const forma = {
      xExt, lado, yBase: esc.embocaduraY, alto: tope + 0.2 - esc.embocaduraY, yNudo,
      anchoArriba: 2.2, anchoNudo, anchoPie: 0.82, ondas: 9, amp: 0.05, z: zTelon,
    };
    const c = malla(cortinaRecogida(forma), M.terciopeloTelon);
    c.name = "TELON";
    grupo.add(c);
    panos.push({ geo: c.geometry, forma });
    const cx = xExt + (lado * anchoNudo) / 2;
    const elipse = new THREE.EllipseCurve(0, 0, anchoNudo / 2 + 0.06, 0.15, 0, Math.PI * 2);
    const pts = elipse.getPoints(40).slice(0, 40).map((q) => new THREE.Vector3(cx + q.x, yNudo, zTelon + 0.07 + q.y));
    B.add(M.oro, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 0.024, 6, true));
    const xB = cx + lado * 0.06, zB = zTelon + 0.07 + 0.15;
    B.add(M.oro, esferaG(0.05, xB, yNudo - 0.07, zB));
    B.add(M.oro, new THREE.ConeGeometry(0.065, 0.3, 14).translate(xB, yNudo - 0.27, zB));
  }

  // La bambalina, en guirnaldas, con fleco y borlas de oro.
  const anchoB = esc.embocaduraAncho + 0.6, altoB = 1.3, nG = 5, caida = 0.42;
  const yB = tope - altoB / 2 + 0.28, zB = -0.42;
  const gb = bambalina(anchoB, altoB, nG, caida, 7, 0.035);
  gb.translate(0, yB, zB);
  const mb = malla(gb, M.terciopeloTelon);
  mb.name = "BAMBALINA";
  grupo.add(mb);
  const borde = [];
  for (let i = 0; i <= 200; i++) {
    const u = i / 200, x = (u - 0.5) * anchoB;
    const panza = Math.sin(Math.PI * ((u * nG) % 1 || (i === 200 ? 0 : 0)));
    borde.push(new THREE.Vector3(x, yB - altoB / 2 + caida * (1 - panza) - 0.01, zB + 0.12 * panza + 0.01));
  }
  B.add(M.oro, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(borde), 240, 0.028, 6, false));
  for (let k = 0; k <= nG; k++) {
    const x = (k / nG - 0.5) * anchoB;
    const y = yB - altoB / 2 + caida;
    B.add(M.oro, esferaG(0.05, x, y - 0.03, zB + 0.03));
    B.add(M.oro, new THREE.ConeGeometry(0.06, 0.32, 12).translate(x, y - 0.24, zB + 0.03));
  }
  // 0 = telón cerrado, 1 = abierto y recogido. Se rehace la tela, no se escala:
  // un telón a la italiana se abre recogiéndose en diagonal hacia el alzapaño.
  return (abertura) => { for (const p of panos) cortinaRecogida(p.forma, abertura, p.geo); };
}

function cortinaRecogida({ xExt, lado, yBase, alto, yNudo, anchoArriba, anchoNudo, anchoPie, ondas, amp, z }, abertura = 1, geo = null) {
  const SU = ondas * 8, SV = 36;
  if (!geo) geo = new THREE.PlaneGeometry(1, 1, SU, SV);
  const p = geo.attributes.position;
  const yTop = yBase + alto;
  const cerrado = Math.abs(xExt) + 0.1;                // cerrado, cada paño llega al eje y monta un poco
  for (let i = 0; i < p.count; i++) {
    // de la rejilla, no de la posición: la tela se rehace cada vez que se mueve
    const u = (i % (SU + 1)) / SU, v = 1 - Math.floor(i / (SU + 1)) / SV;     // u: 0 borde de fuera, 1 de dentro
    const y = yBase + v * alto;
    let w;
    if (y >= yNudo) {
      const t = (y - yNudo) / (yTop - yNudo);
      w = anchoNudo + (anchoArriba - anchoNudo) * Math.pow(Math.sin((t * Math.PI) / 2), 0.85);
    } else {
      const t = (yNudo - y) / (yNudo - yBase);
      w = anchoNudo + (anchoPie - anchoNudo) * Math.pow(t, 0.75);
    }
    w = cerrado + (w - cerrado) * abertura;
    const apriete = Math.max(0.55, Math.min(3.2, anchoArriba / w));
    const pliegue = Math.sin(u * ondas * Math.PI * 2) * amp * Math.sqrt(apriete);
    const bulto = abertura * 0.14 * Math.exp(-(((y - yNudo) / 0.55) ** 2)) * Math.sin(u * Math.PI);
    p.setXYZ(i, xExt + lado * u * w, y, z + lado * 0.012 + pliegue + bulto);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function bambalina(ancho, alto, n, caida, ondas, amp) {
  const geo = new THREE.PlaneGeometry(ancho, alto, n * 28, 18);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), v = p.getY(i) / alto + 0.5;
    const fr = ((x / ancho + 0.5) * n) % 1;
    const panza = Math.sin(Math.PI * fr);
    const yAbajo = -alto / 2 + caida * (1 - panza);
    const y = yAbajo + v * (alto / 2 - yAbajo);
    const z = 0.12 * panza * Math.pow(1 - v, 1.4)
      + amp * Math.sin(v * ondas * Math.PI) * panza * (1 - v * 0.6)
      + 0.012 * Math.sin((x / ancho) * 160 * Math.PI) * v;
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

// ════════════════════════ escenario ═══════════════════════
// Un escenario de verdad antes de la función: tablas, patas y bambalinas
// negras que tapan las cajas, un ciclorama al atardecer y un piano de cola.
// El piano no es decoración: es la medida. Todo el mundo sabe lo que mide un
// piano, y así se lee desde cada butaca cómo de grande se verá la escena.
function construirEscenario(grupo, B, M, T, datos, L) {
  const esc = datos.escenario;
  const a2 = esc.embocaduraAncho / 2, yE = esc.embocaduraY, fondo = esc.fondo;
  const anchoEsc = esc.embocaduraAncho + 4;
  const hondo = esc.foso ? esc.foso.hondo : 0;

  T.tablas.repeat.set(anchoEsc / 1.92, fondo / 1.92);
  const suelo = caja(anchoEsc, 0.2, fondo, M.tablas, 0, yE - 0.1, -fondo / 2);
  suelo.castShadow = false;
  suelo.name = "SUELO_ESCENA";
  grupo.add(suelo);
  B.add(M.madera, cajaG(anchoEsc, yE + hondo, 0.12, 0, (yE - hondo) / 2, 0.06));   // frente, hasta el foso
  B.add(M.oro, cajaG(esc.embocaduraAncho, 0.045, 0.05, 0, yE - 0.03, 0.135));      // canto

  const altoC = L.H + 2, xC = anchoEsc / 2 + 0.05;
  for (const s of [-1, 1]) B.add(M.negro, cajaG(0.1, altoC, fondo + 0.4, s * xC, yE + altoC / 2 - 0.1, -fondo / 2));
  B.add(M.negro, cajaG(anchoEsc + 0.3, 0.2, fondo + 0.4, 0, yE + altoC, -fondo / 2));
  // la torre de tramoya asoma por encima del tejado de la sala: se cierra
  const yMuro = L.H + 0.2;
  B.add(M.negro, cajaG(anchoEsc + 0.3, yE + altoC - yMuro, 0.2, 0, (yMuro + yE + altoC) / 2, L.zP0 - 0.1));

  // Fondo de terciopelo negro, en pliegues: la sala de conciertos sobria que
  // eligió Antonio (17-nov) en vez del cielo de atardecer. Contra el negro, lo
  // que se ve es la luz: el piano, la alfombra y los haces.
  {
    const ancho = anchoEsc, alto = altoC, ondas = 26;
    const geo = new THREE.PlaneGeometry(ancho, alto, ondas * 8, 6);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      p.setZ(i, Math.sin((x / ancho) * ondas * Math.PI * 2) * 0.07 + Math.sin((x / ancho) * 7.3) * 0.03);
    }
    geo.computeVertexNormals();
    const fondoNegro = malla(geo, M.terciopeloNegro, false);
    fondoNegro.position.set(0, yE + alto / 2, -fondo + 0.45);
    fondoNegro.name = "FONDO";
    grupo.add(fondoNegro);
  }
  B.add(M.negro, cajaG(anchoEsc, 0.5, 0.1, 0, yE + 0.25, -fondo + 1.1));            // contrapié

  // patas y bambalinas negras
  // Las bambalinas, a 25 cm por debajo del hueco: tapan la tramoya sin
  // convertir el cielo en una ventana con una viga negra encima.
  for (const z of [-1.5, -3.7, -5.9]) {
    for (const s of [-1, 1]) B.add(M.negro, cajaG(2.0, 8.2, 0.05, s * (a2 + 0.65), yE + 4.1, z));
    B.add(M.negro, cajaG(esc.embocaduraAncho + 3.4, 2.6, 0.05, 0, yE + esc.embocaduraAlto - 0.25 + 1.3, z + 0.12));
  }

  const piano = construirPiano(grupo, M, -2.65, yE, -4.15, 0.1);

  // alfombra bajo el piano y la banqueta
  const alf = new THREE.PlaneGeometry(3.4, 2.5).rotateX(-Math.PI / 2).rotateY(0.1)
    .translate(piano.x - 0.25, yE + 0.004, piano.z + 0.05);
  const ma = malla(alf, M.alfombraEscena, false);
  ma.name = "ALFOMBRA_PIANO";
  grupo.add(ma);

  // un arreglo floral en un pedestal, a la derecha del proscenio
  construirFlores(B, M, a2 - 1.3, yE, -1.0);

  // haces de luz en el humo: el especial sobre el piano, la cenital y dos
  // diagonales desde las varas laterales
  const haces = new THREE.Group();
  haces.name = "HACES";
  // Antonio (17-nov): los tres focos apuntaban al centro del escenario, a la
  // derecha del piano. Ahora los tres van a la banqueta, donde se sienta el
  // pianista; la cenital ancha sigue bañando el centro.
  const banco = new THREE.Vector3(piano.banqueta.x, yE, piano.banqueta.z);
  const fuente = new THREE.Vector3(banco.x + 1.2, yE + 7.2, -2.6);
  haces.add(haz(fuente, banco, 1.0, 0.16, 0xfff0d8));
  haces.add(haz(new THREE.Vector3(0, yE + 8.5, -fondo * 0.35), new THREE.Vector3(0, yE, -fondo * 0.42), 2.6, 0.05, 0xffd7a0));
  for (const s of [-1, 1]) {
    haces.add(haz(new THREE.Vector3(s * (a2 + 1.2), yE + 7.0, -4.8), banco, 0.8, 0.06, 0xd8c7ff));
  }
  grupo.add(haces);
  // los focos de los que salen, colgados de su vara (sólo se ven desde delante)
  for (const [x, y, z] of [[fuente.x, fuente.y, fuente.z], [0, yE + 8.5, -fondo * 0.35], [-(a2 + 1.2), yE + 7.0, -4.8], [a2 + 1.2, yE + 7.0, -4.8]]) {
    B.add(M.hierro, new THREE.CylinderGeometry(0.11, 0.14, 0.38, 14).translate(x, y + 0.12, z));
    B.add(M.hierro, new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6).translate(x, y + 0.5, z));
  }
  return piano;
}

// Un haz de luz visible en el humo del escenario: un cono abierto que brilla
// más mirado de frente que de canto y se apaga hacia el suelo. Se suma a lo que
// hay detrás (aditivo) y no escribe profundidad.
function haz(desde, hasta, radio, fuerza, color) {
  const d = new THREE.Vector3().subVectors(hasta, desde);
  const L = d.length();
  const geo = new THREE.CylinderGeometry(0.08, radio, L, 40, 1, true).translate(0, -L / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, fuerza: { value: fuerza } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV; varying float vT;
      void main() {
        vT = uv.y;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 color; uniform float fuerza;
      varying vec3 vN; varying vec3 vV; varying float vT;
      void main() {
        float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
        float a = f * fuerza * (0.3 + 0.7 * vT) * smoothstep(0.0, 0.18, vT);
        gl_FragColor = vec4(color * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(desde);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d.normalize());
  m.renderOrder = 5;
  return m;
}

// Pedestal de marfil, copa dorada y un ramo: rosas blancas, unas pocas rojas y
// hojas. Repetible: siempre sale el mismo ramo.
function construirFlores(B, M, x, y, z) {
  const r = azar(41);
  const torno = (pts, mat, seg = 28) => B.add(mat, new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), seg).translate(x, y, z));
  torno([[0.2, 0], [0.2, 0.06], [0.13, 0.1], [0.1, 0.2], [0.09, 0.85], [0.12, 0.92], [0.18, 0.96], [0.18, 1.0], [0, 1.0]], M.marfil);
  torno([[0, 1.0], [0.07, 1.0], [0.06, 1.06], [0.2, 1.22], [0.22, 1.3], [0.19, 1.32], [0, 1.32]], M.oro);
  const yR = y + 1.32;
  for (let k = 0; k < 70; k++) {
    // casquete achatado: el ramo es una cúpula, no una bola
    const a = r() * Math.PI * 2, e = Math.acos(1 - r() * 0.95);
    const rr = 0.42 * Math.sin(e), h = 0.32 * Math.cos(e);
    const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr, py = yR + 0.08 + h;
    if (k < 20) {
      B.add(M.hoja, new THREE.SphereGeometry(0.075, 6, 4).scale(1, 0.25, 0.5)
        .rotateY(-a).rotateZ(-0.6).translate(px * 1.0, py - 0.08, pz));
    } else {
      const roja = r() < 0.16;
      B.add(roja ? M.florRoja : M.florBlanca, new THREE.IcosahedronGeometry(0.045 + r() * 0.025, 1).translate(px, py, pz));
    }
  }
}

function construirPiano(grupo, M, x0, y0, z0, giro) {
  const P = new THREE.Group();
  P.name = "PIANO";
  P.position.set(x0, y0, z0);
  P.rotation.y = giro;
  const Lp = 2.1, Wp = 1.5, hCaja = 0.32, yCaja = 0.62;
  const contorno = new THREE.Shape();
  contorno.moveTo(0, 0);
  contorno.lineTo(Wp, 0);
  contorno.lineTo(Wp, 0.32 * Lp);
  contorno.bezierCurveTo(Wp, 0.62 * Lp, 0.42 * Wp, 0.52 * Lp, 0.36 * Wp, 0.86 * Lp);
  contorno.quadraticCurveTo(0.31 * Wp, Lp, 0.12 * Wp, Lp);
  contorno.quadraticCurveTo(0, Lp, 0, 0.94 * Lp);
  contorno.lineTo(0, 0);
  // del plano del dibujo (ancho, largo) a (x = largo, y = alto, z = ancho)
  const aPiano = (g) => g.rotateX(-Math.PI / 2).rotateY(-Math.PI / 2);
  const add = (g, mat, sombra = true) => P.add(malla(g, mat, sombra));

  add(aPiano(new THREE.ExtrudeGeometry(contorno, {
    depth: hCaja, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 24,
  })).translate(0, yCaja, 0), M.piano);
  // el arpa de hierro dorado, que es lo que se ve con la tapa abierta
  add(aPiano(new THREE.ShapeGeometry(contorno, 24))
    .translate(-Lp * 0.48, 0, -Wp * 0.45).scale(0.88, 1, 0.82).translate(Lp * 0.48 + 0.05, yCaja + hCaja + 0.015, Wp * 0.45),
    M.oro, false);
  // tapa abierta hacia el público, con su varilla
  const ANG = 0.6;
  const bisagra = new THREE.Group();
  bisagra.position.set(0, yCaja + hCaja + 0.012, 0);
  bisagra.rotation.x = -ANG;
  bisagra.add(malla(aPiano(new THREE.ExtrudeGeometry(contorno, { depth: 0.025, bevelEnabled: false, curveSegments: 24 })), M.piano));
  P.add(bisagra);
  const zVar = 0.95, hVar = zVar * Math.tan(ANG);
  add(new THREE.CylinderGeometry(0.012, 0.012, hVar, 8).translate(0.55 * Lp, yCaja + hCaja + 0.012 + hVar / 2, zVar), M.piano);
  // patas con ruedas de latón
  for (const [u, w] of [[0.1 * Lp, 0.1 * Wp], [0.1 * Lp, 0.9 * Wp], [0.84 * Lp, 0.24 * Wp]]) {
    add(new THREE.CylinderGeometry(0.055, 0.04, yCaja, 14).translate(u, yCaja / 2, w), M.piano);
    add(esferaG(0.035, u, 0.035, w), M.oro, false);
  }
  // teclado, atril y lira de pedales
  add(new THREE.BoxGeometry(0.22, 0.07, 1.36).translate(-0.1, 0.705, Wp / 2), M.piano);
  add(new THREE.PlaneGeometry(1.22, 0.15).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2).translate(-0.085, 0.742, Wp / 2), M.teclas, false);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.22, 0.1, 0.06).translate(-0.1, 0.72, Wp / 2 + s * 0.65), M.piano);
  add(new THREE.BoxGeometry(0.025, 0.3, 0.85).rotateZ(-0.3).translate(0.16, yCaja + hCaja + 0.16, Wp / 2), M.piano);
  add(new THREE.BoxGeometry(0.05, 0.5, 0.18).translate(0.15, 0.25, Wp / 2), M.piano);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.12, 0.015, 0.03).translate(0.07, 0.05, Wp / 2 + s * 0.04), M.oro, false);
  // banqueta
  add(new THREE.BoxGeometry(0.38, 0.07, 0.8).translate(-0.68, 0.5, Wp / 2), M.piano);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(new THREE.BoxGeometry(0.045, 0.47, 0.045).translate(-0.68 + sx * 0.15, 0.235, Wp / 2 + sz * 0.35), M.piano);
  }
  grupo.add(P);
  P.updateMatrixWorld(true);
  const centro = new THREE.Vector3(Lp * 0.5, 0.9, Wp * 0.5).applyMatrix4(P.matrixWorld);
  // la banqueta, donde se sienta el pianista: ahí apuntan los focos
  centro.banqueta = new THREE.Vector3(-0.68, 0.5, Wp / 2).applyMatrix4(P.matrixWorld);
  return centro;
}

// ════════════════════════ paredes, techo y lámpara ═══════════════════════
// Zócalo de madera que SIGUE la rampa —el recto se hundía en ella—, damasco
// encima, pilastras de marfil con filete de oro y un aplique con pantalla en
// cada una. Puertas con su cartel de salida al final de cada pasillo.
function construirMuros(grupo, B, Bc, M, datos, L, altura, anf, cerramiento, cajas = []) {
  const { W, F, H, zP0 } = L;
  const largo = F - zP0, zMed = (F + zP0) / 2;
  for (const s of [-1, 1]) {
    Bc.add(M.damasco, uvMundo(cajaG(0.3, H, largo, s * (W + 0.15), H / 2, zMed), 1.6));
    Bc.add(M.oro, cajaG(0.06, 0.06, largo, s * (W - 0.03), H - 0.5, zMed));
  }
  Bc.add(M.damasco, uvMundo(cajaG(2 * W + 0.6, H, 0.3, 0, H / 2, F + 0.15), 1.6));
  Bc.add(M.marfilTecho, cajaG(2 * W + 0.6, 0.3, largo + 0.3, 0, H + 0.15, zMed));

  // zócalos que siguen el suelo
  const N = 48;
  const zs = Array.from({ length: N + 1 }, (_, i) => zP0 + (largo * i) / N);
  for (const s of [-1, 1]) {
    const x = s * W;
    const f = new THREE.Shape();
    f.moveTo(zs[0], altura(x, zs[0]) - 0.2);
    for (const z of zs) f.lineTo(z, altura(x, z) + 1.0);
    for (const z of [...zs].reverse()) f.lineTo(z, altura(x, z) - 0.2);
    const g = new THREE.ExtrudeGeometry(f, { depth: 0.05, bevelEnabled: false });
    g.rotateY(-Math.PI / 2);                              // forma.x → z, extrusión → −x
    g.translate(s > 0 ? W : -W + 0.05, 0, 0);
    Bc.add(M.madera, g);
    const pts = zs.map((z) => new THREE.Vector3(x - s * 0.055, altura(x, z) + 1.0, z));
    Bc.add(M.oro, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.022, 6, false));
  }
  {
    const xs = Array.from({ length: N + 1 }, (_, i) => -W + (2 * W * i) / N);
    const f = new THREE.Shape();
    f.moveTo(xs[0], altura(xs[0], F) - 0.2);
    for (const x of xs) f.lineTo(x, altura(x, F) + 1.0);
    for (const x of [...xs].reverse()) f.lineTo(x, altura(x, F) - 0.2);
    Bc.add(M.madera, new THREE.ExtrudeGeometry(f, { depth: 0.05, bevelEnabled: false }).translate(0, 0, F - 0.05));
    const pts = xs.map((x) => new THREE.Vector3(x, altura(x, F) + 1.0, F - 0.055));
    Bc.add(M.oro, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.022, 6, false));
    if (anf.yFondo !== null) {
      Bc.add(M.madera, cajaG(2 * W, 1.0, 0.05, 0, anf.yFondo + 0.5, F - 0.025));
      Bc.add(M.oro, cajaG(2 * W, 0.04, 0.04, 0, anf.yFondo + 1.0, F - 0.055));
    }
  }

  // pilastras y apliques
  const apliques = [];
  // donde hay un palco no hay pilastra ni aplique: la caja va metida en el muro
  const enPalco = (s, z) => cajas.some((c) => c.lado === s && z > c.zA - 0.35 && z < c.zB + 0.35);
  for (let z = 3.5; z < F - 1; z += 3.2) {
    for (const s of [-1, 1]) {
      if (enPalco(s, z)) continue;
      const x = s * (W - 0.06);
      const y0 = altura(s * W, z) + 1.0;
      // Una pilastra es un tramo de y1 a y2. Detrás del anfiteatro son DOS: una
      // abajo hasta el sofito y otra arriba desde el suelo del anfiteatro. De una
      // pieza, atravesaban el techo de debajo del anfiteatro y la grada.
      const tramo = (y1, y2) => {
        if (y2 - y1 < 0.3) return;
        Bc.add(M.marfil, cajaG(0.12, y2 - y1, 0.36, x, (y1 + y2) / 2, z));
        Bc.add(M.oro, cajaG(0.125, y2 - y1, 0.04, x - s * 0.003, (y1 + y2) / 2, z));
      };
      const bajo = anf.bajoAnfiteatro && anf.bajoAnfiteatro(s * W, z);
      if (bajo) {
        tramo(y0, bajo.techo - 0.02);
        Bc.add(M.oro, cajaG(0.16, 0.08, 0.42, x - s * 0.02, bajo.techo - 0.06, z));
        tramo(bajo.suelo + 0.02, H - 0.1);
      } else {
        tramo(y0, H - 0.1);
      }
      Bc.add(M.oro, cajaG(0.16, 0.12, 0.42, x - s * 0.02, H - 0.62, z));
      const yA = altura(s * W, z) + 2.35;
      B.add(M.oro, cajaG(0.26, 0.025, 0.025, x - s * 0.17, yA, z));
      B.add(M.oro, new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6).translate(x - s * 0.3, yA + 0.05, z));
      B.add(M.pantalla, new THREE.CylinderGeometry(0.06, 0.1, 0.14, 18, 1, true).translate(x - s * 0.3, yA + 0.15, z));
      apliques.push(new THREE.Vector3(x - s * 0.3, yA + 0.12, z));
    }
  }

  // puertas con su cartel de salida
  const puerta = (x, yS, z) => {
    B.add(M.marfil, cajaG(1.72, 2.52, 0.08, x, yS + 1.26, z - 0.04));
    B.add(M.madera, cajaG(1.42, 2.32, 0.05, x, yS + 1.16, z - 0.09));
    B.add(M.oro, cajaG(0.012, 2.32, 0.052, x, yS + 1.16, z - 0.09));
    for (const s of [-1, 1]) B.add(M.oro, cajaG(0.03, 0.22, 0.03, x + s * 0.09, yS + 1.05, z - 0.125));
    B.add(M.salida, new THREE.BoxGeometry(0.42, 0.16, 0.05).translate(x, yS + 2.78, z - 0.04));
  };
  const patio = datos.secciones.find((s) => s.id === "patio");
  for (const x of patio.pasillosX || []) puerta(x, altura(x, F), F);
  if (anf.yFondo !== null) for (const x of anf.pasillosX) puerta(x, anf.yFondo, F);

  // rosetón del techo
  const zL = Math.min(8.5, F * 0.45);
  Bc.add(M.pintura, new THREE.CircleGeometry(4.0, 72).rotateX(Math.PI / 2).translate(0, H - 0.006, zL));
  Bc.add(M.oro, new THREE.TorusGeometry(4.0, 0.07, 8, 120).rotateX(Math.PI / 2).translate(0, H - 0.05, zL));
  Bc.add(M.oro, new THREE.TorusGeometry(1.1, 0.05, 8, 60).rotateX(Math.PI / 2).translate(0, H - 0.04, zL));
  for (let k = 0; k < 24; k++) {
    Bc.add(M.oro, new THREE.BoxGeometry(0.05, 0.03, 2.9).translate(0, 0, 2.55)
      .rotateY((k / 24) * Math.PI * 2).translate(0, H - 0.03, zL));
  }

  // La lámpara de araña: un fuste torneado, tres pisos de brazos en S con su
  // vela, y guirnaldas de cristal entre brazo y brazo. La anterior eran tres
  // aros con bombillas: vista de canto, el resplandor la convertía en un
  // borrón de luz y no se leía como lámpara.
  const lampara = new THREE.Group();
  lampara.name = "LAMPARA";
  const Bl = cubos();
  const yL = H - 1.75;
  Bl.add(M.oro, new THREE.CylinderGeometry(0.35, 0.2, 0.08, 24).translate(0, H - 0.04, zL));
  Bl.add(M.oro, new THREE.CylinderGeometry(0.018, 0.018, H - 0.08 - (yL + 1.0), 8)
    .translate(0, (H - 0.08 + yL + 1.0) / 2, zL));
  const perfil = [
    [0.0, -0.32], [0.09, -0.3], [0.05, -0.18], [0.13, -0.05], [0.16, 0.08], [0.07, 0.2],
    [0.05, 0.42], [0.1, 0.5], [0.04, 0.62], [0.04, 0.85], [0.08, 0.92], [0.0, 1.0],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  Bl.add(M.oro, new THREE.LatheGeometry(perfil, 24).translate(0, yL, zL));
  for (const [r, dy, n] of [[1.15, 0.0, 16], [0.8, 0.36, 12], [0.46, 0.66, 8]]) {
    const yT = yL + dy;
    const copas = [];
    for (let i = 0; i < n; i++) {
      const a = ((i + (dy ? 0.5 : 0)) / n) * Math.PI * 2;
      const cx = Math.cos(a), cz = Math.sin(a);
      const brazo = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(cx * 0.1, yT - 0.06, zL + cz * 0.1),
        new THREE.Vector3(cx * r * 0.55, yT - 0.38, zL + cz * r * 0.55),
        new THREE.Vector3(cx * r, yT, zL + cz * r),
      );
      Bl.add(M.oro, new THREE.TubeGeometry(brazo, 10, 0.014, 5, false));
      const px = cx * r, pz = zL + cz * r;
      Bl.add(M.oro, new THREE.CylinderGeometry(0.035, 0.018, 0.04, 10).translate(px, yT + 0.02, pz));
      Bl.add(M.cristal, new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8).translate(px, yT + 0.085, pz));
      Bl.add(M.bombilla, new THREE.SphereGeometry(0.022, 8, 6).scale(1, 1.6, 1).translate(px, yT + 0.155, pz));
      Bl.add(M.cristal, new THREE.OctahedronGeometry(0.028).scale(1, 1.8, 1).translate(px, yT - 0.08, pz));
      copas.push([px, yT, pz]);
    }
    // guirnaldas de cuentas de cristal entre copa y copa
    for (let i = 0; i < n; i++) {
      const [x1, y1, z1] = copas[i], [x2, , z2] = copas[(i + 1) % n];
      for (let k = 1; k < 7; k++) {
        const t = k / 7;
        const cae = 0.16 * Math.sin(Math.PI * t);
        Bl.add(M.cristal, new THREE.IcosahedronGeometry(0.014, 0)
          .translate(x1 + (x2 - x1) * t, y1 - 0.03 - cae, z1 + (z2 - z1) * t));
      }
    }
  }
  Bl.add(M.oro, esferaG(0.07, 0, yL - 0.36, zL, 16));
  Bl.add(M.cristal, new THREE.OctahedronGeometry(0.06).scale(1, 2, 1).translate(0, yL - 0.52, zL));
  Bl.volcar(lampara, { sombra: false });
  grupo.add(lampara);
  cerramiento.push(lampara);
  return { apliques, lampara: { x: 0, y: yL, z: zL } };
}

// ════════════════════════ construir la sala ═══════════════════════

export function construirSala(datos, { detalle = "alto" } = {}) {
  BAJO = detalle === "bajo";
  const T = texturas(datos);
  const M = materiales(T);
  const grupo = new THREE.Group();
  grupo.name = "SALA";

  const butacas = disposicion(datos);
  const porSeccion = new Map();
  for (const b of butacas) {
    if (!porSeccion.has(b.seccion)) porSeccion.set(b.seccion, []);
    porSeccion.get(b.seccion).push(b);
  }
  const seccion = (id) => datos.secciones.find((s) => s.id === id);

  // Límites de la sala, sacados de lo que hay dentro. La pared lateral la
  // marcan el patio y el anfiteatro, no los palcos: los palcos van METIDOS en
  // ella.
  const maxZSeat = Math.max(...butacas.map((b) => b.z));
  const enPlanta = butacas.filter((b) => !b.seccion.startsWith("palco"));
  const enPalco = butacas.filter((b) => b.seccion.startsWith("palco"));
  const W = Math.max(
    Math.max(...enPlanta.map((b) => Math.abs(b.x))) + 0.95,
    enPalco.length ? Math.max(...enPalco.map((b) => Math.abs(b.x))) + 0.55 : 0,
  );
  const L = {
    W,
    F: maxZSeat + 2.6,                                     // pared del fondo
    H: Math.max(...butacas.map((b) => b.y)) + 3.6,          // techo
    zP0: -0.2, zP1: 0.7,                                    // muro de embocadura
  };

  const B = cubos();        // arquitectura: una malla por material
  const Bs = cubos();       // suelos: reciben sombra, no la dan
  const Bc = cubos();       // lo que se quita para mirar desde fuera
  const cerramiento = [];

  const instancias = construirButacas(grupo, M, porSeccion, seccion);
  const patio = construirPatio(grupo, B, Bs, M, datos, L);
  const palcos = construirPalcos(B, M, datos, porSeccion, L);
  // El anfiteatro va en mallas aparte: en la vista cenital del patio hay que
  // poder quitarlo, que si no tapa las filas de debajo.
  const Ba = cubos();
  const anfiteatro = [];
  const anf = construirAnfiteatro(Ba, Ba, M, datos, porSeccion, L, patio.altura, palcos.zLim);
  const telon = construirEmbocadura(grupo, B, M, datos, L);
  const piano = construirEscenario(grupo, B, M, T, datos, L);
  const muros = construirMuros(grupo, B, Bc, M, datos, L, patio.altura, anf, cerramiento, palcos.cajas);

  B.volcar(grupo, { nombre: "ARQUITECTURA" });
  Ba.volcar(grupo, { nombre: "ANFITEATRO", lista: anfiteatro });
  Bs.volcar(grupo, { sombra: false, nombre: "SUELOS" });
  Bc.volcar(grupo, { sombra: false, nombre: "CERRAMIENTO", lista: cerramiento });

  const porId = new Map(butacas.map((b) => [b.id, b]));
  return {
    grupo, butacas, porId, instancias, cerramiento, anfiteatro, telon, materiales: M,
    lampara: muros.lampara,
    apliques: muros.apliques,
    luces: { sofito: anf.luces, piano },
    limites: { maxX: W, maxZ: L.F, altoSala: L.H },
  };
}

/**
 * Tiñe una butaca: sólo el tapizado, la madera sigue siendo madera. Sin color,
 * la devuelve a su terciopelo.
 */
export function tenir(sala, id, color = ROJO_TERCIOPELO) {
  const b = sala.porId.get(id);
  if (!b) return false;
  const inst = sala.instancias.find((i) => i.seccion === b.malla);
  if (!inst) return false;
  inst.tapizado.setColorAt(b.indice, new THREE.Color(color));
  inst.tapizado.instanceColor.needsUpdate = true;
  return true;
}

// ════════════════════════ luz de teatro ═══════════════════════
// La escena encendida y la sala a media luz: «la función va a empezar». Las
// unidades son físicas (candelas, caída con el cuadrado de la distancia), así
// que los números dicen algo: la escena recibe unas diez veces más luz que el
// patio, como en un teatro de verdad.
//
// Pocas luces de verdad: cada una cuesta en cada píxel. El resto de bombillas
// —apliques, palcos, focos del sofito, atriles— sólo brillan; la luz difusa de
// la sala la pone el entorno que se captura de la propia sala al arrancar.
export function iluminacion(datos, sala) {
  const esc = datos.escenario;
  const g = new THREE.Group();
  g.name = "LUCES";
  const punto = (x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); g.add(o); return o; };

  const diana = punto(0, esc.embocaduraY + 1.2, -esc.fondo * 0.32);
  const alto = esc.embocaduraY + esc.embocaduraAlto + 3.2;
  // Frontales desde la sala, CERRADOS a la escena: con el haz abierto de antes
  // bañaban el marco y la bambalina, y el oro del marco se quemaba.
  const suelo = punto(0, esc.embocaduraY, -esc.fondo * 0.22);
  [[-6.5, alto, 9.5], [0, alto + 0.6, 10.5], [6.5, alto, 9.5]].forEach(([x, y, z], i) => {
    const f = new THREE.SpotLight(0xffe0b0, 1800, 45, 0.25, 0.5, 2);
    f.position.set(x, y, z);
    f.target = suelo;
    if (i === 1) {
      f.castShadow = true;
      f.shadow.mapSize.set(2048, 2048);
      f.shadow.bias = -0.0004;
      f.shadow.normalBias = 0.02;
    }
    g.add(f);
  });
  // cenital de escena y contraluz frío
  const cen = new THREE.SpotLight(0xffd7a0, 900, 22, Math.PI / 4, 0.8, 2);
  cen.position.set(0, esc.embocaduraY + 8.5, -esc.fondo * 0.35);
  cen.target = punto(0, esc.embocaduraY, -esc.fondo * 0.42);
  g.add(cen);
  const contra = new THREE.SpotLight(0x9ab8ff, 500, 25, Math.PI / 4.5, 0.7, 2);
  contra.position.set(0, esc.embocaduraY + 8, -esc.fondo * 0.85);
  contra.target = diana;
  g.add(contra);
  // Un especial sobre el piano, colgado de una vara DETRÁS de la primera
  // bambalina. Puesto en la sala, su haz atravesaba la bambalina y el marco y
  // les dejaba una mancha de luz rosa.
  if (sala && sala.luces && sala.luces.piano) {
    const p = sala.luces.piano;
    // los tres focos del pianista, sobre la banqueta (los haces de sala.js
    // salen de los mismos sitios)
    const b = p.banqueta || p, a2 = esc.embocaduraAncho / 2;
    const s = new THREE.SpotLight(0xfff0d8, 1500, 20, 0.26, 0.6, 2);
    s.position.set(b.x + 1.2, esc.embocaduraY + 7.2, -2.6);
    s.target = punto(b.x, b.y, b.z);
    g.add(s);
    for (const lado of [-1, 1]) {
      const l = new THREE.SpotLight(0xd8c7ff, 260, 22, 0.16, 0.7, 2);
      l.position.set(lado * (a2 + 1.2), esc.embocaduraY + 7.0, -4.8);
      l.target = s.target;
      g.add(l);
    }
  }
  // sala a media luz
  if (sala) {
    const l = sala.lampara;
    const pl = new THREE.PointLight(0xffc98a, 300, 30, 2);
    pl.name = "LUZ_SALA";
    pl.position.set(l.x, l.y, l.z);
    g.add(pl);
    const ap = sala.apliques;
    for (const i of [Math.floor(ap.length * 0.3) & ~1, (Math.floor(ap.length * 0.3) & ~1) + 1]) {
      if (!ap[i]) continue;
      const a = new THREE.PointLight(0xffb870, 10, 7, 2);
      a.name = "LUZ_SALA";
      a.position.copy(ap[i]);
      g.add(a);
    }
    // Los focos del sofito alumbran hacia ABAJO. Como puntos de luz a 35 cm
    // del techo quemaban el propio techo y la fila de delante.
    for (const q of (sala.luces && sala.luces.sofito) || []) {
      // 40 cd: con 70, una cabeza calva justo debajo salía naranja como un huevo
      const s = new THREE.SpotLight(0xffd2a0, 40, 10, 1.0, 0.8, 2);
      s.name = "LUZ_SALA";
      s.position.copy(q);
      s.target = punto(q.x, q.y - 3, q.z);
      g.add(s);
    }
  }
  return g;
}
