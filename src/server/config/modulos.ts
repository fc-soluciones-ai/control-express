/**
 * Los modulos de la aplicacion, en un solo lugar.
 *
 * LA APLICACION MADRE Y SUS PESTANAS
 *
 * Esto empezo siendo una sola cosa: el cierre de caja de la pizzeria. Esa
 * parte salio completa. Lo que queda son tres problemas distintos: la flota de
 * motos y los repartidores, la base de clientes con sus ubicaciones, y el
 * pedido desde que entra hasta que llega. Tratarlos como una lista plana de
 * doce botones hace que nadie encuentre nada.
 *
 * Asi que hay modulos, y cada modulo tiene sus pantallas. El de arriba se
 * elige una vez y las pestanas de abajo cambian.
 *
 * ENTREGAS ES AHORA EL MODULO IMPORTANTE
 *
 * Es el que responde la pregunta por la que existe el proyecto: cuantos
 * pedidos estan atrasados en este momento. Las motos y los clientes son el
 * sostenimiento; esto es la razon.
 *
 * POR QUE CLIENTES NO HABLA CON ENTREGAS TODAVIA
 *
 * Son dos problemas de tamanos distintos. Entregas ya lee la base del POS cada
 * treinta segundos y no se puede romper. Clientes arranca con diez mil fichas
 * sucias que hay que limpiar durante semanas. Se tocan en un solo punto, que
 * ya existe: el pedido trae la clave del cliente y, cuando esa clave calza con
 * una ficha nuestra, el tablero muestra el nombre y la direccion. Nada mas.
 *
 * ESTE ARCHIVO ES LA UNICA LISTA
 *
 * La barra de pestanas, los accesos del tablero y el tablero mismo lo leen de
 * aqui. Antes la lista de accesos vivia dentro del componente de la barra, y
 * agregar una pantalla significaba acordarse de tres lugares.
 */

import type { Permiso } from '@/server/permisos';

export interface PantallaDeModulo {
  href: string;
  etiqueta: string;
  /** Sin permiso, la pantalla no se pinta. La de destino igual lo comprueba. */
  permiso: Permiso;
}

export interface Modulo {
  clave: 'ENTREGAS' | 'FLOTA' | 'CLIENTES';
  nombre: string;
  icono: string;
  /** Una linea que diga de que se trata, para la pantalla de inicio. */
  descripcion: string;
  /** A donde lleva la pestana del modulo. */
  inicio: string;
  /** Con que empieza la direccion cuando se esta dentro del modulo. */
  rutas: string[];
  pantallas: PantallaDeModulo[];
  /** Todavia no existe: la pestana se ve, pero apagada y sin enlace. */
  enConstruccion?: boolean;
}

export const MODULOS: readonly Modulo[] = [
  {
    clave: 'ENTREGAS',
    nombre: 'Entregas',
    icono: '🛵',
    descripcion:
      'Los pedidos sin entregar y cuanto lleva esperando cada cliente, en vivo desde el POS.',
    inicio: '/entregas',
    rutas: ['/', '/entregas', '/historial'],
    pantallas: [
      { href: '/entregas', etiqueta: '🛵 Tablero de entregas', permiso: 'OPERACION' },
      { href: '/historial', etiqueta: '📜 Historial', permiso: 'OPERACION' },
    ],
  },
  {
    clave: 'FLOTA',
    nombre: 'Flota',
    icono: '🏍️',
    descripcion: 'Las motos, sus repartidores, el mantenimiento y los gastos de taller.',
    inicio: '/motos',
    rutas: ['/motos', '/repartidores', '/configuracion'],
    pantallas: [
      { href: '/motos', etiqueta: '🏍️ Motos', permiso: 'FLOTA' },
      { href: '/repartidores', etiqueta: '👥 Repartidores', permiso: 'REPARTIDORES' },
      { href: '/configuracion', etiqueta: '⚙️ Configuracion', permiso: 'USUARIOS' },
    ],
  },
  {
    clave: 'CLIENTES',
    nombre: 'Clientes',
    icono: '📍',
    descripcion:
      'Las fichas del POS, limpias, y la ubicacion exacta de cada casa pedida por WhatsApp.',
    inicio: '/clientes',
    rutas: ['/clientes'],
    pantallas: [{ href: '/clientes', etiqueta: '📍 Base y ubicaciones', permiso: 'CLIENTES' }],
  },
];

/** En que modulo esta una direccion. Gana el prefijo mas largo que calce. */
export function moduloDeLaRuta(ruta: string): Modulo {
  let elegido = MODULOS[0] as Modulo;
  let largo = -1;
  for (const modulo of MODULOS) {
    for (const prefijo of modulo.rutas) {
      // La raiz calza con todo, asi que solo cuenta si la ruta ES la raiz.
      const calza =
        prefijo === '/' ? ruta === '/' : ruta === prefijo || ruta.startsWith(`${prefijo}/`);
      if (calza && prefijo.length > largo) {
        elegido = modulo;
        largo = prefijo.length;
      }
    }
  }
  return elegido;
}
