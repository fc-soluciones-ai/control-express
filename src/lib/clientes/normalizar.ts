/**
 * Lectura de la base de clientes del POS.
 *
 * Estas funciones son puras y viven aqui, fuera de los servicios, porque las
 * usan dos cosas que no se parecen: el script que importa los archivos del
 * POS y la aplicacion cuando alguien corrige un dato a mano. Si la regla de
 * lo que es un telefono valido viviera en el script, la pantalla aceptaria
 * numeros que el importador rechaza, y nadie entenderia por que.
 *
 * Nada de lo que hay aqui escribe en la base ni toca la red.
 */

import {
  DIRECCION_SIRVE,
  type CalidadDireccion,
  type EstadoCliente,
  type OrigenTelefono,
} from '@/types/enums';

// -----------------------------------------------------------------------------
// Telefonos
// -----------------------------------------------------------------------------

/**
 * Un telefono de Costa Rica tiene ocho digitos y empieza con 2, 4, 6, 7 u 8.
 *
 * 2 y 4 son fijos, 6, 7 y 8 son celulares. Los demas prefijos son servicios
 * (el 1 de operadora, el 9 de cobro revertido) y no son de una casa.
 */
const TELEFONO_CR = /^[24678]\d{7}$/;

/** Un telefono suelto dentro de un texto mas largo. */
const TELEFONO_EN_TEXTO = /(?<!\d)([24678]\d{7})(?!\d)/g;

export function esTelefonoCR(numero: string): boolean {
  return TELEFONO_CR.test(numero);
}

/** A un fijo no le llega WhatsApp, y eso decide a quien se le puede escribir. */
export function esCelular(numero: string): boolean {
  return /^[678]/.test(numero);
}

const soloDigitos = (valor: string) => valor.replace(/\D/g, '');

/**
 * Reconstruye un telefono del formato viejo de Costa Rica.
 *
 * Hasta marzo de 2008 los numeros tenian siete digitos. En la migracion los
 * fijos ganaron un 2 adelante y los celulares un 8: 441-2345 paso a ser
 * 2441-2345. En esta base quedaron 1.252 numeros sin migrar, casi todos fijos
 * de Alajuela que empiezan con 4.
 *
 * Devuelve cadena vacia para los que empiezan con 1 o 7, que en 2008 no
 * existian como prefijo de siete digitos: ahi no hay regla que aplicar y lo
 * tiene que ver una persona.
 */
export function reconstruirFormatoViejo(sieteDigitos: string): string {
  if (!/^\d{7}$/.test(sieteDigitos)) return '';
  if (/^[2456]/.test(sieteDigitos)) return `2${sieteDigitos}`;
  if (/^[389]/.test(sieteDigitos)) return `8${sieteDigitos}`;
  return '';
}

export interface TelefonoLeido {
  numero: string;
  origen: OrigenTelefono;
  /** El valor tal como estaba en el archivo. Se guarda para poder desmentirlo. */
  comoVenia: string;
}

/**
 * Interpreta lo que haya en una celda de telefono.
 *
 * Devuelve null cuando no hay nada que rescatar. Lo que se encontro en esta
 * base, por orden de frecuencia: numeros bien escritos, numeros de siete
 * digitos sin migrar, cedulas juridicas (que empiezan con 310), cedulas
 * fisicas de nueve digitos, nombres de provincias, y la palabra
 * "BLANCO NO USAR".
 */
export function leerTelefono(valor: string | null | undefined): TelefonoLeido | null {
  const comoVenia = (valor ?? '').trim();
  if (comoVenia === '') return null;

  let digitos = soloDigitos(comoVenia);
  if (digitos === '' || /^0+$/.test(digitos)) return null;

  // El +506 o el 506 pegado adelante.
  if (digitos.length === 11 && digitos.startsWith('506')) digitos = digitos.slice(3);

  if (TELEFONO_CR.test(digitos)) return { numero: digitos, origen: 'DIRECTO', comoVenia };

  if (digitos.length === 7) {
    const reconstruido = reconstruirFormatoViejo(digitos);
    return reconstruido ? { numero: reconstruido, origen: 'FORMATO_VIEJO', comoVenia } : null;
  }

  // "84498775   84498775" o "4878031MIRIAM": el numero esta ahi, con ruido.
  const [primero] = telefonosEnTexto(comoVenia);
  if (primero) return { numero: primero, origen: 'EXTRAIDO_TEXTO', comoVenia };

  return null;
}

