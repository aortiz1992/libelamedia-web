// ─────────────────────────────────────────────────────────────────────────────
// El banco de peces.
//
// El arrecife estaba poblado de piedra y coral, pero muerto: nada se movía
// salvo el SoFi. Un arrecife sin peces no se lee como un arrecife, se lee como
// una maqueta.
//
// Los modelos descargados NO traen huesos ni animación, así que nadar hay que
// dárselo. Y se lo damos donde cuesta menos: en el sombreador de vértices, con
// una onda que viaja a lo largo del cuerpo. Es además lo que hace un pez de
// verdad —la onda recorre el cuerpo de la cabeza a la cola, como en el propio
// SoFi— así que no es un truco para salir del paso: es el mismo fenómeno.
//
// La amplitud crece hacia la cola: el morro apenas se mueve y la aleta caudal
// barre. Al revés se ve un gusano.
import * as THREE from "three";

const ARRIBA = new THREE.Vector3(0, 1, 0);
const CERO = new THREE.Vector3();

// Cuántos y de qué tamaño. Son de fondo: lo que tienen que dar es movimiento y
// escala, no protagonismo.
const CUANTOS = 22;
const LARGO_MIN = 0.055;
const LARGO_MAX = 0.17;

export function crearBanco(gltf, raizEscena, opciones = {}) {
  const prototipos = [];
  gltf.scene.updateWorldMatrix(true, true);
  gltf.scene.traverse((o) => {
    if (o.isMesh && o.geometry) prototipos.push(o);
  });
  if (!prototipos.length) return null;

  // Orientación: el fichero puede venir en cualquier convenio —este trae el eje
  // largo en Y— así que no se da por supuesto. Se mide la caja, se busca el eje
  // más largo y se construye la corrección que lo lleva a +Z, que es hacia
  // donde mira todo lo demás en esta escena.
  const geoRef = prototipos[0].geometry;
  geoRef.computeBoundingBox();
  const b = geoRef.boundingBox;
  const dim = new THREE.Vector3().subVectors(b.max, b.min);
  const ejeLargo = dim.x > dim.y && dim.x > dim.z ? "x" : dim.y > dim.z ? "y" : "z";
  const largoCrudo = dim[ejeLargo] || 1;

  // ¿Y por qué extremo está el morro? No se puede suponer. En este modelo la
  // caja va de -1,9 a +2,7 sobre su eje largo, y el lado largo es la COLA —
  // supuesto al revés, el banco entero nadaba de espaldas.
  //
  // Se mide: un pez es ANCHO por la cabeza y se afila hasta la caudal, que es
  // alta pero delgada. Así que el extremo con más anchura lateral es el morro.
  const morroEn = buscarMorro(geoRef, ejeLargo, b);
  const correccion = new THREE.Quaternion();
  const signo = morroEn > 0 ? 1 : -1;
  if (ejeLargo === "y") {
    correccion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), signo * Math.PI / 2);
  } else if (ejeLargo === "x") {
    correccion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), signo * Math.PI / 2);
  } else if (signo < 0) {
    correccion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  }

  const grupo = new THREE.Group();
  grupo.name = "BANCO";
  raizEscena.add(grupo);

  const rnd = hacerAzar(opciones.semilla ?? 7);
  const peces = [];

  for (let i = 0; i < CUANTOS; i++) {
    const proto = prototipos[i % prototipos.length];
    const m = proto.clone();
    m.name = "PEZ_" + String(i).padStart(2, "0");
    // Material propio: cada pez lleva su fase, o el banco entero batiría a la
    // vez y parecería un solo animal repetido.
    m.material = proto.material.clone();
    m.castShadow = false;       // son pequeños y van lejos del foco de sombra
    m.receiveShadow = true;

    const largo = LARGO_MIN + (LARGO_MAX - LARGO_MIN) * Math.pow(rnd(), 1.7);
    const k = largo / largoCrudo;

    // Un nodo intermedio lleva la corrección de eje, y el de fuera la pose: así
    // la orientación por tangente se calcula en ejes de la escena sin arrastrar
    // el convenio del fichero.
    const interior = new THREE.Group();
    interior.quaternion.copy(correccion);
    interior.scale.setScalar(k);
    interior.add(m);
    const nodo = new THREE.Group();
    nodo.add(interior);
    grupo.add(nodo);

    // El material se prepara AQUÍ, antes de la onda: quien lo retoque desde
    // fuera —las cáusticas del océano— sobrescribe onBeforeCompile, y si lo
    // hace después, se lleva la onda por delante. Pasó: el banco nadaba sin
    // mover la cola porque las cáusticas le habían borrado el sombreador.
    if (opciones.alMaterial) opciones.alMaterial(m.material);
    ondaEnElSombreador(m.material, b, ejeLargo, morroEn, rnd() * Math.PI * 2);

    // Cada uno su órbita: radio, altura, inclinación, velocidad y fase. El
    // SoFi recorre un lazo de 0,95 m, así que el banco va por fuera y por
    // dentro pero nunca a su altura exacta — cruzarse con él es bueno,
    // atravesarlo no.
    peces.push({
      nodo,
      mat: m.material,
      radio: 0.45 + rnd() * 1.75,
      altura: -0.10 + rnd() * 0.42,
      vaiven: 0.015 + rnd() * 0.05,
      inclina: (rnd() - 0.5) * 0.5,
      vel: (0.09 + rnd() * 0.16) * (rnd() < 0.3 ? -1 : 1),
      fase: rnd() * Math.PI * 2,
      t: rnd() * 100,
    });
  }

  const _p = new THREE.Vector3();
  const _q = new THREE.Vector3();
  const _m = new THREE.Matrix4();

  function donde(p, t, destino) {
    const a = t * p.vel + p.fase;
    destino.set(
      Math.cos(a) * p.radio,
      p.altura + Math.sin(a * 2.3 + p.fase) * p.vaiven,
      Math.sin(a) * p.radio * (1 + p.inclina),
    );
    return destino;
  }

  function actualizar(dt) {
    for (const p of peces) {
      p.t += dt;
      donde(p, p.t, _p);
      // La orientación sale de hacia dónde va, no de un ángulo guardado: se
      // mira un instante por delante en su propia órbita.
      donde(p, p.t + 0.08, _q);
      p.nodo.position.copy(_p);
      _q.sub(_p);
      if (_q.lengthSq() > 1e-9) {
        _m.lookAt(CERO, _q.negate(), ARRIBA);
        p.nodo.quaternion.setFromRotationMatrix(_m);
      }
      const u = p.mat.userData.ondaU;
      if (u) u.value = p.t;
    }
  }

  return { grupo, actualizar, get cuantos() { return peces.length; } };
}

