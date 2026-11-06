// ─────────────────────────────────────────────────────────────────────────────
// La física.
//
// Todo lo que sale en los paneles se calcula aquí, y se calcula a partir de dos
// cosas: la geometría medida sobre la malla —1,143 l desplazados, 896 cm² de
// superficie mojada— y el movimiento real de la animación. Nada está escrito a
// mano para que quede bonito.
//
// Esto importa porque el configurador afirma cosas. Si dice 1,84 bar tiene que
// ser 1,84 bar, no un número que sube cuando mueves un deslizador.
// ─────────────────────────────────────────────────────────────────────────────

// Coeficiente de compresibilidad del conjunto, por bar. Un casco rígido con
// piezas de silicona y espuma de célula cerrada: ni acero ni globo. Es el único
// valor de aquí que no sale de una medida, así que va declarado y etiquetado
// como estimación allí donde se usa.
const COMPRESIBILIDAD = 1.1e-3;

// Lo que tarda la bomba en hacer una corrección completa de flotabilidad.
const SEGUNDOS_CORRECCION = 4.0;

export function hidrostatica(profundidad, h) {
  const rho = h.densidad_kg_m3, g = h.gravedad;
  // Presión manométrica y absoluta. 1 bar = 1e5 Pa.
  const manometrica = (rho * g * profundidad) / 1e5;
  const absoluta = h.presion_atm_bar + manometrica;

  const volumen = h.volumen_l / 1000;             // m³
  // Empuje de Arquímedes sobre el volumen desplazado.
  const empuje = rho * g * volumen;               // newtons
  const masaNeutra = empuje / g;                  // kg para flotar neutro

  // Al bajar, el conjunto se comprime y desplaza menos: hay que compensar.
  const perdida = volumen * COMPRESIBILIDAD * manometrica;   // m³
  const compensacion = perdida * 1e6;             // mililitros

  // Trabajo de bombear ese volumen contra la presión absoluta, y la potencia si
  // la corrección se hace en cuatro segundos.
  const trabajo = absoluta * 1e5 * perdida;       // julios
  const potencia = trabajo / SEGUNDOS_CORRECCION;

  return { manometrica, absoluta, empuje, masaNeutra, compensacion, trabajo, potencia };
}

// Atenuación de la luz con la profundidad. Agua costera clara: el coeficiente
// de extinción ronda 0,09 por metro. El rojo se va mucho antes que el azul, que
// es por lo que a quince metros todo es azul aunque siga habiendo luz.
export function luz(profundidad) {
  const total = Math.exp(-0.09 * profundidad);
  const rojo = Math.exp(-0.42 * profundidad);
  const verde = Math.exp(-0.14 * profundidad);
  const azul = Math.exp(-0.035 * profundidad);
  return { total, rojo, verde, azul };
}

export function nado(U, L, f, amplitud, h) {
  const nu = h.viscosidad_cinematica, rho = h.densidad_kg_m3;

  // Longitudes por segundo: la medida con la que se comparan nadadores de
  // tamaños distintos. Un pez robótico blando ronda media longitud por segundo.
  const longitudes = L > 0 ? U / L : 0;

  // Reynolds: relación entre inercia y viscosidad. Dice en qué régimen nada.
  const re = (U * L) / nu;

  // Strouhal: la cifra que de verdad distingue a un nadador eficiente. Los
  // peces y los cetáceos se agrupan entre 0,2 y 0,4; fuera de ahí se gasta
  // energía en revolver agua en vez de en avanzar.
  const st = U > 1e-4 ? (f * amplitud) / U : 0;

  // Arrastre. Fricción de placa plana en régimen turbulento, corregida por la
  // forma del cuerpo. Es una estimación de ingeniería, no una simulación: va
  // etiquetada como tal en el panel.
  const cf = re > 1 ? 0.074 / Math.pow(re, 0.2) : 0;
  const cd = cf * 1.25;                           // factor de forma del casco
  const superficie = h.superficie_cm2 / 10000;    // cm² -> m²
  const arrastre = 0.5 * rho * U * U * cd * superficie;

  // En nado estacionario el empuje iguala al arrastre, así que la potencia útil
  // es arrastre por velocidad.
  const potencia = arrastre * U;

  return { longitudes, re, st, cd, arrastre, potencia };
}

// Dónde cae el Strouhal respecto a la franja eficiente. Sirve para pintarlo.
export function juicioStrouhal(st) {
  if (st <= 0) return { texto: "—", dentro: false };
  if (st < 0.20) return { texto: "low", dentro: false };
  if (st > 0.40) return { texto: "high", dentro: false };
  return { texto: "efficient", dentro: true };
}

export function regimen(re) {
  if (re < 2000) return "laminar";
  if (re < 1e5) return "transitional";
  return "turbulent";
}