/**
 * Busca telefonos escritos a mano dentro de un texto que no es un telefono.
 *
 * Alguien escribio "83858634 RECIBE JESSICA COYOL INDOPARK" en el campo de la
 * direccion. Son 134 casos en la base, y para 19 clientes es el unico numero
 * que existe. Se rescatan, pero marcados: un numero que estaba en el lugar
 * equivocado bien puede ser el del vecino que recibe los paquetes.
 */
export function telefonosEnTexto(texto: string): string[] {
  const hallados: string[] = [];
  for (const coincidencia of texto.matchAll(TELEFONO_EN_TEXTO)) {
    const numero = coincidencia[1];
    if (numero && !hallados.includes(numero)) hallados.push(numero);
  }
  return hallados;
}

/** Para mostrar: 8888-8888 se lee de un golpe, 88888888 no. */
export function telefonoBonito(numero: string): string {
  return TELEFONO_CR.test(numero) ? `${numero.slice(0, 4)}-${numero.slice(4)}` : numero;
}

/** Como lo quiere WhatsApp: codigo de pais sin el mas. */
export function telefonoInternacional(numero: string): string {
  return `506${numero}`;
}

// -----------------------------------------------------------------------------
// Direcciones
// -----------------------------------------------------------------------------

/**
 * Que tanto sirve una direccion escrita.
 *
 * Se mide por el largo, que suena burdo y no lo es: en Costa Rica no hay
 * numero de casa, asi que una direccion util es una cadena de referencias
 * ("200 metros oeste de la iglesia, porton verde, segunda casa"). Eso no cabe
 * en doce letras. Lo que mide el largo no es la calidad de la redaccion, es
 * cuantas referencias puso quien la escribio.
 *
 * Los cortes salieron de mirar la base real: debajo de 12 letras lo unico que
 * hay son provincias y cantones ("ALAJUELA", "COYOL", "LOL"); de 25 para
 * arriba aparece la primera referencia concreta.
 */
export function calidadDeDireccion(texto: string | null | undefined): CalidadDireccion {
  const limpio = (texto ?? '').replace(/\s+/g, ' ').trim();
  // "1", "0", "0, 0": el POS obliga a llenar el campo y alguien puso algo.
  if (limpio === '' || /^[0-9\s,.]*$/.test(limpio)) return 'VACIA';
  if (limpio.length < 12) return 'SOLO_LUGAR';
  if (limpio.length < 25) return 'POBRE';
  if (limpio.length < 45) return 'PASABLE';
  return 'DETALLADA';
}

export function direccionSirve(calidad: CalidadDireccion): boolean {
  return DIRECCION_SIRVE.includes(calidad);
}

/**
 * Junta los pedazos de direccion del archivo de domicilio en un solo texto.
 *
 * El POS reparte la direccion en calle, dos cruzamientos, referencia y estado,
 * y los usuarios llenan los que les parecen. Se quitan los valores de relleno
 * ("0", "00") y los repetidos, porque es comun que la misma frase aparezca en
 * dos campos.
 */
export function juntarDireccion(partes: Array<string | null | undefined>): string {
  const limpias = partes
    .map((p) => (p ?? '').trim())
    .filter((p) => p !== '' && !/^[0]+$/.test(p));
  return [...new Set(limpias)].join(', ').replace(/\s+/g, ' ').trim();
}

/**
 * Elige entre la direccion del archivo general y la del de domicilio.
 *
 * No son copias: en 1.694 clientes el de domicilio dejo la calle en "1" y el
 * general trae el texto bueno. Gana la mas descriptiva, y las dos se guardan.
 */
