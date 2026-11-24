// ─────────────────────────────────────────────────────────────────────────────
// De fichero de sala a lista de butacas.
//
// Esto es el corazón de BUTACA y por eso no toca three.js: es aritmética. Al no
// depender del navegador se puede comprobar en Node, medir y discutir con
// números antes de que exista una sola malla.
//
// Ejes: el público mira hacia −Z, el escenario está en Z negativo, y el origen
// es el centro del borde del escenario a la altura del suelo del patio.
// `01_SALAS/ESQUEMA.md` lo explica entero.
//
// ── Segunda versión, después de que Antonio viera «sillas mal puestas» ──
//
// La primera curvaba las filas AL REVÉS: el centro de curvatura quedaba detrás
// del público, los extremos de cada fila se alejaban del escenario y las
// butacas de los lados giraban hacia la pared. La A-1 apuntaba 64° lejos de la
// escena. Además las filas no eran concéntricas —mismo radio, desplazado hacia
// atrás— así que el paso entre filas se estrechaba en las puntas de 92 a 83 cm;
// los pasillos se definían como fracción de la fila y saltaban media butaca de
// una fila a otra; y las columnas caían encima de cuatro butacas.
//
// Ahora es como se diseña un patio de verdad:
//   · filas CONCÉNTRICAS con el centro hacia la escena: los extremos abrazan el
//     escenario y cada butaca mira a ese centro;
//   · los pasillos son LÍNEAS RECTAS en planta, a una X fija;
//   · los bloques se llenan con las butacas que quepan, centradas en su hueco;
//   · donde hay una columna no se pone butaca, como en cualquier teatro viejo.

// Las letras de fila saltan la Ñ, como en cualquier teatro español.
const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function letraFila(i, desde = "A") {
  const base = LETRAS.indexOf(desde.toUpperCase());
  const n = base + i;
  if (n < LETRAS.length) return LETRAS[n];
  return LETRAS[Math.floor(n / LETRAS.length) - 1] + LETRAS[n % LETRAS.length];
}

// ───────────────────────── geometría de una fila ─────────────────────────────

// Centro de curvatura de una sección en abanico: en el eje, hacia la escena.
// `radio0` es el radio de la PRIMERA fila; las siguientes crecen de paso en
// paso, así que todas son concéntricas y el hueco entre filas es el mismo en el
// centro que en las puntas.
export function centroCurva(sec) {
  return sec.z0 - sec.radio0;
}

export function radioFila(sec, f) {
  return sec.radio0 + f * sec.pasoFila;
}

// De una X en planta a longitud de arco sobre la fila. Los pasillos y los
// bordes se declaran en X —es lo que se mide en una sala— pero las butacas se
// reparten a lo largo del arco.
function xAArco(x, r) {
  if (!isFinite(r)) return x;
  const t = Math.max(-1, Math.min(1, x / r));
  return r * Math.asin(t);
}

// Semiancho de la fila: el patio se abre hacia el fondo.
export function semiancho(sec, f) {
  return sec.semiancho0 + (sec.ensanche || 0) * f;
}

/**
 * Bloques de una fila en longitud de arco: intervalos [s1, s2] separados por
 * los pasillos. Simétricos por construcción, porque pasillos y bordes se
 * declaran en pares ±X.
 */
function bloquesFila(sec, r, f) {
  const borde = xAArco(semiancho(sec, f), r);
  const media = (sec.anchoPasillo || 0) / 2;
  const cortes = (sec.pasillosX || []).map((x) => xAArco(x, r)).sort((a, b) => a - b);

  const bloques = [];
  let desde = -borde;
  for (const c of cortes) {
    bloques.push([desde, c - media]);
    desde = c + media;
  }
  bloques.push([desde, borde]);
  return bloques.filter(([a, b]) => b - a > sec.pasoButaca * 0.9);
}

/** Reparte butacas dentro de un bloque: las que quepan, centradas en él. */
function butacasEnBloque([a, b], paso) {
  const n = Math.floor((b - a + 1e-6) / paso);
  const ini = a + (b - a - n * paso) / 2 + paso / 2;
  return Array.from({ length: n }, (_, i) => ini + i * paso);
}

