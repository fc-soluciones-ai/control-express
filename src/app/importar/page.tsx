/**
 * Modulo 3, primera mitad: pantalla de importacion de Excel.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ImportadorExcel } from '@/components/ImportadorExcel';
import { diaOperativoDe } from '@/lib/fechas';
import { tienePermiso } from '@/server/permisos';
import { cajeroDeSesion } from '@/server/services/sesion';

export const dynamic = 'force-dynamic';

export default async function Importar() {
  const cajero = await cajeroDeSesion();
  if (!cajero) redirect('/entrar');
  // Sin el rol, la pantalla no se abre: esconder el boton no basta.
  if (!tienePermiso(cajero.rol, 'IMPORTAR')) redirect('/');

  return (
    <main className="mx-auto max-w-5xl p-5">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Importar Excel</h1>
          <p className="text-slate-400">
            Ventas por mesero de Soft Restaurant · dia operativo {diaOperativoDe()}
          </p>
        </div>
        <Link
          href="/"
          className="boton-tactil shrink-0 border border-borde bg-panelClaro px-6 text-slate-200"
        >
          Volver
        </Link>
      </div>

      <ImportadorExcel />
    </main>
  );
}