export function mejorDireccion(general: string, domicilio: string): string {
  const a = general.replace(/\s+/g, ' ').trim();
  const b = domicilio.replace(/\s+/g, ' ').trim();
  if (calidadDeDireccion(b) === 'VACIA') return a;
  if (calidadDeDireccion(a) === 'VACIA') return b;
  return b.length >= a.length ? b : a;
}

// -----------------------------------------------------------------------------
// Nombres
// -----------------------------------------------------------------------------

/**
 * Nombre sin acentos, en mayusculas y sin signos.
 *
 * Sirve para buscar y para detectar repetidos: "José Pérez" y "JOSE PEREZ"
 * son el mismo cliente escrito por dos cajeros distintos.
 */
export function nombreBuscable(nombre: string | null | undefined): string {
  return (nombre ?? '')
    .normalize('NFD')
    // El rango va escapado a proposito: son los acentos ya separados de su
    // letra, y escritos tal cual quedan invisibles en el editor.
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * El primer nombre, escrito como se le escribe a una persona.
 *
 * En el POS los nombres estan en mayusculas ("MARIA RODRIGUEZ") porque asi los
 * teclea la caja. Saludar con "Hola MARIA" se lee como un grito, y es justo el
 * tono de los mensajes masivos que la gente denuncia.
 *
 * Devuelve cadena vacia cuando no hay a quien saludar: una ficha que se llama
 * "3101007589 DIPO S.A." no tiene primer nombre, y entonces el saludo se omite
 * en vez de quedar raro.
 */
export function primerNombre(nombre: string | null | undefined): string {
  const primera = (nombre ?? '').trim().split(/\s+/)[0] ?? '';
  // Nada que empiece con un digito es el nombre de una persona.
  if (primera.length < 2 || /^\d/.test(primera)) return '';
  return primera.charAt(0).toUpperCase() + primera.slice(1).toLowerCase();
}

/**
 * Un nombre de una sola palabra no identifica a nadie.
 *
 * "DANIEL" esta en seis fichas distintas. Si ademas no comparte telefono ni
 * direccion con las otras, no hay forma de saber si son la misma persona, y
 * por eso esas fichas no se unen nunca solas.
 */
export function nombreEsAmbiguo(nombre: string): boolean {
  const limpio = nombreBuscable(nombre);
  return limpio === '' || limpio.split(' ').length === 1;
}

// -----------------------------------------------------------------------------
// Estado del cliente
// -----------------------------------------------------------------------------

export interface DatosParaEstado {
  nombre: string;
  telefono: string | null;
  origenTelefono: OrigenTelefono | null;
  calidadDireccion: CalidadDireccion;
  telefonoCompartido: boolean;
}

/**
 * En que punto esta un cliente para poder pedirle la ubicacion.
 *
 * El orden de las preguntas es el orden en que hay que resolverlas, y cada
 * cliente cae en el primer problema que tenga. Un cliente sin telefono y con
 * direccion mala sale como SIN_TELEFONO, porque conseguir el telefono es lo
 * que desbloquea todo lo demas.
 */
export function estadoDelCliente(datos: DatosParaEstado): EstadoCliente {
  if (nombreBuscable(datos.nombre) === '') return 'SIN_NOMBRE';
  if (!datos.telefono) return 'SIN_TELEFONO';
  // Un numero reconstruido o rescatado de un texto puede ser de otra casa.
  if (datos.origenTelefono === 'FORMATO_VIEJO') return 'TELEFONO_POR_CONFIRMAR';
  if (datos.origenTelefono === 'EXTRAIDO_TEXTO') return 'TELEFONO_POR_CONFIRMAR';
  if (datos.origenTelefono === 'ESCONDIDO_DIRECCION') return 'TELEFONO_POR_CONFIRMAR';
  // Mandar el enlace a un numero que esta en cuatro fichas le llega cuatro
  // veces a la misma persona, y cada copia habla de un cliente distinto.
  if (datos.telefonoCompartido) return 'TELEFONO_COMPARTIDO';
  if (!esCelular(datos.telefono)) return 'SOLO_FIJO';
  if (!direccionSirve(datos.calidadDireccion)) return 'DIRECCION_POBRE';
  return 'LISTO';
}
