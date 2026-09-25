'use client';

/**
 * Pie de tabla: cuantos hay, cuantos se ven por pagina y como pasar de una a
 * otra.
 *
 * La lista de gastos crece para siempre. Sin paginacion, la pantalla termina
 * cargando mil filas para mirar las diez de arriba, y en la tableta del
 * mostrador eso se siente.
 *
 * El total va primero y en texto claro: "137 gastos" contesta la pregunta que
 * trae quien abre el reporte, sin tener que contar filas.
 */

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { TAMANOS_DE_PAGINA, conParametros } from '@/lib/consulta';

interface Props {
  total: number;
  pagina: number;
  tamano: number;
  /** Como se llama lo que se lista: "gastos", "motos", "movimientos". */
  nombre: string;
}

export function Paginacion({ total, pagina, tamano, nombre }: Props) {
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();

  const paginas = Math.max(1, Math.ceil(total / tamano));
  const actual = Math.min(pagina, paginas);
  const primero = total === 0 ? 0 : (actual - 1) * tamano + 1;
  const ultimo = Math.min(actual * tamano, total);

  const enlace = (destino: number) => conParametros(ruta, parametros, { pagina: destino });

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-borde pt-4 text-sm">
      <p className="text-slate-400">
        {total === 0
          ? `Sin ${nombre}`
          : `${primero} a ${ultimo} de ${total.toLocaleString('es-CR')} ${nombre}`}
      </p>

      <label className="flex items-center gap-2 text-slate-400">
        <span>Ver</span>
        <select
          value={tamano}
          onChange={(e) =>
            router.replace(conParametros(ruta, parametros, { tamano: e.target.value }), {
              scroll: false,
            })
          }
          className="h-11 rounded-xl border border-borde bg-panelClaro px-3 text-slate-100 outline-none focus:border-entrada"
        >
          {TAMANOS_DE_PAGINA.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span>por pagina</span>
      </label>

      <div className="flex items-center gap-2">
        {actual > 1 ? (
          <Link
            href={enlace(actual - 1)}
            scroll={false}
            className="rounded-xl border border-borde bg-panelClaro px-4 py-2 text-slate-200 active:scale-95"
          >
            ← Anterior
          </Link>
        ) : (
          <span className="rounded-xl border border-borde px-4 py-2 text-slate-600">
            ← Anterior
          </span>
        )}

        <span className="text-slate-400">
          Pagina {actual} de {paginas}
        </span>

        {actual < paginas ? (
          <Link
            href={enlace(actual + 1)}
            scroll={false}
            className="rounded-xl border border-borde bg-panelClaro px-4 py-2 text-slate-200 active:scale-95"
          >
            Siguiente →
          </Link>
        ) : (
          <span className="rounded-xl border border-borde px-4 py-2 text-slate-600">
            Siguiente →
          </span>
        )}
      </div>
    </div>
  );
}
