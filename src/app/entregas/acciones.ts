'use server';

/**
 * La unica accion del tablero de entregas: volver a leer la base.
 *
 * El tablero no escribe nada. Es una pantalla de vidrio: muestra lo que el
 * agente del POS deja en la tabla de pedidos y nada mas. Si algun dia hay que
 * marcar una entrega a mano, eso va en otra accion y con su propio permiso,
 * porque pasa a ser un hecho que alguien registro y no un dato leido.
 *
 * Se refresca llamando esto desde el navegador en vez de recargar la pagina:
 * recargar perderia el desplazamiento y haria parpadear toda la pantalla cada
 * quince segundos, que en un monitor de mostrador encendido ocho horas es
 * insoportable.
 */

import { exigirPermiso } from '@/server/permisos';
import { tableroDeEntregas, type TableroDeEntregas } from '@/server/services/entregas';
import { exigirCajero } from '@/server/services/sesion';

export async function accionTableroDeEntregas(): Promise<TableroDeEntregas> {
  const usuario = await exigirCajero();
  exigirPermiso(usuario, 'OPERACION');
  return tableroDeEntregas();
}
