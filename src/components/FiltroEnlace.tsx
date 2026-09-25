'use client';

/**
 * Un filtro de pocas opciones, como botones.
 *
 * Con tres o cuatro valores, una lista desplegable son dos toques y una
 * pantalla tapada; los botones son uno solo y se ven todos de una vez. Cada
 * opcion es un enlace, asi que el filtro queda en la direccion y el boton
 * Atras lo deshace.
 */

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { conParametros } from '@/lib/consulta';

interface Props {
  etiqueta: string;
  /** Nombre del filtro en la direccion. */
  clave: string;
  opciones: Array<{ valor: string; texto: string }>;
}

export function FiltroEnlace({ etiqueta, clave, opciones }: Props) {
  const ruta = usePathname();
  const parametros = useSearchParams();
  const actual = parametros.get(clave) ?? '';

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {opciones.map((opcion) => {
          const puesta = opcion.valor === actual;
          return (
            <Link
              key={opcion.valor || 'todos'}
              href={conParametros(ruta, parametros, { [clave]: opcion.valor || null })}
              scroll={false}
              aria-current={puesta ? 'true' : undefined}
              className={`rounded-xl border px-4 py-2 text-sm active:scale-95 ${
                puesta
                  ? 'border-entrada bg-entrada/15 text-entrada'
                  : 'border-borde bg-panelClaro text-slate-300'
              }`}
            >
              {opcion.texto}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
