/**
 * Usuarios de caja: quienes entran por la pestana Administrador.
 *
 * Hasta ahora solo se podian crear desde la terminal, con el seed o con
 * npm run pin. Eso dejaba al negocio sin poder dar de alta a un cajero nuevo
 * un sabado por la noche, y empujaba a que todos entraran con el mismo
 * usuario, que es justo lo que rompe la firma de cada movimiento.
 *
 * Un usuario NUNCA se borra: se desactiva. Sus abonos, cierres y arqueos
 * quedan firmados por el, y borrarlo dejaria la contabilidad sin autor.
 *
 * Dos reglas que existen para no quedarse afuera de la propia aplicacion:
 *   1. Nadie se desactiva a si mismo ni se quita su propio rol de ADMIN.
 *   2. Siempre queda al menos un ADMIN activo.
 */

import { prisma } from '@/lib/db/prisma';
import { ErrorNegocio } from '@/server/errores';
import { exigirPermiso } from '@/server/permisos';
import { ipDeLaPeticion } from '@/server/peticion';
import { registrarEvento, soloLoQueCambio } from '@/server/services/auditoria';
import { hashearPin, motivoPinInvalido } from '@/server/services/pin';
import { ROL_CAJERO } from '@/types/enums';

export interface UsuarioDeCaja {
  id: string;
  nombre: string;
  rol: string;
  estado: string;
  creadoEn: Date;
  /** Bloqueado por intentos fallidos hasta esta hora, si lo esta. */
  bloqueadoHasta: Date | null;
  /** Cuantas sesiones tiene abiertas ahora mismo. */
  sesionesAbiertas: number;
  /** Si ya firmo movimientos. Un usuario con historia no se puede borrar. */
  tieneMovimientos: boolean;
}

export async function listarUsuarios(): Promise<UsuarioDeCaja[]> {
  const usuarios = await prisma.cajero.findMany({
    orderBy: [{ estado: 'asc' }, { nombre: 'asc' }],
    select: {
      id: true,
      nombre: true,
      rol: true,
      estado: true,
      createdAt: true,
      bloqueadoHasta: true,
      _count: { select: { sesiones: true, abonos: true, cierres: true, arqueos: true } },
    },
  });

  const ahora = new Date();
  return usuarios.map((u) => ({
    id: u.id,
    nombre: u.nombre,
    rol: u.rol,
    estado: u.estado,
    creadoEn: u.createdAt,
    bloqueadoHasta: u.bloqueadoHasta && u.bloqueadoHasta > ahora ? u.bloqueadoHasta : null,
    sesionesAbiertas: u._count.sesiones,
    tieneMovimientos: u._count.abonos + u._count.cierres + u._count.arqueos > 0,
  }));
}

function exigirRolValido(rol: string): void {
  if (!(ROL_CAJERO as ReadonlyArray<string>).includes(rol)) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Ese rol no existe.');
  }
}

function exigirNombre(nombre: string): string {
  const limpio = nombre.replace(/\s+/g, ' ').trim();
  if (limpio.length < 3) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'El nombre debe tener al menos 3 letras.');
  }
  return limpio.slice(0, 60);
}

function exigirPin(pin: string): string {
  const limpio = String(pin ?? '').trim();
  const motivo = motivoPinInvalido(limpio);
  if (motivo) throw new ErrorNegocio('DATOS_INVALIDOS', motivo);
  return limpio;
}

/** Que no quede la caja sin nadie que pueda administrarla. */
async function exigirQueQuedeUnAdmin(
  tx: Parameters<typeof registrarEvento>[0],
  idQueCambia: string,
): Promise<void> {
  const otros = await tx.cajero.count({
    where: { rol: 'ADMIN', estado: 'ACTIVO', id: { not: idQueCambia } },
  });
  if (otros === 0) {
    throw new ErrorNegocio(
      'DATOS_INVALIDOS',
      'Es el unico administrador activo. Nombre otro antes de cambiar este.',
    );
  }
}

export async function crearUsuario(
  entrada: { nombre: string; rol: string; pin: string },
  quien: { id: string; rol: string },
): Promise<{ id: string }> {
  exigirPermiso(quien, 'USUARIOS');
  const nombre = exigirNombre(entrada.nombre);
  exigirRolValido(entrada.rol);
  const pin = exigirPin(entrada.pin);
  const ip = await ipDeLaPeticion();

  return prisma.$transaction(async (tx) => {
    const repetido = await tx.cajero.findFirst({ where: { nombre } });
    if (repetido) {
      throw new ErrorNegocio('DATOS_INVALIDOS', `Ya hay un usuario llamado ${nombre}.`);
    }

    const creado = await tx.cajero.create({
      data: { nombre, rol: entrada.rol, pin: hashearPin(pin) },
      select: { id: true },
    });

    await registrarEvento(tx, {
      tipo: 'USUARIO_CREADO',
      cajeroId: quien.id,
      entidadTipo: 'Cajero',
      entidadId: creado.id,
      detalle: { nombre, rol: entrada.rol },
      despues: { nombre, rol: entrada.rol, estado: 'ACTIVO' },
      ip,
    });

    return creado;
  });
}

