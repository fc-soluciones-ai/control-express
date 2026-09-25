/**
 * Dashboard de la flota de motocicletas.
 *
 * Se renderiza en el servidor en cada visita: el estado de una moto cambia
 * cuando alguien la manda al taller desde otra pantalla, y una version
 * cacheada mandaria a la calle una moto que ya no esta.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { BarraDeTabla } from '@/components/BarraDeTabla';
import { Cabecera } from '@/components/Cabecera';
import { FiltroEnlace } from '@/components/FiltroEnlace';
import { paraBuscar } from '@/lib/consulta';
import { GrillaFlota } from '@/components/GrillaFlota';
import { alertasDeFlota } from '@/server/services/mantenimiento';
import { evidenciaDe, type Evidencia } from '@/server/services/evidencia';
import { choferesSinMoto, listarFlota } from '@/server/services/motos';
import { tienePermiso } from '@/server/permisos';
import { cajeroDeSesion } from '@/server/services/sesion';

const NOMBRE_ESTADO: Record<string, string> = {
  OPERATIVA: 'Operativas',
  EN_MANTENIMIENTO: 'En taller',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
};

export const dynamic = 'force-dynamic';

interface Parametros {
  buscar?: string;
  estado?: string;
  gps?: string;
}

export default async function Motos({ searchParams }: { searchParams: Parametros }) {
  const cajero = await cajeroDeSesion();
  if (!cajero) redirect('/entrar');
  // Sin el rol, la pantalla no se abre: esconder el boton no basta.
  if (!tienePermiso(cajero.rol, 'FLOTA')) redirect('/sin-permiso');

  const [flota, alertas, choferesLibres] = await Promise.all([
    listarFlota(),
    alertasDeFlota(),
    choferesSinMoto(),
  ]);

  // Las fotos se piden por moto. Son pocas motos y solo se usan al abrir el
  // formulario, asi que no vale la pena una consulta mas fina.
  const evidenciaGps: Record<string, Evidencia[]> = {};
  const evidenciaMoto: Record<string, Evidencia[]> = {};
  for (const moto of flota) {
    if (moto.tieneGps) evidenciaGps[moto.placa] = await evidenciaDe('GPS', moto.placa);
    evidenciaMoto[moto.placa] = await evidenciaDe('MOTOCICLETA', moto.placa);
  }

  // La flota son decenas de motos, no miles: se filtra en memoria y se evita
  // una consulta por cada tecla. La busqueda ignora tildes y mayusculas.
  const texto = paraBuscar(searchParams.buscar ?? '');
  const visibles = flota.filter((moto) => {
    if (searchParams.estado && moto.estado !== searchParams.estado) return false;
    if (searchParams.gps === 'CON' && !moto.tieneGps) return false;
    if (searchParams.gps === 'SIN' && moto.tieneGps) return false;
    if (!texto) return true;
    return paraBuscar(
      [moto.placa, moto.marca, moto.modelo, moto.choferNombre ?? ''].join(' '),
    ).includes(texto);
  });

  const chips = [
    searchParams.estado
      ? {
          clave: 'estado',
          etiqueta: `Estado: ${NOMBRE_ESTADO[searchParams.estado] ?? searchParams.estado}`,
        }
      : null,
    searchParams.gps
      ? { clave: 'gps', etiqueta: searchParams.gps === 'CON' ? 'Con GPS' : 'Sin GPS' }
      : null,
  ].filter((c): c is { clave: string; etiqueta: string } => c !== null);

  const operativas = flota.filter((m) => m.estado === 'OPERATIVA').length;
  const vencidas = alertas.filter((a) => a.nivel === 'VENCIDO').length;

  return (
    <main className="mx-auto max-w-[1600px] p-5">
      <Cabecera
        migas={[{ etiqueta: 'Inicio', href: '/' }, { etiqueta: 'Flota de motos' }]}
        usuario={cajero}
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Flota de motos</h1>
          <p className="text-slate-400">
            {operativas} de {flota.length} operativa{operativas === 1 ? '' : 's'}
            {vencidas > 0
              ? ` · ${vencidas} servicio${vencidas === 1 ? '' : 's'} vencido${vencidas === 1 ? '' : 's'}`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/motos/gastos" className="boton-tactil bg-entrada px-6 text-slate-950">
            ⛽ Registrar gasto
          </Link>
          <Link
            href="/motos/reportes"
            className="boton-tactil border border-borde bg-panelClaro px-6 text-slate-200"
          >
            📊 Reportes
          </Link>
        </div>
      </div>

      <BarraDeTabla
        buscaPor="placa, marca, modelo o repartidor"
        chips={chips}
        resumen={
          visibles.length === flota.length
            ? undefined
            : `${visibles.length} de ${flota.length} motos`
        }
        filtros={
          <div className="grid gap-3 sm:grid-cols-2">
            <FiltroEnlace
              etiqueta="Estado"
              clave="estado"
              opciones={[
                { valor: '', texto: 'Todas' },
                { valor: 'OPERATIVA', texto: 'Operativas' },
                { valor: 'EN_MANTENIMIENTO', texto: 'En taller' },
                { valor: 'FUERA_DE_SERVICIO', texto: 'Fuera de servicio' },
              ]}
            />
            <FiltroEnlace
              etiqueta="Rastreo satelital"
              clave="gps"
              opciones={[
                { valor: '', texto: 'Todas' },
                { valor: 'CON', texto: 'Con GPS' },
                { valor: 'SIN', texto: 'Sin GPS' },
              ]}
            />
          </div>
        }
      />

      <GrillaFlota
        flota={visibles}
        alertas={alertas}
        choferesLibres={choferesLibres}
        evidenciaGps={evidenciaGps}
        evidenciaMoto={evidenciaMoto}
      />
    </main>
  );
}
