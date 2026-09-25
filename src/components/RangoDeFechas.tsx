'use client';

/**
 * El rango de fechas de un reporte, con los atajos que se piden de verdad.
 *
 * Nadie llega a un reporte pensando "del 1 al 30"; llega pensando "este mes" o
 * "la semana pasada". Los atajos evitan dos veces el teclado de fecha en una
 * tableta, que es donde se pierde la paciencia.
 */

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { conParametros } from '@/lib/consulta';

interface Props {
  desde: string;
  hasta: string;
}

function comoTexto(fecha: Date): string {
  return fecha.toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
}

function hace(dias: number): string {
  const f = new Date();
  f.setDate(f.getDate() - dias);
  return comoTexto(f);
}

function inicioDeMes(desplazamiento = 0): { desde: string; hasta: string } {
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() + desplazamiento, 1);
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + desplazamiento + 1, 0);
  return { desde: comoTexto(inicio), hasta: comoTexto(fin) };
}

export function RangoDeFechas({ desde, hasta }: Props) {
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();

  const mesActual = inicioDeMes(0);
  const mesAnterior = inicioDeMes(-1);

  const ATAJOS: Array<{ texto: string; desde: string; hasta: string }> = [
    { texto: 'Hoy', desde: comoTexto(new Date()), hasta: comoTexto(new Date()) },
    { texto: 'Ultimos 7 dias', desde: hace(6), hasta: comoTexto(new Date()) },
    { texto: 'Ultimos 30 dias', desde: hace(29), hasta: comoTexto(new Date()) },
    { texto: 'Este mes', ...mesActual },
    { texto: 'Mes pasado', ...mesAnterior },
  ];

  const puesto = (a: { desde: string; hasta: string }) => a.desde === desde && a.hasta === hasta;

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-slate-500">Desde</span>
          <input
            type="date"
            value={desde}
            onChange={(e) =>
              router.replace(conParametros(ruta, parametros, { desde: e.target.value }), {
                scroll: false,
              })
            }
            className="mt-2 h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-slate-500">Hasta</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) =>
              router.replace(conParametros(ruta, parametros, { hasta: e.target.value }), {
                scroll: false,
              })
            }
            className="mt-2 h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {ATAJOS.map((atajo) => (
          <Link
            key={atajo.texto}
            href={conParametros(ruta, parametros, { desde: atajo.desde, hasta: atajo.hasta })}
            scroll={false}
            className={`rounded-xl border px-4 py-2 text-sm active:scale-95 ${
              puesto(atajo)
                ? 'border-entrada bg-entrada/15 text-entrada'
                : 'border-borde bg-panelClaro text-slate-300'
            }`}
          >
            {atajo.texto}
          </Link>
        ))}
        {desde || hasta ? (
          <Link
            href={conParametros(ruta, parametros, { desde: null, hasta: null })}
            scroll={false}
            className="rounded-xl px-4 py-2 text-sm text-slate-400 underline active:scale-95"
          >
            Toda la historia
          </Link>
        ) : null}
      </div>
    </div>
  );
}
