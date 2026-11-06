// ─────────────────────────────────────────────────────────────────────────────
// El recorrido.
//
// El pez deja de estar clavado en el centro y recorre el escenario por el camino
// que se generó CON las rocas: las dos cosas salen del mismo cálculo, así que
// por construcción pasa entre ellas y no las atraviesa.
//
// Lo que hace que se lea como un pez y no como una maqueta en un raíl son tres
// cosas, y ninguna es el camino en sí:
//
//   1. Las marchas. Nadie nada a velocidad constante. Hay crucero, hay un dash
//      corto y hay planeo, y la cola late más rápido o más lento con ellas.
//   2. El apoyo en las curvas. Un pez rola hacia dentro al girar, como una moto.
//      Sin eso parece un coche teledirigido.
//   3. El retardo. El morro apunta a donde va, pero llega un poco tarde: la
//      orientación persigue al camino, no lo calca.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from "three";

// Tramos del recorrido, en fracción de vuelta. Las transiciones de velocidad se
// suavizan, así que el dash entra y sale, no se enciende.
const MARCHAS = [
  { hasta: 0.17, v: 1.00, nombre: "Cruise" },
  { hasta: 0.27, v: 2.70, nombre: "Dash" },
  { hasta: 0.38, v: 0.45, nombre: "Glide" },
  { hasta: 0.58, v: 1.05, nombre: "Cruise" },
  { hasta: 0.66, v: 2.40, nombre: "Dash" },
  { hasta: 0.78, v: 0.55, nombre: "Glide" },
  { hasta: 1.00, v: 0.95, nombre: "Cruise" },
];

// 0,19 m/s = 0,52 longitudes por segundo, que es lo que nada el SoFi publicado.
// Con 0,115 iba a 0,32 L/s: mas lento que el robot real y menos vivo en pantalla.
export const V_BASE = 0.19;   // metros por segundo en crucero
const SUAVE_V = 2.2;        // lo rápido que cambia de marcha
// Medido en pantalla: con 1,45 y tope de 0,6 rad el pez se ponía casi de
// canto en las curvas y parecía que se caía. Un pez apoya, no vuelca.
const APOYO = 0.80;         // cuánto rola en las curvas
const RETARDO = 3.4;        // lo que tarda el morro en alinearse

function marchaEn(u) {
  for (const m of MARCHAS) if (u <= m.hasta) return m;
  return MARCHAS[MARCHAS.length - 1];
}

export function crearNado(puntos, grupo) {
  const curva = new THREE.CatmullRomCurve3(
    puntos.map((p) => new THREE.Vector3(...p)), true, "catmullrom", 0.5
  );
  const largo = curva.getLength();

  let u = 0;                 // posición en la vuelta, de 0 a 1
  let vel = V_BASE;
  let marcha = MARCHAS[0];
  let activo = false;
  // El alabeo y la pendiente del camino son, además de movimiento, las dos
  // órdenes que reciben los servos pectorales. Se publican para eso.
  let ultimoRol = 0;
  let ultimaTanY = 0;

  const pos = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const tanPrev = new THREE.Vector3();
  const objetivo = new THREE.Quaternion();
  const auxQ = new THREE.Quaternion();
  const ARRIBA = new THREE.Vector3(0, 1, 0);
  const _m = new THREE.Matrix4();
  const _eje = new THREE.Vector3();

  // Reposo: donde estaba el pez antes de echar a nadar. Volver ahí es lo que
  // hace que las vistas técnicas sigan siendo exactas.
  const reposoPos = grupo.position.clone();
  const reposoQuat = grupo.quaternion.clone();

  curva.getTangentAt(0, tanPrev);

  function colocar(dt) {
    curva.getPointAt(u, pos);
    curva.getTangentAt(u, tan);

    // Orientación objetivo: el morro del modelo mira a +Z, así que basta con
    // mirar hacia la tangente.
    _m.lookAt(new THREE.Vector3(0, 0, 0), tan.clone().negate(), ARRIBA);
    objetivo.setFromRotationMatrix(_m);

    // Apoyo: el giro se mide por cuánto ha cambiado la tangente, y se rola hacia
    // dentro en proporción. El signo sale del producto vectorial con la vertical.
    _eje.crossVectors(tanPrev, tan);
    const giro = _eje.length();
    const sentido = Math.sign(_eje.dot(ARRIBA)) || 1;
    const rol = -sentido * Math.min(0.30, giro * APOYO * 26) * Math.min(1.6, vel / V_BASE);
    auxQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rol);
    objetivo.multiply(auxQ);
    tanPrev.copy(tan);

    ultimoRol = rol;
    ultimaTanY = tan.y;
    grupo.position.copy(pos);
    // El retardo: no se copia la orientación, se persigue.
    grupo.quaternion.slerp(objetivo, Math.min(1, RETARDO * dt));
  }

  return {
    get activo() { return activo; },
    get marcha() { return marcha.nombre; },
    get velocidad() { return vel; },
    // Factor para el latido de la cola: más rápido nada, más rápido late.
    get ritmo() { return 0.55 + 0.85 * (vel / V_BASE); },
    get alabeo() { return ultimoRol; },
    get tangenteY() { return ultimaTanY; },
    curva,

    arrancar() {
      activo = true;
      u = 0;
      vel = V_BASE;
      curva.getTangentAt(0, tanPrev);
      colocar(1);                       // sin retardo en el primer fotograma
      grupo.quaternion.copy(objetivo);
    },

    // Dónde queda el pez cuando no nada. Lo necesita la entrada: tiene que
    // saber a dónde aterrizar.
    get reposo() { return { pos: reposoPos.clone(), quat: reposoQuat.clone() }; },

    // Deja de nadar y ya. La vuelta al centro NO se hace aquí: antes esto
    // interpolaba al pez desde donde estuviera hasta el reposo, y se veía como
    // un resbalón por el arrecife — que es justo el corte que había que quitar.
    // Ahora de la vuelta se encarga la entrada, en el configurador.
    parar() {
      activo = false;
    },

    actualizar(dt) {
      if (!activo) return;
      marcha = marchaEn(u);
      const meta = V_BASE * marcha.v;
      vel += (meta - vel) * Math.min(1, SUAVE_V * dt);
      u = (u + (vel * dt) / largo) % 1;
      colocar(dt);
    },
  };
}