// ───────────────────────── la onda ─────────────────────────
function ondaEnElSombreador(material, caja, eje, morroEn, fase) {
  const min = caja.min[eje];
  const largo = Math.max(1e-6, caja.max[eje] - min);
  const u = { value: 0 };
  material.userData.ondaU = u;
  const previo = material.onBeforeCompile;
  material.onBeforeCompile = (sh) => {
    if (previo) previo(sh);
    sh.uniforms.uOndaT = u;
    sh.uniforms.uOndaFase = { value: fase };
    sh.uniforms.uOndaMin = { value: min };
    sh.uniforms.uOndaLargo = { value: largo };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>",
        "#include <common>\nuniform float uOndaT, uOndaFase, uOndaMin, uOndaLargo;")
      .replace("#include <begin_vertex>",
        `#include <begin_vertex>
         {
           // s: 0 en el morro, 1 en la cola. El eje largo del modelo es ${eje}.
           float s = clamp((transformed.${eje} - uOndaMin) / uOndaLargo, 0.0, 1.0);
           // s tiene que valer 0 en el morro y 1 en la cola, mire el modelo a
           // donde mire.
           ${morroEn > 0 ? "s = 1.0 - s;" : ""}
           // La amplitud crece hacia la cola con una potencia: el morro apenas
           // se mueve y la caudal barre. Lineal se ve un gusano.
           float amp = pow(s, 1.9) * uOndaLargo * 0.16;
           float onda = sin(s * 5.2 - uOndaT * 6.5 + uOndaFase);
           transformed.${eje === "x" ? "z" : "x"} += onda * amp;
         }`);
  };
  material.needsUpdate = true;
}

// Azar repetible: el banco tiene que salir igual en cada carga, o cada vez que
// se recargue para revisar algo el arrecife seria otro.
function hacerAzar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}


// Por qué extremo del eje largo está la cabeza. Un pez es ancho por delante y
// se afila hasta la caudal —que es alta, pero delgada— así que se compara la
// anchura LATERAL de los dos extremos: gana la cabeza.
function buscarMorro(geo, eje, caja) {
  const pos = geo.attributes.position;
  const lateral = eje === "x" ? "y" : "x";
  const min = caja.min[eje];
  const largo = Math.max(1e-6, caja.max[eje] - min);
  let anchoBajo = 0, anchoAlto = 0;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = (v[eje] - min) / largo;
    const w = Math.abs(v[lateral]);
    if (t < 0.22) anchoBajo = Math.max(anchoBajo, w);
    else if (t > 0.78) anchoAlto = Math.max(anchoAlto, w);
  }
  return anchoAlto > anchoBajo ? 1 : -1;
}
