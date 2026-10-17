/**
 * Que puede hacer cada rol.
 *
 * Los tres roles existian en la base desde el principio, pero no gobernaban
 * nada: cualquier usuario podia editar la flota o borrar una evidencia. El rol
 * solo se consultaba para el PIN de los repartidores.
 *
 * La matriz vive aqui, en un solo lugar, y no repartida por las acciones. Ver
 * de un vistazo quien puede que es lo que permite discutirlo con el negocio
 * sin leer codigo.
 *
 * CAJERO      lo de cada noche: los pedidos, el tablero y el historial.
 * SUPERVISOR  ademas, lo que corrige o reconfigura el dia: los repartidores
 *             con sus motos y los clientes.
 * ADMIN       ademas, las llaves: usuarios, roles y PIN.
 *
 * Aqui habia dos permisos mas, CAJA e IMPORTAR, de cuando el sistema cerraba
 * la caja y cargaba el Excel de ventas. Las dos cosas salieron: la caja porque
 * el negocio dejo de llevarla aqui, y la importacion porque los datos ya
 * llegan solos desde la base del POS.
 */

import { ErrorNegocio } from '@/server/errores';

export const PERMISOS = {
  /** Los pedidos, el tablero y el historial. Lo mira cualquiera del mostrador. */
  OPERACION: ['CAJERO', 'SUPERVISOR', 'ADMIN'],
  /** Alta, edicion y baja de repartidores, y que moto trae cada uno. */
  REPARTIDORES: ['SUPERVISOR', 'ADMIN'],
  /** Usuarios del sistema, sus roles y los PIN de todo el mundo. */
  USUARIOS: ['ADMIN'],
  /**
   * La base de clientes y los pedidos de ubicacion por WhatsApp.
   *
   * No es de los cajeros porque aqui se decide a que miles de telefonos se
   * le escribe. Un mensaje de mas no se puede recoger, y una tanda mal
   * armada hace que WhatsApp bloquee el numero de la pizzeria.
   */
  CLIENTES: ['SUPERVISOR', 'ADMIN'],
} as const satisfies Record<string, ReadonlyArray<string>>;

export type Permiso = keyof typeof PERMISOS;

export function tienePermiso(rol: string, permiso: Permiso): boolean {
  return (PERMISOS[permiso] as ReadonlyArray<string>).includes(rol);
}

const COMO_SE_LLAMA: Record<Permiso, string> = {
  OPERACION: 'los pedidos y el historial',
  REPARTIDORES: 'los repartidores y las motos',
  USUARIOS: 'los usuarios',
  CLIENTES: 'los clientes y sus ubicaciones',
};

const QUIEN_SI: Record<Permiso, string> = {
  OPERACION: 'un usuario del mostrador',
  REPARTIDORES: 'un supervisor o un administrador',
  USUARIOS: 'un administrador',
  CLIENTES: 'un supervisor o un administrador',
};

/** Falla con un mensaje que dice a quien hay que pedirle que lo haga. */
export function exigirPermiso(quien: { rol: string }, permiso: Permiso): void {
  if (tienePermiso(quien.rol, permiso)) return;
  throw new ErrorNegocio(
    'DATOS_INVALIDOS',
    `Su usuario no puede tocar ${COMO_SE_LLAMA[permiso]}. Eso lo hace ${QUIEN_SI[permiso]}.`,
  );
}
