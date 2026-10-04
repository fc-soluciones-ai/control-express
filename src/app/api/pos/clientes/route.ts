/**
 * Por donde entran los clientes que manda el agente del local.
 *
 * Misma disciplina que /api/pos/pedidos, y por la misma razon: la direccion es
 * publica. Se comprueba la firma sobre el cuerpo crudo antes de mirar nada, la
 * hora va dentro de la firma, y un cliente malo no tumba el lote.
 *
 * Existe porque la carga desde un Excel exportado a mano era una foto que
 * envejecia: de los 206 clientes que pidieron en una semana, 53 no estaban en
 * la exportacion. La caja crea fichas todos los dias.
 */

import { NextResponse } from 'next/server';

import { esErrorNegocio } from '@/server/errores';
import { envioValido, sincronizarClientes, type ClienteDelPos } from '@/server/services/pos';

export const dynamic = 'force-dynamic';
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
    return new NextResponse('No', { status: 401 });
  }

  let cuerpo: { clientes?: ClienteDelPos[] };
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    return NextResponse.json({ error: 'El cuerpo no es JSON.' }, { status: 400 });
  }

  try {
    return NextResponse.json(await sincronizarClientes(cuerpo.clientes ?? []));
  } catch (error) {
    if (esErrorNegocio(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[pos] no se pudo sincronizar un lote de clientes', error);
    // 500 a proposito: el agente TIENE que reintentar este lote.
    return NextResponse.json({ error: 'Error inesperado.' }, { status: 500 });
  }
}
