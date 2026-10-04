/**
 * La puerta por donde entra lo que manda WhatsApp.
 *
 * Es la unica direccion de la aplicacion que llama alguien de afuera sin
 * sesion y sin que un humano la abra. Meta avisa aqui cada vez que un cliente
 * manda un mensaje al numero de la pizzeria.
 *
 * TRES COSAS QUE NO SE PUEDEN MOVER
 *
 * 1. SE COMPRUEBA LA FIRMA ANTES DE MIRAR EL CONTENIDO, y sobre el cuerpo
 *    CRUDO. Esta direccion es publica: sin la firma, cualquiera que la
 *    descubra puede inventarle una ubicacion a un cliente. Leer el JSON
 *    primero y firmar despues no sirve, porque volver a serializarlo cambia
 *    los bytes y la firma deja de calzar.
 *
 * 2. SE CONTESTA 200 AUNQUE ALGO FALLE. Meta reintenta lo que no recibe
 *    confirmacion, y un reintento trae el lote entero: un mensaje malo haria
 *    que los buenos del mismo lote entren dos veces. Lo que falla se registra
 *    y se contesta que si.
 *
 * 3. SE CONTESTA RAPIDO. Meta corta a los pocos segundos. Por eso aqui no se
 *    manda ningun mensaje de vuelta ni se llama a ningun otro servicio.
 */

import { NextResponse } from 'next/server';

import {
  firmaValida,
  recibirUbicacion,
  respuestaDeVerificacion,
  ubicacionesDelAviso,
} from '@/server/services/whatsapp';

export const dynamic = 'force-dynamic';
// El cuerpo crudo hace falta para la firma, asi que corre en Node y no en el
// entorno recortado del borde.
export const runtime = 'nodejs';

/**
 * El "ping" con el que Meta da de alta el webhook.
 *
 * Solo pasa una vez, al configurarlo en el panel de Meta, y cuando se cambia
 * la direccion. Contesta el reto si el token coincide con el que pusimos.
 */
export async function GET(peticion: Request): Promise<Response> {
  const reto = respuestaDeVerificacion(new URL(peticion.url).searchParams);
  if (reto === null) {
    return new NextResponse('No', { status: 403 });
  }
  // Meta espera el reto tal cual, en texto plano.
  return new NextResponse(reto, {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  });
}

export async function POST(peticion: Request): Promise<Response> {
  // El cuerpo se lee como texto, no como JSON: la firma es sobre estos bytes.
  const crudo = await peticion.text();

  if (!firmaValida(crudo, peticion.headers.get('x-hub-signature-256'))) {
    // Sin detalles en la respuesta: a quien este probando no se le dice si
    // fallo el secreto, el formato o el largo.
    return new NextResponse('No', { status: 401 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    // Firmado por Meta pero ilegible. No hay nada que reintentar.
    return NextResponse.json({ recibido: true });
  }

  for (const ubicacion of ubicacionesDelAviso(cuerpo)) {
    try {
      await recibirUbicacion(ubicacion);
    } catch (error) {
      // Ver la regla 2 del encabezado: nunca se devuelve un error por un
      // mensaje suelto.
      console.error('[whatsapp] no se pudo guardar una ubicacion', error);
    }
  }

  return NextResponse.json({ recibido: true });
}
