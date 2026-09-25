/**
 * Que puede hacer cada rol.
 *
 * Los tres roles existian en la base desde el principio, pero no gobernaban
 * nada: cualquier usuario de caja podia importar el Excel del mes, editar la
 * flota o borrar una evidencia. El rol solo se consultaba para el PIN de los
 * repartidores.
 *
 * La matriz vive aqui, en un solo lugar, y no repartida por las acciones. Ver
 * de un vistazo quien puede que es lo que permite discutirlo con el negocio
 * sin leer codigo.
 *
 * CAJERO      la operacion del turno: abonos, turnos, cierres, arqueos y
 *             reimpresiones. Es lo que se hace cada noche en el mostrador.
 * SUPERVISOR  ademas, lo que corrige o reconfigura el dia: importar el Excel,
 *             la flota, los repartidores y borrar una foto mal tomada.
 * ADMIN       ademas, las llaves: usuarios de caja, roles y PIN.
 */

import { ErrorNegocio } from '@/server/errores';

export const PERMISOS = {
  /** Abonos, turnos, cierres, arqueos, reimpresion. */
  CAJA: ['CAJERO', 'SUPERVISOR', 'ADMIN'],
  /** Cargar el Excel de ventas de Soft Restaurant. */
  IMPORTAR: ['SUPERVISOR', 'ADMIN'],
  /** Alta y edicion de motos, gastos de taller, GPS, asignaciones. */
  FLOTA: ['SUPERVISOR', 'ADMIN'],
  /** Alta, edicion y baja de repartidores. */
  REPARTIDORES: ['SUPERVISOR', 'ADMIN'],
  /** Quitar una foto ya subida. Deja hueco en la evidencia: no es de todos. */
  BORRAR_EVIDENCIA: ['SUPERVISOR', 'ADMIN'],
  /** Usuarios de caja, sus roles y los PIN de todo el mundo. */
  USUARIOS: ['ADMIN'],
} as const satisfies Record<string, ReadonlyArray<string>>;

export type Permiso = keyof typeof PERMISOS;

export function tienePermiso(rol: string, permiso: Permiso): boolean {
  return (PERMISOS[permiso] as ReadonlyArray<string>).includes(rol);
}

const COMO_SE_LLAMA: Record<Permiso, string> = {
  CAJA: 'la caja',
  IMPORTAR: 'importar el Excel',
  FLOTA: 'la flota',
  REPARTIDORES: 'los repartidores',
  BORRAR_EVIDENCIA: 'borrar evidencia',
  USUARIOS: 'los usuarios',
};

const QUIEN_SI: Record<Permiso, string> = {
  CAJA: 'un usuario de caja',
  IMPORTAR: 'un supervisor o un administrador',
  FLOTA: 'un supervisor o un administrador',
  REPARTIDORES: 'un supervisor o un administrador',
  BORRAR_EVIDENCIA: 'un supervisor o un administrador',
  USUARIOS: 'un administrador',
};

/** Falla con un mensaje que dice a quien hay que pedirle que lo haga. */
export function exigirPermiso(quien: { rol: string }, permiso: Permiso): void {
  if (tienePermiso(quien.rol, permiso)) return;
  throw new ErrorNegocio(
    'DATOS_INVALIDOS',
    `Su usuario no puede tocar ${COMO_SE_LLAMA[permiso]}. Eso lo hace ${QUIEN_SI[permiso]}.`,
  );
}
