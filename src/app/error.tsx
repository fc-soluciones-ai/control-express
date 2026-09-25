'use client';

/**
 * Pantalla 500: algo se rompio dentro de una pantalla.
 *
 * Muestra el identificador del fallo, que es lo unico que sirve para buscarlo
 * despues en los registros del servidor, y ofrece reintentar sin perder la
 * sesion. El detalle tecnico no se pinta: en el mostrador no dice nada y
 * puede filtrar datos.
 */

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[pantalla]', error.digest ?? error.message);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center p-5">
      <div className="tarjeta w-full p-8 text-center">
        <p className="text-6xl">⚠️</p>
        <h1 className="mt-4 text-2xl font-bold">Algo fallo en esta pantalla</h1>
        <p className="mt-2 text-slate-400">
          Nada de lo que ya estaba guardado se perdio. Intente de nuevo; si vuelve a pasar, avise
          con este codigo.
        </p>
        {error.digest ? (
          <p className="cifra mt-3 rounded-xl bg-fondo p-3 text-sm text-slate-400">
            {error.digest}
          </p>
        ) : null}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={reset} className="boton-tactil bg-entrada text-slate-950">
            Reintentar
          </button>
          <Link href="/" className="boton-tactil border border-borde bg-panelClaro text-slate-200">
            Ir al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
