/**
 * Modulo 1: dashboard operativo.
 *
 * Es la pantalla que queda encendida toda la noche en el monitor del
 * mostrador. Se renderiza en el servidor en cada visita porque las cifras que
 * muestra son sumas en vivo, no un cache: mostrar un total de caja viejo seria
 * peor que no mostrarlo.
 */

import { redirect } from 'next/navigation';

import { BarraSuperior } from '@/components/BarraSuperior';
import { Cabecera } from '@/components/Cabecera';
import { GrillaChoferes } from '@/components/GrillaChoferes';
import { diaOperativoDe } from '@/lib/fechas';
import { efectivoTeoricoEnCaja, resumenChoferesEnTurno } from '@/server/services/caja';
import { estaInstanciaRespalda, ultimoRespaldo } from '@/server/services/respaldo';
import { cajeroDeSesion, repartidorDeSesion } from '@/server/services/sesion';
import { choferesDisponiblesParaTurno } from '@/server/services/turnos';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const cajero = await cajeroDeSesion();
  if (!cajero) {
    // El icono del telefono abre aqui. Un repartidor que ya entro va directo
    // a su pantalla, en vez de ver otra vez la de entrada cada vez que abre.
    redirect((await repartidorDeSesion()) ? '/mi' : '/entrar');
  }

  const diaOperativo = diaOperativoDe();
  const [caja, enTurno, disponibles, respaldo] = await Promise.all([
    efectivoTeoricoEnCaja(diaOperativo),
    resumenChoferesEnTurno(),
    choferesDisponiblesParaTurno(),
    estaInstanciaRespalda() ? ultimoRespaldo() : Promise.resolve(null),
  ]);

  // La copia en la nube no respalda ni puede: el disco es efimero. Avisar de
  // un respaldo que esa instancia nunca iba a hacer seria ruido permanente.
  const horasSinRespaldo = !estaInstanciaRespalda()
    ? 0
    : respaldo
      ? (Date.now() - respaldo.modificado.getTime()) / 3_600_000
      : null;

  return (
    <main className="mx-auto max-w-[1600px] p-5">
      <Cabecera migas={[{ etiqueta: 'Inicio' }]} usuario={cajero} />
      <BarraSuperior
        efectivoEnCaja={caja.total}
        diaOperativo={diaOperativo}
        rol={cajero.rol}
        choferesConTurno={enTurno.length}
        horasSinRespaldo={horasSinRespaldo}
      />
      <GrillaChoferes enTurno={enTurno} disponibles={disponibles} />
    </main>
  );
}
