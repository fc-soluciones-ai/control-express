/**
 * Configuracion: lo que se toca de vez en cuando, no cada noche.
 *
 * Vive aparte del tablero a proposito. El tablero es para la operacion del
 * turno; mezclar ahi los usuarios y los parametros pone a un clic de distancia
 * cosas que no deberian tocarse con prisa.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { tienePermiso } from '@/server/permisos';
import { cajeroDeSesion } from '@/server/services/sesion';

export const dynamic = 'force-dynamic';

export default async function Configuracion() {
  const cajero = await cajeroDeSesion();
  if (!cajero) redirect('/entrar');
  if (!tienePermiso(cajero.rol, 'USUARIOS')) redirect('/');

  return (
    <main className="mx-auto max-w-4xl p-5">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Configuracion</h1>
          <p className="text-slate-400">Usuarios, accesos y parametros del sistema</p>
        </div>
        <Link
          href="/"
          className="boton-tactil shrink-0 border border-borde bg-panelClaro px-6 text-slate-200"
        >
          Volver
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/configuracion/usuarios" className="tarjeta block p-6 active:scale-[0.99]">
          <p className="text-3xl">👤</p>
          <p className="mt-3 text-xl font-bold">Usuarios de caja</p>
          <p className="mt-1 text-sm text-slate-400">
            Crear usuarios, cambiar su rol, sacarlos de servicio y resetear el PIN.
          </p>
        </Link>

        <Link href="/repartidores" className="tarjeta block p-6 active:scale-[0.99]">
          <p className="text-3xl">🛵</p>
          <p className="mt-3 text-xl font-bold">Repartidores y su acceso</p>
          <p className="mt-1 text-sm text-slate-400">
            Alta de repartidores y el PIN con que entran desde su telefono.
          </p>
        </Link>
      </div>
    </main>
  );
}
