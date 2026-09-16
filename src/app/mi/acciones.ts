'use server';

/**
 * Lo unico que el repartidor puede escribir.
 *
 * Cada accion de aqui saca el id de SU sesion, nunca de lo que mande la
 * pantalla, y exige que sea una sesion de repartidor. Un token de caja no
 * sirve para estas, igual que uno de repartidor no sirve para las de caja.
 */

import { revalidatePath } from 'next/cache';

import { esErrorNegocio } from '@/server/errores';
import { agregarEvidencia, borrarEvidencia, type TipoEntidad } from '@/server/services/evidencia';
import {
  leerFoto,
  registrarGasolinaLeida,
  type LecturaParaPantalla,
  type TipoLectura,
} from '@/server/services/lectura-ia';
import { exigirRepartidor } from '@/server/services/sesion';

export type Resultado<T> = { ok: true; datos: T } | { ok: false; mensaje: string };

function comoResultado(e: unknown): { ok: false; mensaje: string } {
  if (esErrorNegocio(e)) return { ok: false, mensaje: e.message };
  console.error('[repartidor]', e);
  return { ok: false, mensaje: 'Ocurrio un error inesperado. Intente de nuevo.' };
}

/**
 * Lee una foto del odometro o de la factura.
 *
 * Devuelve lo que se leyo para mostrarlo, y un id. Ese id es lo unico que la
 * pantalla manda despues: los numeros se quedan en el servidor.
 */
export async function accionLeerFoto(
  formulario: FormData,
): Promise<Resultado<LecturaParaPantalla>> {
  try {
    const repartidor = await exigirRepartidor();
    const tipo = String(formulario.get('tipo') ?? '') as TipoLectura;
    const archivo = formulario.get('archivo');
    if (!(archivo instanceof File) || archivo.size === 0) {
      return { ok: false, mensaje: 'Tome la foto.' };
    }
    const contenido = Buffer.from(await archivo.arrayBuffer());
    const lectura = await leerFoto({ choferId: repartidor.id, tipo, contenido });
    return { ok: true, datos: lectura };
  } catch (e) {
    return comoResultado(e);
  }
}

/**
 * Registra una carga de gasolina de su propia moto, con lo leido de las fotos.
 *
 * Ni la placa, ni el kilometraje, ni el monto vienen de la pantalla: la moto
 * es la que trae ahora, y los numeros son los que la IA leyo. Asi el
 * repartidor no puede cargarle gasolina a otra moto ni cambiar lo que dice la
 * factura.
 */
export async function accionCargarGasolina(entrada: {
  lecturaOdometroId: string;
  lecturaFacturaId: string;
  claveIdempotencia: string;
}): Promise<Resultado<{ id: string; placa: string; kilometraje: number; monto: number }>> {
  try {
    const repartidor = await exigirRepartidor();
    const resultado = await registrarGasolinaLeida({
      choferId: repartidor.id,
      lecturaOdometroId: String(entrada.lecturaOdometroId ?? ''),
      lecturaFacturaId: String(entrada.lecturaFacturaId ?? ''),
      claveIdempotencia: String(entrada.claveIdempotencia ?? ''),
    });

    revalidatePath('/mi');
    revalidatePath('/motos');
    revalidatePath('/motos/reportes');

    return {
      ok: true,
      datos: {
        id: resultado.id,
        placa: resultado.placa,
        kilometraje: resultado.kilometraje,
        monto: resultado.monto,
      },
    };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionSubirEvidenciaMia(
  formulario: FormData,
): Promise<Resultado<Awaited<ReturnType<typeof agregarEvidencia>>>> {
  try {
    const repartidor = await exigirRepartidor();

    const entidadTipo = String(formulario.get('entidadTipo') ?? '') as TipoEntidad;
    const entidadId = String(formulario.get('entidadId') ?? '');
    const tipo = String(formulario.get('tipo') ?? '');
    const descripcion = String(formulario.get('descripcion') ?? '');
    const archivo = formulario.get('archivo');

    if (!(archivo instanceof File) || archivo.size === 0) {
      return { ok: false, mensaje: 'Elija una foto.' };
    }

    const contenido = Buffer.from(await archivo.arrayBuffer());
    const resultado = await agregarEvidencia(
      { entidadTipo, entidadId, tipo, contenido, descripcion },
      { choferId: repartidor.id },
    );

    revalidatePath('/mi');
    return { ok: true, datos: resultado };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionBorrarEvidenciaMia(id: string): Promise<Resultado<null>> {
  try {
    const repartidor = await exigirRepartidor();
    await borrarEvidencia(id, { choferId: repartidor.id });
    revalidatePath('/mi');
    return { ok: true, datos: null };
  } catch (e) {
    return comoResultado(e);
  }
}
