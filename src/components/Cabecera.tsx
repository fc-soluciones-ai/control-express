'use client';

/**
 * La cabecera de todas las pantallas: donde estoy, como vuelvo y quien soy.
 *
 * Antes cada pantalla ponia su propio enlace "Volver" a mano y el boton de
 * salir solo existia en el tablero: para cerrar sesion habia que volver al
 * inicio primero. Tres pantallas hondas (flota, gastos, reportes) no decian de
 * donde venian.
 *
 * Va pegada arriba porque en una tableta de mostrador el dedo entra por el
 * borde superior, y porque en una pantalla larga el camino de vuelta no puede
 * quedar fuera de la vista.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { accionSalir } from '@/app/acciones';

export interface Miga {
  etiqueta: string;
  /** Sin href, es la pantalla actual: se pinta pero no enlaza. */
  href?: string;
}

interface Props {
  migas: Miga[];
  /** A donde lleva el boton Atras. Por defecto, la miga anterior. */
  volverA?: string;
  usuario?: { nombre: string; rol: string } | null;
  /** El repartidor sale por su propia puerta y no tiene Mi cuenta de caja. */
  menu?: 'CAJA' | 'REPARTIDOR' | 'NINGUNO';
}

const NOMBRE_ROL: Record<string, string> = {
  CAJERO: 'Cajero',
  SUPERVISOR: 'Supervisor',
  ADMIN: 'Administrador',
  REPARTIDOR: 'Repartidor',
};

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join('')
    .toUpperCase();
}

export function Cabecera({ migas, volverA, usuario, menu = 'CAJA' }: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // Un menu que no se cierra al tocar afuera se queda tapando la pantalla en
  // una tableta, donde no hay tecla de escape a mano.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  const anterior = volverA ?? [...migas].reverse().find((m) => m.href)?.href;
  const actual = migas[migas.length - 1]?.etiqueta ?? '';

  return (
    <header className="sticky top-0 z-40 -mx-5 mb-5 border-b border-borde bg-fondo/95 px-5 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3">
        {anterior ? (
          <Link
            href={anterior}
            aria-label="Atras"
            className="flex h-12 shrink-0 items-center gap-2 rounded-2xl border border-borde bg-panelClaro px-4 text-slate-200 active:scale-95"
          >
            <span className="text-xl">←</span>
            <span className="hidden text-sm sm:inline">Atras</span>
          </Link>
        ) : null}

        <nav aria-label="Migas de pan" className="min-w-0 flex-1">
          <ol className="flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
            {migas.map((miga, i) => (
              <li key={`${miga.etiqueta}-${i}`} className="flex items-center gap-2">
                {i > 0 ? <span aria-hidden>›</span> : null}
                {miga.href ? (
                  <Link href={miga.href} className="hover:text-slate-300">
                    {miga.etiqueta}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-slate-300">
                    {miga.etiqueta}
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="truncate text-lg font-bold text-slate-100 sm:hidden">{actual}</p>
        </nav>

        {usuario && menu !== 'NINGUNO' ? (
          <div className="relative shrink-0" ref={caja}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={abierto}
              onClick={() => setAbierto((v) => !v)}
              className="flex h-12 items-center gap-3 rounded-2xl border border-borde bg-panelClaro px-3 text-left active:scale-95"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-entrada/20 text-xs font-bold text-entrada">
                {iniciales(usuario.nombre)}
              </span>
              <span className="hidden leading-tight sm:block">
                <span className="block text-sm font-bold text-slate-100">{usuario.nombre}</span>
                <span className="block text-xs text-slate-500">
                  {NOMBRE_ROL[usuario.rol] ?? usuario.rol}
                </span>
              </span>
              <span aria-hidden className="text-slate-500">
                ▾
              </span>
            </button>

            {abierto ? (
              <div
                role="menu"
                className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-borde bg-panel shadow-xl"
              >
                <p className="border-b border-borde px-4 py-3 sm:hidden">
                  <span className="block font-bold">{usuario.nombre}</span>
                  <span className="block text-xs text-slate-500">
                    {NOMBRE_ROL[usuario.rol] ?? usuario.rol}
                  </span>
                </p>

                {menu === 'CAJA' ? (
                  <Link
                    href="/mi-cuenta"
                    role="menuitem"
                    onClick={() => setAbierto(false)}
                    className="block px-4 py-4 text-slate-200 hover:bg-panelClaro"
                  >
                    👤 Mi cuenta
                  </Link>
                ) : (
                  <Link
                    href="/mi"
                    role="menuitem"
                    onClick={() => setAbierto(false)}
                    className="block px-4 py-4 text-slate-200 hover:bg-panelClaro"
                  >
                    👤 Mi pantalla
                  </Link>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAbierto(false);
                    void accionSalir().then(() => router.refresh());
                  }}
                  className="block w-full border-t border-borde px-4 py-4 text-left text-alerta hover:bg-panelClaro"
                >
                  ⎋ Cerrar sesion
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