// ───────────────────────── colocar una butaca ────────────────────────────────

function enAbanico(sec, s, f) {
  const r = radioFila(sec, f);
  const phi = s / r;
  return {
    x: r * Math.sin(phi),
    z: centroCurva(sec) + r * Math.cos(phi),
    // La butaca mira al centro de curvatura, o sea a la escena. Con la
    // convención de three.js el frente es (−sen g, −cos g); para apuntar al
    // centro hace falta g = φ. La primera versión ponía −φ y miraba fuera.
    giro: phi,
  };
}

function enRecta(sec, s, f) {
  return { x: s, z: sec.z0 + f * sec.pasoFila, giro: 0 };
}

// Una butaca choca con una columna si el eje de la columna cae a menos de su
// radio del rectángulo que ocupa la butaca.
const MEDIO_ANCHO = 0.25, MEDIO_FONDO = 0.27;
function chocaConColumna(x, z, giro, y, columnas) {
  for (const c of columnas) {
    if (y > c.alto) continue;
    const co = Math.cos(giro), si = Math.sin(giro);
    const lx = (c.x - x) * co - (c.z - z) * si;
    const lz = (c.x - x) * si + (c.z - z) * co;
    const dx = Math.max(Math.abs(lx) - MEDIO_ANCHO, 0);
    const dz = Math.max(Math.abs(lz) - MEDIO_FONDO, 0);
    if (Math.hypot(dx, dz) < c.radio + 0.04) return true;
  }
  return false;
}

/**
 * Todas las butacas de la sala.
 *
 * Cada una: { id, seccion, fila, numero, x, y, z, giro, ojo:{x,y,z} }
 * `y` es el suelo de su fila; `ojo` es desde donde se mira. La lista lleva
 * además `suprimidas`: las que no se ponen porque ahí hay una columna.
 */
export function disposicion(datos) {
  const alturaOjo = datos.alturaOjo ?? 1.15;
  const columnas = (datos.obstaculos || []).filter((o) => o.tipo === "columna");
  const fuera = [];
  const suprimidas = [];
  // A dónde mira una butaca de palco: al centro de la escena.
  const zMira = -((datos.escenario && datos.escenario.fondo) || 8) * 0.25;

  for (const sec of datos.secciones) {
    // ── Palcos ──
    // Un palco es una caja pegada a la pared: las filas van PARALELAS a la
    // pared (la A junto al antepecho, la B detrás, hacia el muro) y cada
    // butaca se gira sola hacia la escena. La versión anterior giraba la fila
    // entera 38°: la fila de atrás se salía de la caja por el tabique y sus
    // butacas miraban a una pared.
    if (sec.tipo === "palco") {
      const lado = Math.sign(sec.centroX);
      const nA = sec.butacas0;
      for (let f = 0; f < sec.filas; f++) {
        const etiqueta = letraFila(f, sec.etiquetaDesde || "A");
        const x = sec.centroX + lado * f * sec.pasoFila;
        const y = (sec.y0 || 0) + f * (sec.rake || 0);
        // Las filas de atrás pueden llevar menos butacas, y van alineadas al
        // FONDO del palco (lejos de la escena): la que quedaría pegada al
        // tabique del lado de la escena sólo vería ese tabique.
        const n = (sec.butacasPorFila && sec.butacasPorFila[f]) || nA;
        for (let i = 0; i < n; i++) {
          // la 1 es la más cercana a la escena
          const z = sec.z0 + ((nA - 1) / 2 - (n - 1 - i)) * sec.pasoButaca;
          const giro = Math.atan2(x, z - zMira);
          const id = `${sec.id}-${etiqueta}-${i + 1}`;
          if (chocaConColumna(x, z, giro, y, columnas)) { suprimidas.push(id); continue; }
          fuera.push({
            id, seccion: sec.id, fila: etiqueta, numero: i + 1,
            x, y, z, giro,
            ojo: { x, y: y + alturaOjo, z },
          });
        }
      }
      continue;
    }

    // ── Patio y anfiteatro: filas en abanico (o rectas si radio0 = 0) ──
    const abanico = (sec.radio0 || 0) > 0;

    for (let f = 0; f < sec.filas; f++) {
      const y = (sec.y0 || 0) + f * (sec.rake || 0);
      const etiqueta = letraFila(f, sec.etiquetaDesde || "A");
      const r = abanico ? radioFila(sec, f) : Infinity;
      const posiciones = bloquesFila(sec, r, f).flatMap((bl) => butacasEnBloque(bl, sec.pasoButaca));

      posiciones.forEach((s, i) => {
        const { x, z, giro } = abanico ? enAbanico(sec, s, f) : enRecta(sec, s, f);
        const id = `${sec.id}-${etiqueta}-${i + 1}`;

        // Donde hay columna no hay butaca. Se conserva la numeración —en un
        // teatro la butaca suprimida no renumera la fila— y se apunta.
        if (chocaConColumna(x, z, giro, y, columnas)) { suprimidas.push(id); return; }

        fuera.push({
          id, seccion: sec.id, fila: etiqueta, numero: i + 1,
          x, y, z, giro,
          ojo: { x, y: y + alturaOjo, z },
        });
      });
    }
  }
  fuera.suprimidas = suprimidas;
  return fuera;
}

