/**
 * La pantalla del repartidor.
 *
 * Solo lo suyo: cuanto lleva entregado hoy, sus entregas una por una, lo que
 * el POS dice que vendio, y su moto con sus avisos. No puede recibir dinero,
 * ni cerrar turnos, ni ver la caja, ni ver a los demas.
 *
 * El id sale de SU sesion, nunca de la direccion: no hay ningun numero que
 * alguien pueda cambiar para ver lo de otro.
 */

import { redirect } from 'next/navigation';

import { PanelRepartidor } from '@/components/PanelRepartidor';
import { resumenDelRepartidor } from '@/server/services/repartidor';
import { repartidorDeSesion } from '@/server/services/sesion';

export const dynamic = 'force-dynamic';

export default async function MiPantalla() {
  const repartidor = await repartidorDeSesion();
  if (!repartidor) redirect('/entrar');

  const resumen = await resumenDelRepartidor(repartidor.id);

  // La hora del servidor viaja aparte para medir la espera de cada pedido
  // contra ella y no contra el reloj del telefono, que puede estar desfasado.
  return (
    <PanelRepartidor
      repartidor={repartidor}
      resumen={resumen}
      ahora={new Date().toISOString()}
    />
  );
}
