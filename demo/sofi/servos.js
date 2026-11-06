// ─────────────────────────────────────────────────────────────────────────────
// Los servos pectorales.
//
// Los huesos PECT_D y PECT_I existen en el esqueleto pero NO están animados
// (medido: 0,03 grados en todo el ciclo, frente a los 7,9 de la caudal). Así que
// no hay nada que leer: hay que gobernarlos.
//
// Y eso es mejor, porque permite gobernarlos con una ley de control de verdad en
// vez de con una animación bonita. Las pectorales de un pez no baten: son
// superficies de mando. Hacen dos cosas:
//
//   · ALABEO  — se deflectan en sentidos opuestos para apoyar el giro.
//   · CABECEO — se deflectan juntas para subir o bajar.
//
// Las dos salidas se suman y se recortan al tope del servo. El par que sale en
// el panel se calcula con teoría de perfil delgado sobre el área real de la
// pala, medida de la malla.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from "three";

const TOPE = THREE.MathUtils.degToRad(35);     // recorrido mecánico del servo
const K_ALABEO = 2.1;
const K_CABECEO = 1.5;
const SUAVE = 6.0;                             // lo que tarda en obedecer

// Par nominal de un micro servo estanco de los que se usan en esto: 2,5 kg·cm.
export const PAR_NOMINAL = 2.5 * 9.81 / 100;   // N·m

export function crearServos(raiz, areaPala, envergadura) {
  const huesos = {};
  raiz.traverse((o) => {
    if (o.isBone && (o.name === "PECT_D" || o.name === "PECT_I")) huesos[o.name] = o;
  });

  // Postura de partida: lo que el modelo traía. Todo se mide respecto a esto,
  // así que la pala en reposo marca cero y no un número raro.
  const reposo = {};
  for (const k in huesos) reposo[k] = huesos[k].quaternion.clone();

  const ang = { PECT_D: 0, PECT_I: 0 };
  const meta = { PECT_D: 0, PECT_I: 0 };
  const _q = new THREE.Quaternion();
  // El eje de cabeceo de la pala es el eje largo del cuerpo.
  const EJE = new THREE.Vector3(0, 0, 1);

  function mandar(alabeo, cabeceo) {
    meta.PECT_D = THREE.MathUtils.clamp(cabeceo + alabeo * K_ALABEO, -TOPE, TOPE);
    meta.PECT_I = THREE.MathUtils.clamp(cabeceo - alabeo * K_ALABEO, -TOPE, TOPE);
  }

  function actualizar(dt) {
    const k = Math.min(1, SUAVE * dt);
    for (const nombre in huesos) {
      ang[nombre] += (meta[nombre] - ang[nombre]) * k;
      _q.setFromAxisAngle(EJE, ang[nombre]);
      huesos[nombre].quaternion.copy(reposo[nombre]).multiply(_q);
    }
  }

  // Par hidrodinámico sobre la pala, en N·m. Perfil delgado: el coeficiente de
  // sustentación crece 2π por radián hasta que entra en pérdida, que para una
  // pala corta ronda los 15 grados. Es una estimación de ingeniería, y así se
  // declara en el panel: no es una simulación de fluidos.
  function par(nombre, U, rho) {
    const a = ang[nombre];
    const stall = THREE.MathUtils.degToRad(15);
    const cl = Math.abs(a) <= stall
      ? 2 * Math.PI * a
      : Math.sign(a) * 2 * Math.PI * stall * (1 - 0.45 * (Math.abs(a) - stall) / stall);
    const sust = 0.5 * rho * U * U * areaPala * cl;      // newtons
    const brazo = envergadura * 0.35;                    // centro de presiones
    return sust * brazo;
  }

  return {
    huesos, mandar, actualizar, par,
    get angulos() { return { PECT_D: ang.PECT_D, PECT_I: ang.PECT_I }; },
    get tope() { return TOPE; },
  };
}
