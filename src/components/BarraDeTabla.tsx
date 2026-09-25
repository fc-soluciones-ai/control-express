'use client';

/**
 * La barra que va encima de cualquier lista: buscar, filtrar y ver que filtros
 * estan puestos.
 *
 * Antes cada pantalla resolvia esto a su manera, o no lo resolvia: la flota y
 * los repartidores no tenian donde buscar, y en los reportes los filtros solo
 * se notaban leyendo los campos uno por uno.
 *
 * Tres decisiones que vienen del mostrador:
 *   - Se busca al escribir, con 400 ms de espera. Sin esa espera se dispara una
 *     consulta por letra; con un boton "Buscar", nadie lo toca.
 *   - Los filtros viven en la direccion (ver lib/consulta.ts).
 *   - Los filtros puestos se ven como etiquetas con su equis. Un filtro que no
 *     se ve es la causa mas comun de "me falta un movimiento".
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { conParametros } from '@/lib/consulta';

export interface ChipActivo {
  /** Clave del filtro en la direccion, para poder quitarlo solo a el. */
  clave: string;
  etiqueta: string;
}

interface Props {
  /** Que se busca, para el texto de ayuda: "placa, marca o repartidor". */
  buscaPor: string;
  chips: ChipActivo[];
  /** El panel de filtros. Sin esto, la barra solo trae el buscador. */
  filtros?: React.ReactNode;
  /** Botones de la derecha: crear, exportar, importar. */
  acciones?: React.ReactNode;
  /** Cuantos registros se estan viendo, para el resumen de la derecha. */
  resumen?: string;
}

const ESPERA_MS = 400;

export function BarraDeTabla({ buscaPor, chips, filtros, acciones, resumen }: Props) {
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();
  const enLaDireccion = parametros.get('buscar') ?? '';

  const [texto, setTexto] = useState(enLaDireccion);
  const [abierto, setAbierto] = useState(false);
  // Al llegar por un enlace con filtros, el panel arranca abierto: si no, la
  // pantalla muestra menos registros de los que hay sin decir por que.
  const primera = useRef(true);

  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      if (chips.length > 0) setAbierto(true);
      return;
    }
    // La direccion puede cambiar por el boton Atras: el campo la sigue.
    setTexto(enLaDireccion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLaDireccion]);

  useEffect(() => {
    if (texto === enLaDireccion) return;
    const id = setTimeout(() => {
      router.replace(conParametros(ruta, parametros, { buscar: texto }), { scroll: false });
    }, ESPERA_MS);
    return () => clearTimeout(id);
  }, [enLaDireccion, parametros, ruta, router, texto]);

  const limpiarTodo = conParametros(
    ruta,
    parametros,
    Object.fromEntries([...chips.map((c) => [c.clave, null]), ['buscar', null]]),
  );

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <span aria-hidden className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
            🔍
          </span>
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={`Buscar por ${buscaPor}`}
            aria-label={`Buscar por ${buscaPor}`}
            className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro pl-12 pr-4 text-lg text-slate-100 outline-none focus:border-entrada"
          />
        </div>

        {filtros ? (
          <button
            type="button"
            aria-expanded={abierto}
            onClick={() => setAbierto((v) => !v)}
            className={`boton-tactil shrink-0 border px-5 ${
              chips.length > 0
                ? 'border-entrada bg-entrada/15 text-entrada'
                : 'border-borde bg-panelClaro text-slate-200'
            }`}
          >
            ⚙ Filtros{chips.length > 0 ? ` (${chips.length})` : ''}
          </button>
        ) : null}

        {acciones}
      </div>

      {abierto && filtros ? (
        <div className="mt-3 rounded-2xl border border-borde bg-fondo p-4">{filtros}</div>
      ) : null}

      {chips.length > 0 || texto ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {texto ? (
            <Link
              href={conParametros(ruta, parametros, { buscar: null })}
              scroll={false}
              className="inline-flex items-center gap-2 rounded-xl border border-borde bg-panelClaro px-3 py-2 text-sm text-slate-300 active:scale-95"
            >
              <span>Texto: {texto}</span>
              <span aria-hidden className="text-slate-500">
                ✕
              </span>
              <span className="sr-only">Quitar la busqueda</span>
            </Link>
          ) : null}

          {chips.map((chip) => (
            <Link
              key={chip.clave}
              href={conParametros(ruta, parametros, { [chip.clave]: null })}
              scroll={false}
              className="inline-flex items-center gap-2 rounded-xl border border-entrada/50 bg-entrada/10 px-3 py-2 text-sm text-entrada active:scale-95"
            >
              <span>{chip.etiqueta}</span>
              <span aria-hidden>✕</span>
              <span className="sr-only">Quitar el filtro {chip.etiqueta}</span>
            </Link>
          ))}

          {chips.length + (texto ? 1 : 0) > 1 ? (
            <Link
              href={limpiarTodo}
              scroll={false}
              className="rounded-xl px-3 py-2 text-sm text-slate-400 underline active:scale-95"
            >
              Limpiar todos
            </Link>
          ) : null}

          {resumen ? <span className="ml-auto text-sm text-slate-500">{resumen}</span> : null}
        </div>
      ) : resumen ? (
        <p className="mt-3 text-right text-sm text-slate-500">{resumen}</p>
      ) : null}
    </div>
  );
}
