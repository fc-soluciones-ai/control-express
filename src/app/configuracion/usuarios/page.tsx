/**
 * Usuarios de caja. Solo administradores.
 *
 * Antes esto solo existia como comando de terminal, lo que dejaba al negocio
 * sin poder dar de alta a alguien fuera de horario y empujaba a que todos
 * entraran con el mismo usuario.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PanelUsuarios } from '@/components/PanelUsuarios';
import { tienePermiso } from '@/server/permisos';
import { cajeroDeSesion } from '@/server/services/sesion';
import { listarUsuarios } from '@/server/services/usuarios';

export const dynamic = 'force-dynamic';

export default async function Usuarios() {
  const cajero = await cajeroDeSesion();
  if (!cajero) redirect('/entrar');
  if (!tienePermiso(cajero.rol, 'USUARIOS')) redirect('/');

  const usuarios = await listarUsuarios();

  return (
    <main className="mx-auto max-w-4xl p-5">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Usuarios de caja</h1>
          <p className="text-slate-400">
            {usuarios.length} usuario{usuarios.length === 1 ? '' : 's'} · cada movimiento queda
            firmado por quien lo hizo
          </p>
        </div>
        <Link
          href="/configuracion"
          className="boton-tactil shrink-0 border border-borde bg-panelClaro px-6 text-slate-200"
        >
          Volver
        </Link>
      </div>

      <PanelUsuarios usuarios={usuarios} yoId={cajero.id} />
    </main>
  );
}
