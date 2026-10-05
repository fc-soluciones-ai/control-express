'use server';

/**
 * Acciones de la base de clientes y de los pedidos de ubicacion.
 *
 * Todas exigen el permiso CLIENTES (supervisor o administrador). Aqui se
 * decide a que miles de telefonos se le escribe, y un mensaje mandado no se
 * puede recoger.
 */

import { revalidatePath } from 'next/cache';

import { esErrorNegocio } from '@/server/errores';
import { exigirCajeroCon } from '@/server/services/sesion';
import {
  aceptarUbicacion,
  armarTanda,
  marcarTandaEnviada,
  rechazarUbicacion,
  vencerSolicitudesViejas,
} from '@/server/services/ubicaciones';

export type Resultado<T> = { ok: true; datos: T } | { ok: false; mensaje: string };

function comoResultado(e: unknown): { ok: false; mensaje: string } {
  if (esErrorNegocio(e)) return { ok: false, mensaje: e.message };
  console.error('[clientes]', e);
  return { ok: false, mensaje: 'Ocurrio un error inesperado.' };
}

/**
 * Arma la siguiente tanda y dice cual es, para abrir la pantalla de envio.
 *
 * Esto bajaba un Excel con la lista. Ya no se exporta nada: la tanda se abre
 * en una pantalla con los enlaces de WhatsApp y se trabaja de arriba a abajo.
 * Es mejor para quien manda los mensajes, porque los enlaces se abren con un
 * toque en vez de con un archivo de por medio, y ademas la lista no se queda
 * guardada en la computadora del mostrador con los telefonos de medio Alajuela.
 */
export async function accionArmarTanda(
  cuantas: number,
): Promise<Resultado<{ tanda: number; cuantas: number }>> {
  try {
    const cajero = await exigirCajeroCon('CLIENTES');
    await vencerSolicitudesViejas();

    const { tanda, lineas } = await armarTanda(cajero.id, cuantas);
    if (lineas.length === 0) {
      return {
        ok: false,
        mensaje:
          'No queda ningun cliente al que pedirle la ubicacion con los datos en regla. ' +
          'Revise los que estan por confirmar o sin telefono.',
      };
    }

    revalidatePath('/clientes');
    return { ok: true, datos: { tanda, cuantas: lineas.length } };
  } catch (e) {
    return comoResultado(e);
  }
}

/** La aprieta la persona que acabo de mandar los mensajes de la tanda. */
export async function accionMarcarEnviada(tanda: number): Promise<Resultado<number>> {
  try {
    const cajero = await exigirCajeroCon('CLIENTES');
    const cuantas = await marcarTandaEnviada(tanda, cajero.id);
    revalidatePath('/clientes');
    return { ok: true, datos: cuantas };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionAceptarUbicacion(id: string): Promise<Resultado<null>> {
  try {
    const cajero = await exigirCajeroCon('CLIENTES');
    await aceptarUbicacion(id, cajero.id);
    revalidatePath('/clientes');
    return { ok: true, datos: null };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionRechazarUbicacion(
  id: string,
  motivo: string,
): Promise<Resultado<null>> {
  try {
    const cajero = await exigirCajeroCon('CLIENTES');
    await rechazarUbicacion(id, cajero.id, motivo);
    revalidatePath('/clientes');
    return { ok: true, datos: null };
  } catch (e) {
    return comoResultado(e);
  }
}
