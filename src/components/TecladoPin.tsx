'use client';

/**
 * Teclado para escribir un PIN, con los puntos y el boton de ver.
 *
 * Lo usan la ficha del repartidor y la de los usuarios de caja. Antes vivia
 * dentro de la pantalla de repartidores; al necesitarlo en dos lados, copiarlo
 * habria dejado dos sitios donde arreglar el mismo detalle.
 *
 * El PIN se muestra con puntos y se puede ver con un toque: quien lo asigna lo
 * tiene que dictar, pero no hace falta que quede a la vista del mostrador
 * mientras lo teclea.
 */

import { useState } from 'react';

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'BORRAR', '0', 'VER'] as const;

export const LARGO_MINIMO_PIN = 4;
export const LARGO_MAXIMO_PIN = 6;

interface Props {
  valor: string;
  alCambiar: (valor: string) => void;
  bloqueado?: boolean;
  /** Que decir cuando todavia no hay nada tecleado. */
  vacio?: string;
}

export function TecladoPin({
  valor,
  alCambiar,
  bloqueado = false,
  vacio = 'Teclee el PIN',
}: Props) {
  const [ver, setVer] = useState(false);

  const etiqueta = (tecla: (typeof TECLAS)[number]) => {
    if (tecla === 'BORRAR') return 'Borrar';
    if (tecla === 'VER') return ver ? 'Ocultar' : 'Ver';
    return tecla;
  };

  return (
    <div>
      <div
        className="cifra flex h-20 items-center justify-center rounded-2xl border border-borde bg-fondo text-4xl font-bold tracking-[0.4em]"
        aria-live="polite"
      >
        {valor.length === 0 ? (
          <span className="text-base tracking-normal text-slate-600">{vacio}</span>
        ) : ver ? (
          valor
        ) : (
          '•'.repeat(valor.length)
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {TECLAS.map((tecla) => (
          <button
            key={tecla}
            type="button"
            disabled={bloqueado}
            onClick={() => {
              if (tecla === 'BORRAR') alCambiar(valor.slice(0, -1));
              else if (tecla === 'VER') setVer((v) => !v);
              else if (valor.length < LARGO_MAXIMO_PIN) alCambiar(valor + tecla);
            }}
            className={`h-16 rounded-2xl border border-borde bg-panelClaro font-bold active:scale-95 disabled:opacity-40 ${
              tecla.length === 1 ? 'text-2xl' : 'text-sm text-slate-300'
            }`}
          >
            {etiqueta(tecla)}
          </button>
        ))}
      </div>
    </div>
  );
}
