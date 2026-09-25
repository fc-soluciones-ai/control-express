/**
 * Pantalla 403: la direccion existe, pero este usuario no puede abrirla.
 *
 * Se llega aqui, y no a un redirect callado al inicio, porque quedarse sin
 * explicacion delante de una pantalla que "no hace nada" es peor que leer que
 * hace falta otro rol. Dice a quien pedirselo.
 */

import Link from 'next/link';

import { Cabecera } from '@/components/Cabecera';
import { cajeroDeSesion } from '@/server/services/sesion';

export const dynamic = 'force-dynamic';

export default async function SinPermiso() {
  const cajero = await cajeroDeSesion();

  return (
    <main className="mx-auto max-w-lg p-5">
      <Cabecera
        migas={[{ etiqueta: 'Inicio', href: '/' }, { etiqueta: 'Sin permiso' }]}
        usuario={cajero}
      />
      <div className="tarjeta p-8 text-center">
        <p className="text-6xl">🔒</p>
        <h1 className="mt-4 text-2xl font-bold">Su usuario no puede abrir esa pantalla</h1>
        <p className="mt-2 text-slate-400">
          {cajero
            ? 'Pidale a un administrador que le cambie el rol, o que haga el movimiento por usted.'
            : 'Entre de nuevo con un usuario que tenga permiso.'}
        </p>
        <Link href="/" className="boton-tactil mt-6 inline-flex bg-entrada px-8 text-slate-950">
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
