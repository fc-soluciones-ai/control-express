/**
 * Los modulos de la aplicacion, en un solo lugar.
 *
 * LA APLICACION MADRE Y SUS PESTANAS
 *
 * Esto empezo siendo una sola cosa: el cierre de caja de la pizzeria. Despues
 * entraron la flota de motos y los repartidores, y ahora entra la base de
 * clientes, que no tiene nada que ver con el turno de la noche. Tratar todo
 * eso como una lista plana de doce botones hace que nadie encuentre nada.
 *
 * Asi que hay modulos, y cada modulo tiene sus pantallas. El de arriba se
 * elige una vez y las pestanas de abajo cambian.
 *
 * POR QUE CLIENTES NO HABLA CON EXPRESS TODAVIA
 *
 * Son dos problemas distintos y de tamanos distintos. Express ya opera todas
 * las noches y no se puede romper. Clientes arranca de cero con diez mil
 * fichas sucias que hay que limpiar durante semanas. Unirlos hoy significaria
 * que un error en la limpieza de direcciones apaga la caja.
 *
 * Se unen en el tercer modulo, Entregas: ahi el pedido de un cliente con
 * ubicacion buena se le asigna a un repartidor con moto. Ese es el unico
 * punto donde los dos mundos se tocan, y por eso es su propio modulo y no un
 * agregado de ninguno de los dos.
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
  clave: 'EXPRESS' | 'CLIENTES' | 'ENTREGAS';
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
    clave: 'EXPRESS',
    nombre: 'Express',
    icono: '🏍️',
    descripcion: 'La operacion de cada noche: caja, turnos, repartidores y flota de motos.',
    inicio: '/',
    rutas: ['/', '/importar', '/cierre', '/historial', '/reportes', '/repartidores', '/motos', '/configuracion'],
    pantallas: [
      { href: '/importar', etiqueta: '📁 Importar Excel', permiso: 'IMPORTAR' },
      { href: '/cierre', etiqueta: '📋 Cierre multiple', permiso: 'CAJA' },
      { href: '/historial', etiqueta: '📜 Historial', permiso: 'CAJA' },
      { href: '/reportes', etiqueta: '📊 Reportes', permiso: 'CAJA' },
      { href: '/repartidores', etiqueta: '👥 Repartidores', permiso: 'REPARTIDORES' },
      { href: '/motos', etiqueta: '🏍️ Motos', permiso: 'FLOTA' },
      { href: '/configuracion', etiqueta: '⚙️ Configuracion', permiso: 'USUARIOS' },
    ],
  },
  {
    clave: 'CLIENTES',
    nombre: 'Clientes',
    icono: '📍',
    descripcion:
      'Las diez mil fichas del POS, limpias, y la ubicacion exacta de cada casa pedida por WhatsApp.',
    inicio: '/clientes',
    rutas: ['/clientes'],
    pantallas: [{ href: '/clientes', etiqueta: '📍 Base y ubicaciones', permiso: 'CLIENTES' }],
  },
  {
    clave: 'ENTREGAS',
    nombre: 'Entregas',
    icono: '🛵',
    descripcion:
      'El pedido desde que entra hasta que llega: a quien se le asigna, por donde va y a que hora llego de verdad.',
    inicio: '/entregas',
    rutas: ['/entregas'],
    pantallas: [],
    enConstruccion: true,
  },
];

/** En que modulo esta una direccion. Gana el prefijo mas largo que calce. */
export function moduloDeLaRuta(ruta: string): Modulo {
  let elegido = MODULOS[0] as Modulo;
  let largo = -1;
  for (const modulo of MODULOS) {
    for (const prefijo of modulo.rutas) {
      // La raiz calza con todo, asi que solo cuenta si la ruta ES la raiz.
      const calza = prefijo === '/' ? ruta === '/' : ruta === prefijo || ruta.startsWith(`${prefijo}/`);
      if (calza && prefijo.length > largo) {
        elegido = modulo;
        largo = prefijo.length;
      }
    }
  }
  return elegido;
}
