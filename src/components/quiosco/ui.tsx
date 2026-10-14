'use client';

/**
 * Piezas que comparten las pantallas de la app de clientes.
 */

import { useEffect } from 'react';

import { formatearMoneda } from '@/lib/money/money';

export const colones = (centimos: number): string => formatearMoneda(centimos);

/** Una hoja que sube desde abajo (en pantalla grande, una tarjeta al centro). */
export function Hoja({
  titulo,
  alCerrar,
  children,
  pie,
}: {
  titulo: string;
  alCerrar: () => void;
  children: React.ReactNode;
  pie?: React.ReactNode;
}) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = antes;
    };
  }, [alCerrar]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <button type="button" aria-label="Cerrar" onClick={alCerrar} className="absolute inset-0 bg-black/50" />
      <div className="relative flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-[2rem] bg-crema shadow-2xl sm:rounded-[2rem]">
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <h2 className="text-2xl font-extrabold leading-tight">{titulo}</h2>
          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-2xl shadow-sm"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-4">{children}</div>
        {pie && <div className="border-t border-black/10 bg-crema px-5 py-4">{pie}</div>}
      </div>
    </div>
  );
}

export function Paso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-tinta/60">{titulo}</h3>
      {children}
    </section>
  );
}

export function Contador({
  valor,
  minimo,
  maximo,
  alCambiar,
  etiqueta,
}: {
  valor: number;
  minimo: number;
  maximo: number;
  alCambiar: (n: number) => void;
  etiqueta: string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-white p-1 shadow-sm">
      <button
        type="button"
        aria-label={`Quitar ${etiqueta}`}
        disabled={valor <= minimo}
        onClick={() => alCambiar(valor - 1)}
        className="flex h-11 w-11 items-center justify-center rounded-full text-2xl font-bold text-tomate disabled:opacity-30"
      >
        −
      </button>
      <span className="min-w-8 text-center text-lg font-extrabold" aria-live="polite">
        {valor}
      </span>
      <button
        type="button"
        aria-label={`Agregar ${etiqueta}`}
        disabled={valor >= maximo}
        onClick={() => alCambiar(valor + 1)}
        className="flex h-11 w-11 items-center justify-center rounded-full text-2xl font-bold text-albahaca disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

/** Una tarjeta blanca con titulo, como los bloques de una pantalla de pedido. */
export function Tarjeta({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <h2 className="mb-3 text-lg font-extrabold">{titulo}</h2>
      {children}
    </section>
  );
}