// ───────────────────────── lo que se le enseña al espectador ─────────────────

export function distanciaAEscena(butaca, datos) {
  const e = datos.escenario;
  const cy = e.embocaduraY + e.embocaduraAlto / 2;
  const o = butaca.ojo;
  return Math.hypot(o.x, o.y - cy, o.z);
}

/**
 * Campo visual: ángulo horizontal que abarca la embocadura desde la butaca.
 * Se mide ojo a ojo con los dos bordes del hueco de escena.
 *
 * El segundo argumento del atan2 es la PROFUNDIDAD hacia el escenario, +o.z. La
 * primera versión ponía -o.z y daba 260° y 333°: magnitud buena y signo malo,
 * la firma de un cuadrante equivocado.
 */
export function campoVisual(butaca, datos) {
  const m = datos.escenario.embocaduraAncho / 2;
  const o = butaca.ojo;
  const a = Math.atan2(-m - o.x, o.z);
  const b = Math.atan2(m - o.x, o.z);
  return (Math.abs(b - a) * 180) / Math.PI;
}

export function descentrado(butaca) {
  return { metros: Math.abs(butaca.ojo.x), lado: butaca.ojo.x < 0 ? "izquierda" : "derecha" };
}

/**
 * La etiqueta cualitativa, sacada de los números. Los cortes parten de la zona
 * cómoda de SMPTE/THX para cine —36° a 60° de campo— ajustada a que en teatro
 * se mira una escena viva.
 */
export function etiqueta(butaca, datos) {
  const campo = campoVisual(butaca, datos);
  const d = descentrado(butaca);
  const lejos = distanciaAEscena(butaca, datos);

  if (campo > 70) return { clave: "muy-cerca", texto: "MUY CERCA" };
  if (d.metros > datos.escenario.embocaduraAncho * 0.42) return { clave: "lateral", texto: "MUY LATERAL" };
  if (campo >= 40 && campo <= 62 && d.metros < 2.5) return { clave: "optima", texto: "BUTACA ÓPTIMA" };
  if (lejos > 22) return { clave: "lejos", texto: "ESCENA COMPLETA" };
  return { clave: "buena", texto: "BUENA VISTA" };
}

export function datosButaca(butaca, datos) {
  const d = descentrado(butaca);
  return {
    id: butaca.id,
    fila: butaca.fila,
    numero: butaca.numero,
    distancia: +distanciaAEscena(butaca, datos).toFixed(1),
    campo: Math.round(campoVisual(butaca, datos)),
    descentrado: +d.metros.toFixed(1),
    lado: d.lado,
    etiqueta: etiqueta(butaca, datos),
  };
}
