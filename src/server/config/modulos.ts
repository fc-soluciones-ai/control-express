/**
 * Los modulos de la aplicacion, en un solo lugar.
 *
 * ESTO ES SOLO DELIVERY
 *
 * La aplicacion empezo como el cierre de caja y despues fue una flota de
 * motos con mantenimiento y gastos. Nada de eso es el negocio de aqui: lo que
 * queda es la entrega a domicilio, en cuatro partes.
 *
 *   PEDIDOS      lo que piden los clientes desde la app (con el interruptor, el
 *                envio, la zona y a quien le toca cada pedido), el tablero de los
 *                pedidos que entran por el sistema de la pizzeria y el historial.
 *   REPARTIDORES quienes llevan los pedidos y que moto trae cada uno hoy.
 *   CLIENTES     las fichas del POS y la ubicacion exacta de cada casa.
 *   AJUSTES      los usuarios del sistema.
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
  clave: 'PEDIDOS' | 'REPARTIDORES' | 'CLIENTES' | 'AJUSTES';
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
    clave: 'PEDIDOS',
    nombre: 'Pedidos',
    icono: '📱',
    descripcion:
      'Lo que piden los clientes desde la app, a quien le toca cada pedido y los pedidos del POS que esperan moto.',
    inicio: '/pedidos-app',
    rutas: ['/', '/pedidos-app', '/entregas', '/historial'],
    pantallas: [
      { href: '/pedidos-app', etiqueta: '📱 Pedidos de la app', permiso: 'OPERACION' },
      { href: '/entregas', etiqueta: '🛵 Pedidos del POS', permiso: 'OPERACION' },
      { href: '/historial', etiqueta: '📜 Historial', permiso: 'OPERACION' },
    ],
  },
  {
    clave: 'REPARTIDORES',
    nombre: 'Repartidores',
    icono: '🏍️',
    descripcion: 'Quienes llevan los pedidos y la moto que trae cada uno hoy.',
    inicio: '/repartidores',
    rutas: ['/repartidores'],
    pantallas: [{ href: '/repartidores', etiqueta: '🏍️ Repartidores y motos', permiso: 'REPARTIDORES' }],
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
  {
    clave: 'AJUSTES',
    nombre: 'Ajustes',
    icono: '⚙️',
    descripcion: 'Los usuarios del sistema, sus roles y sus claves.',
    inicio: '/configuracion',
    rutas: ['/configuracion'],
    pantallas: [{ href: '/configuracion', etiqueta: '⚙️ Usuarios', permiso: 'USUARIOS' }],
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
