/**
 * Por donde entra el menu que manda el agente del local.
 *
 * Misma disciplina que /api/pos/pedidos: la direccion es publica, asi que se
 * comprueba la firma sobre el cuerpo crudo antes de mirar nada, y la hora va
 * dentro de la firma.
 */

import { NextResponse } from 'next/server';

import { esErrorNegocio } from '@/server/errores';
import { sincronizarMenu, type EnvioDeMenu } from '@/server/services/menu';
import { envioValido } from '@/server/services/pos';

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

  let cuerpo: EnvioDeMenu;
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    return NextResponse.json({ error: 'El cuerpo no es JSON.' }, { status: 400 });
  }

  try {
    return NextResponse.json(await sincronizarMenu(cuerpo));
  } catch (error) {
    if (esErrorNegocio(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[pos] no se pudo sincronizar el menu', error);
    // 500 a proposito: el agente TIENE que reintentar.
    return NextResponse.json({ error: 'Error inesperado.' }, { status: 500 });
  }
}