export async function editarUsuario(
  id: string,
  cambios: { nombre?: string; rol?: string; estado?: string },
  quien: { id: string; rol: string },
): Promise<void> {
  exigirPermiso(quien, 'USUARIOS');
  if (cambios.rol) exigirRolValido(cambios.rol);
  if (cambios.estado && !['ACTIVO', 'INACTIVO'].includes(cambios.estado)) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Ese estado no existe.');
  }
  const ip = await ipDeLaPeticion();

  await prisma.$transaction(async (tx) => {
    const antes = await tx.cajero.findUnique({
      where: { id },
      select: { id: true, nombre: true, rol: true, estado: true },
    });
    if (!antes) throw new ErrorNegocio('CAJERO_NO_ENCONTRADO', 'Ese usuario no existe.');

    const nuevo = {
      nombre: cambios.nombre === undefined ? antes.nombre : exigirNombre(cambios.nombre),
      rol: cambios.rol ?? antes.rol,
      estado: cambios.estado ?? antes.estado,
    };

    const sePierdeAdmin =
      antes.rol === 'ADMIN' && (nuevo.rol !== 'ADMIN' || nuevo.estado !== 'ACTIVO');
    if (sePierdeAdmin) {
      if (antes.id === quien.id) {
        throw new ErrorNegocio(
          'DATOS_INVALIDOS',
          'No puede quitarse a si mismo el rol de administrador ni desactivarse.',
        );
      }
      await exigirQueQuedeUnAdmin(tx, antes.id);
    }

    if (nuevo.nombre !== antes.nombre) {
      const repetido = await tx.cajero.findFirst({
        where: { nombre: nuevo.nombre, id: { not: antes.id } },
      });
      if (repetido) {
        throw new ErrorNegocio('DATOS_INVALIDOS', `Ya hay un usuario llamado ${nuevo.nombre}.`);
      }
    }

    await tx.cajero.update({ where: { id: antes.id }, data: nuevo });

    // Un usuario desactivado no debe seguir adentro con la sesion de antes.
    if (nuevo.estado !== 'ACTIVO') {
      await tx.sesion.deleteMany({ where: { cajeroId: antes.id } });
    }

    const cambio = soloLoQueCambio(
      { nombre: antes.nombre, rol: antes.rol, estado: antes.estado },
      nuevo,
    );
    if (!cambio) return;

    await registrarEvento(tx, {
      tipo: 'USUARIO_EDITADO',
      cajeroId: quien.id,
      entidadTipo: 'Cajero',
      entidadId: antes.id,
      detalle: { nombre: nuevo.nombre },
      antes: cambio.antes,
      despues: cambio.despues,
      ip,
    });
  });
}

/**
 * Le pone un PIN nuevo a un usuario de caja.
 *
 * Desbloquea los intentos fallidos y cierra sus sesiones: si se cambia el PIN
 * es porque el anterior se olvido o se filtro, y un equipo que entro con el
 * viejo no deberia seguir adentro.
 */
export async function asignarPinUsuario(
  id: string,
  pin: string,
  quien: { id: string; rol: string },
): Promise<{ sesionesCerradas: number; nombre: string }> {
  exigirPermiso(quien, 'USUARIOS');
  const limpio = exigirPin(pin);
  const ip = await ipDeLaPeticion();

  return prisma.$transaction(async (tx) => {
    const usuario = await tx.cajero.findUnique({
      where: { id },
      select: { id: true, nombre: true, estado: true },
    });
    if (!usuario) throw new ErrorNegocio('CAJERO_NO_ENCONTRADO', 'Ese usuario no existe.');
    if (usuario.estado !== 'ACTIVO') {
      throw new ErrorNegocio(
        'DATOS_INVALIDOS',
        `${usuario.nombre} esta inactivo. Reactivelo antes de darle PIN.`,
      );
    }

    await tx.cajero.update({
      where: { id: usuario.id },
      data: { pin: hashearPin(limpio), intentosFallidos: 0, bloqueadoHasta: null },
    });

    // Quien se cambia su propio PIN se queda adentro: cerrarle la sesion lo
    // sacaria de la pantalla en la que acaba de tocar el boton.
    const { count } =
      usuario.id === quien.id
        ? { count: 0 }
        : await tx.sesion.deleteMany({ where: { cajeroId: usuario.id } });

    await registrarEvento(tx, {
      tipo: 'PIN_CAMBIADO',
      cajeroId: quien.id,
      entidadTipo: 'Cajero',
      entidadId: usuario.id,
      detalle: {
        nombre: usuario.nombre,
        accion: usuario.id === quien.id ? 'PROPIO' : 'RESETEADO',
      },
      ip,
    });

    return { sesionesCerradas: count, nombre: usuario.nombre };
  });
}

/**
 * Cambio del PIN propio, sin ser administrador.
 *
 * Exige el PIN actual: si no, cualquiera que encuentre una pantalla abierta
 * se queda con el usuario de otro.
 */
export async function cambiarMiPin(
  quien: { id: string },
  pinActual: string,
  pinNuevo: string,
): Promise<void> {
  const { verificarPin } = await import('@/server/services/pin');
  const nuevo = exigirPin(pinNuevo);
  const usuario = await prisma.cajero.findUnique({
    where: { id: quien.id },
    select: { id: true, nombre: true, pin: true },
  });
  if (!usuario || !verificarPin(String(pinActual ?? ''), usuario.pin)) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'El PIN actual no es el correcto.');
  }
  if (verificarPin(nuevo, usuario.pin)) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'El PIN nuevo tiene que ser distinto al actual.');
  }
  const ip = await ipDeLaPeticion();

  await prisma.$transaction(async (tx) => {
    await tx.cajero.update({
      where: { id: usuario.id },
      data: { pin: hashearPin(nuevo), intentosFallidos: 0, bloqueadoHasta: null },
    });
    await registrarEvento(tx, {
      tipo: 'PIN_CAMBIADO',
      cajeroId: usuario.id,
      entidadTipo: 'Cajero',
      entidadId: usuario.id,
      detalle: { nombre: usuario.nombre, accion: 'PROPIO' },
      ip,
    });
  });
}
