/**
 * Por donde entran los pedidos que manda el agente del local.
 *
 * Es la segunda direccion publica de la aplicacion, despues del webhook de
 * WhatsApp, y vale la misma disciplina:
 *
 * 1. SE COMPRUEBA LA FIRMA ANTES DE MIRAR EL CONTENIDO, sobre el cuerpo
 *    CRUDO. Volver a serializar el JSON cambia los bytes y la firma deja de
 *    calzar. Sin firma, cualquiera que descubra esta direccion puede inventar
 *    pedidos, que es como se le manda un repartidor a una casa que no pidio.
 *
 * 2. LA FIRMA INCLUYE LA HORA. El agente la controla, asi que se puede
 *    rechazar un envio grabado y repetido mas tarde.
 *
 * 3. UN PEDIDO MALO NO TUMBA EL LOTE. El agente reintenta lo que no se
 *    confirma, y si uno solo hiciera fallar la llamada, los buenos del mismo
 *    lote entrarian una y otra vez. Lo que no se pudo guardar se devuelve en
 *    la respuesta para que quede en el registro del agente.
 */

import { NextResponse } from 'next/server';

import { esErrorNegocio } from '@/server/errores';
import { envioValido, sincronizarPedidos, type PedidoDelPos } from '@/server/services/pos';

export const dynamic = 'force-dynamic';
// El cuerpo crudo hace falta para la firma: Node, no el entorno del borde.
export const runtime = 'nodejs';

export async function POST(peticion: Request): Promise<Response> {
  const crudo = await peticion.text();

  if (
    !envioValido(
      crudo,
      peticion.headers.get('x-agente-firma'),
      peticion.headers.get('x-agente-hora'),
    )
  ) {
    // Sin detalles: a quien este probando no se le dice que fallo.
    return new NextResponse('No', { status: 401 });
  }

  let cuerpo: { pedidos?: PedidoDelPos[] };
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    return NextResponse.json({ error: 'El cuerpo no es JSON.' }, { status: 400 });
  }

  try {
    const resultado = await sincronizarPedidos(cuerpo.pedidos ?? []);
    return NextResponse.json(resultado);
  } catch (error) {
    if (esErrorNegocio(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[pos] no se pudo sincronizar un lote', error);
    // 500 a proposito: el agente TIENE que reintentar este lote, al reves que
    // con un pedido suelto malo.
    return NextResponse.json({ error: 'Error inesperado.' }, { status: 500 });
  }
}
