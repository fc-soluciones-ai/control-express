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
import { exportarTandaAExcel } from '@/server/services/exportar';
import { exigirCajeroCon } from '@/server/services/sesion';
import {
  aceptarUbicacion,
  armarTanda,
  marcarTandaEnviada,
  rechazarUbicacion,
  tandaPorNumero,
  vencerSolicitudesViejas,
} from '@/server/services/ubicaciones';

export type Resultado<T> = { ok: true; datos: T } | { ok: false; mensaje: string };

function comoResultado(e: unknown): { ok: false; mensaje: string } {
  if (esErrorNegocio(e)) return { ok: false, mensaje: e.message };
  console.error('[clientes]', e);
  return { ok: false, mensaje: 'Ocurrio un error inesperado.' };
}

/**
 * Arma la siguiente tanda y devuelve el Excel con la lista de envio.
 *
 * Las dos cosas van juntas a proposito: armar la tanda sin bajarse la lista
 * deja creadas unas solicitudes que nadie va a mandar, y el cliente que
 * despues reciba el enlace de la tanda siguiente tendria dos enlaces vivos.
 */
export async function accionArmarTanda(
  cuantas: number,
): Promise<Resultado<{ tanda: number; cuantas: number; nombreArchivo: string; base64: string }>> {
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

    const archivo = exportarTandaAExcel({ tanda, lineas });
    revalidatePath('/clientes');
    return {
      ok: true,
      datos: { tanda, cuantas: lineas.length, ...archivo },
    };
  } catch (e) {
    return comoResultado(e);
  }
}

/** Vuelve a bajar la lista de una tanda ya armada. */
export async function accionDescargarTanda(
  tanda: number,
): Promise<Resultado<{ nombreArchivo: string; base64: string }>> {
  try {
    await exigirCajeroCon('CLIENTES');
    const lineas = await tandaPorNumero(tanda);
    if (lineas.length === 0) return { ok: false, mensaje: `No existe la tanda ${tanda}.` };
    return { ok: true, datos: exportarTandaAExcel({ tanda, lineas }) };
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
