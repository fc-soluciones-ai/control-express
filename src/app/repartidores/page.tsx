/**
 * Modulo 4: pantalla de gestion de repartidores.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Cabecera } from '@/components/Cabecera';
import { PanelChoferes } from '@/components/PanelChoferes';
import { listarChoferesConHistoria } from '@/server/services/choferes';
import { tienePermiso } from '@/server/permisos';
import { cajeroDeSesion } from '@/server/services/sesion';

export const dynamic = 'force-dynamic';

export default async function Choferes() {
  const cajero = await cajeroDeSesion();
  if (!cajero) redirect('/entrar');
  // Sin el rol, la pantalla no se abre: esconder el boton no basta.
  if (!tienePermiso(cajero.rol, 'REPARTIDORES')) redirect('/sin-permiso');

  const choferes = await listarChoferesConHistoria();

  return (
    <main className="mx-auto max-w-4xl p-5">
      <Cabecera
        migas={[{ etiqueta: 'Inicio', href: '/' }, { etiqueta: 'Repartidores' }]}
        usuario={cajero}
      />
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gestion de repartidores</h1>
          <p className="text-slate-400">
            {choferes.length} repartidor{choferes.length === 1 ? '' : 'es'} registrado
            {choferes.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <PanelChoferes choferes={choferes} esAdministrador={cajero.rol === 'ADMIN'} />
    </main>
  );
}
