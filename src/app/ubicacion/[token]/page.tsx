/**
 * La pagina que abre un cliente desde el enlace de WhatsApp.
 *
 * ES LA UNICA PANTALLA SIN SESION DE TODO EL SISTEMA. No hay PIN ni cookie:
 * la llave es el token de la direccion, y lo unico que abre es proponer una
 * ubicacion para ese cliente. No muestra el telefono, ni los pedidos, ni
 * nada que sirva para suplantar a nadie; el nombre y la direccion que ya
 * tenemos son datos que el propio cliente nos dio.
 *
 * Un token que no existe, que vencio o que el cliente ya rechazo da 404 sin
 * decir cual de las tres cosas paso: si dijera "vencido", el que pruebe
 * tokens al azar sabria cuando acerto.
 */

import type { Viewport } from 'next';
import { notFound } from 'next/navigation';

import { PanelUbicacionCliente } from '@/components/PanelUbicacionCliente';
import { abrirSolicitud } from '@/server/services/ubicaciones';

import { guardarUbicacion, noQuiereCompartir } from './acciones';

export const dynamic = 'force-dynamic';

/**
 * Aqui si se puede hacer zoom, al contrario del resto de la aplicacion.
 *
 * El bloqueo de zoom existe para el monitor del mostrador, donde un pellizco
 * accidental deja la pantalla inservible a media noche. En el telefono de un
 * cliente que quiza no ve bien de cerca, impedirle agrandar el texto es
 * dejarlo afuera.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
  themeColor: '#0b1120',
};

export const metadata = {
  title: 'Su ubicacion para las entregas',
  // Que WhatsApp no muestre una vista previa con el nombre del cliente.
  robots: { index: false, follow: false },
};

export default async function PedirUbicacion({ params }: { params: { token: string } }) {
  const solicitud = await abrirSolicitud(params.token);
  if (!solicitud) notFound();

  return (
    <PanelUbicacionCliente
      token={solicitud.token}
      nombreCliente={solicitud.nombreCliente}
      direccionActual={solicitud.direccionActual}
      yaRespondio={solicitud.yaRespondio}
      alGuardar={guardarUbicacion}
      alRechazar={noQuiereCompartir}
    />
  );
}
