/**
 * Pantalla 404.
 *
 * Next trae una por defecto, en blanco y en ingles. En una tableta de
 * mostrador eso parece una aplicacion rota; aqui se ve como el resto del
 * sistema y siempre ofrece el camino de vuelta.
 */

import Link from 'next/link';

export default function NoEncontrada() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center p-5">
      <div className="tarjeta w-full p-8 text-center">
        <p className="text-6xl">🧭</p>
        <h1 className="mt-4 text-2xl font-bold">Esa pantalla no existe</h1>
        <p className="mt-2 text-slate-400">
          Puede que el enlace este viejo o que la direccion tenga un error de dedo.
        </p>
        <Link href="/" className="boton-tactil mt-6 inline-flex bg-entrada px-8 text-slate-950">
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
