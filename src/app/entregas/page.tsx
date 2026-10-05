/**
 * Pantalla del tablero de entregas.
 *
 * Es la pantalla principal del sistema: la que queda encendida en el monitor
 * del mostrador toda la noche. Arriba, cuantas motos pueden salir; abajo, los
 * pedidos que el cliente todavia esta esperando.
 *
 * Se arma en el servidor en cada visita para que el primer pintado ya traiga
 * los pedidos y los minutos reales: en un monitor de mostrador, una pantalla
 * que aparece vacia y se llena medio segundo despues se lee como que no hay
 * pedidos. De ahi en adelante el refresco lo maneja el componente.
 */

import { redirect } from 'next/navigation';

import { BarraSuperior } from '@/components/BarraSuperior';
import { Cabecera } from '@/components/Cabecera';
import { TableroEntregas } from '@/components/TableroEntregas';
import { tienePermiso } from '@/server/permisos';
import { tableroDeEntregas } from '@/server/services/entregas';
import { alertasDeFlota } from '@/server/services/mantenimiento';
import { listarFlota } from '@/server/services/motos';
import { cajeroDeSesion } from '@/server/services/sesion';

export const dynamic = 'force-dynamic';

export default async function Entregas() {
  const cajero = await cajeroDeSesion();
  if (!cajero) redirect('/entrar');
  if (!tienePermiso(cajero.rol, 'OPERACION')) redirect('/clientes');

  const [inicial, flota, alertas] = await Promise.all([
    tableroDeEntregas(),
    listarFlota(),
    alertasDeFlota(),
  ]);

  const operativas = flota.filter((m) => m.estado === 'OPERATIVA');

  return (
    <main className="mx-auto max-w-[1600px] p-5">
      <Cabecera migas={[{ etiqueta: 'Entregas' }]} usuario={cajero} />
      <BarraSuperior
        motosOperativas={operativas.length}
        motosEnTaller={flota.filter((m) => m.estado === 'EN_MANTENIMIENTO').length}
        motosFueraDeServicio={flota.filter((m) => m.estado === 'FUERA_DE_SERVICIO').length}
        motosSinChofer={operativas.filter((m) => m.choferId === null).length}
        alertas={alertas.length}
      />

      <div className="mb-5">
        <h1 className="text-3xl font-bold">Pedidos sin despachar</h1>
        <p className="text-slate-400">
          En vivo desde el sistema de la pizzeria. El reloj cuenta desde que entro el pedido y
          se detiene cuando sale la moto.
        </p>
      </div>

      <TableroEntregas inicial={inicial} />
    </main>
  );
}
