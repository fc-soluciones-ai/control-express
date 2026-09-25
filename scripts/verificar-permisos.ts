/**
 * Prueba de roles y de los usuarios de caja.
 *
 * Lo que se comprueba no es que la pantalla esconda un boton, sino que el
 * servidor diga que no: esconder el boton solo evita el error honesto.
 *
 * Ejecutar con: npm run test:permisos
 */

import { prisma } from '@/lib/db/prisma';
import { esErrorNegocio } from '@/server/errores';
import { PERMISOS, tienePermiso, type Permiso } from '@/server/permisos';
import { hashearPin, verificarPin } from '@/server/services/pin';
import {
  asignarPinUsuario,
  cambiarMiPin,
  crearUsuario,
  editarUsuario,
  listarUsuarios,
} from '@/server/services/usuarios';
import { exigirBaseDePruebas } from './guarda-pruebas';

let fallos = 0;

function comprobar(descripcion: string, real: unknown, esperado: unknown): void {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos += 1;
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${descripcion}`);
  if (!ok) {
    console.log(`      esperado: ${JSON.stringify(esperado)}`);
    console.log(`      obtenido: ${JSON.stringify(real)}`);
  }
}

async function mensaje(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
    return 'SIN_ERROR';
  } catch (e) {
    if (esErrorNegocio(e)) return e.message;
    console.error(e);
    return 'ERROR_INESPERADO';
  }
}

async function limpiar(): Promise<void> {
  await prisma.sesion.deleteMany();
  await prisma.eventoAuditoria.deleteMany();
  await prisma.chofer.deleteMany();
  await prisma.cajero.deleteMany();
}

async function main(): Promise<void> {
  exigirBaseDePruebas();
  await limpiar();

  // -------------------------------------------------------------------------
  console.log('--- La matriz de permisos ---');

  const deRol = (rol: string) =>
    (Object.keys(PERMISOS) as Permiso[]).filter((p) => tienePermiso(rol, p)).sort();

  comprobar('el cajero solo opera la caja', deRol('CAJERO'), ['CAJA']);
  comprobar('el supervisor corrige y configura el dia', deRol('SUPERVISOR'), [
    'BORRAR_EVIDENCIA',
    'CAJA',
    'FLOTA',
    'IMPORTAR',
    'REPARTIDORES',
  ]);
  comprobar('el administrador ademas lleva las llaves', deRol('ADMIN'), [
    'BORRAR_EVIDENCIA',
    'CAJA',
    'FLOTA',
    'IMPORTAR',
    'REPARTIDORES',
    'USUARIOS',
  ]);
  comprobar('un rol inventado no puede nada', deRol('VISITA'), []);

  // -------------------------------------------------------------------------
  console.log('\n--- Alta de usuarios de caja ---');

  const admin = await prisma.cajero.create({
    data: { nombre: 'Administrador', pin: hashearPin('162738'), rol: 'ADMIN' },
  });
  const quienAdmin = { id: admin.id, rol: 'ADMIN' };
  const quienCajero = { id: 'otro', rol: 'CAJERO' };

  comprobar(
    'un cajero no crea usuarios',
    (await mensaje(crearUsuario({ nombre: 'Colado', rol: 'ADMIN', pin: '4827' }, quienCajero))).startsWith(
      'Su usuario no puede tocar los usuarios',
    ),
    true,
  );
  comprobar(
    'ni un supervisor',
    (await mensaje(
      crearUsuario({ nombre: 'Colado', rol: 'CAJERO', pin: '4827' }, { id: 'x', rol: 'SUPERVISOR' }),
    )).startsWith('Su usuario no puede tocar los usuarios'),
    true,
  );
  comprobar(
    'el nombre corto se rechaza',
    await mensaje(crearUsuario({ nombre: 'Ka', rol: 'CAJERO', pin: '4827' }, quienAdmin)),
    'El nombre debe tener al menos 3 letras.',
  );
  comprobar(
    'el PIN facil se rechaza',
    await mensaje(crearUsuario({ nombre: 'Karla', rol: 'CAJERO', pin: '1234' }, quienAdmin)),
    'Ese PIN es de los primeros que alguien probaria. Elija otro.',
  );
  comprobar(
    'el rol inventado se rechaza',
    await mensaje(crearUsuario({ nombre: 'Karla', rol: 'DUENO', pin: '4827' }, quienAdmin)),
    'Ese rol no existe.',
  );

  const karla = await crearUsuario({ nombre: '  Karla  (Caja 1) ', rol: 'CAJERO', pin: '4827' }, quienAdmin);
  const guardada = await prisma.cajero.findUnique({ where: { id: karla.id } });
  comprobar('el nombre se limpia', guardada?.nombre, 'Karla (Caja 1)');
  comprobar('el PIN se guarda derivado', guardada?.pin.startsWith('scrypt$'), true);
  comprobar('y sirve para entrar', verificarPin('4827', guardada?.pin ?? ''), true);
  comprobar(
    'no se repite el nombre',
    await mensaje(crearUsuario({ nombre: 'Karla (Caja 1)', rol: 'CAJERO', pin: '5938' }, quienAdmin)),
    'Ya hay un usuario llamado Karla (Caja 1).',
  );

  // -------------------------------------------------------------------------
  console.log('\n--- Cambios de rol y de estado ---');

  await editarUsuario(karla.id, { rol: 'SUPERVISOR' }, quienAdmin);
  comprobar(
    'el rol cambia',
    (await prisma.cajero.findUnique({ where: { id: karla.id } }))?.rol,
    'SUPERVISOR',
  );

  const evento = await prisma.eventoAuditoria.findFirst({
    where: { tipo: 'USUARIO_EDITADO', entidadId: karla.id },
    orderBy: { timestamp: 'desc' },
  });
  comprobar('la bitacora guarda como estaba', JSON.parse(evento?.valoresAnteriores ?? '{}'), {
    rol: 'CAJERO',
  });
  comprobar('y como quedo', JSON.parse(evento?.valoresNuevos ?? '{}'), { rol: 'SUPERVISOR' });
  comprobar('firmado por el administrador', evento?.cajeroId, admin.id);

  comprobar(
    'el administrador no se desactiva a si mismo',
    await mensaje(editarUsuario(admin.id, { estado: 'INACTIVO' }, quienAdmin)),
    'No puede quitarse a si mismo el rol de administrador ni desactivarse.',
  );
  comprobar(
    'ni se quita su propio rol',
    await mensaje(editarUsuario(admin.id, { rol: 'CAJERO' }, quienAdmin)),
    'No puede quitarse a si mismo el rol de administrador ni desactivarse.',
  );

  // Con dos administradores si se puede degradar a otro, pero nunca al ultimo.
  const segundo = await crearUsuario({ nombre: 'Segundo Admin', rol: 'ADMIN', pin: '7351' }, quienAdmin);
  await editarUsuario(segundo.id, { rol: 'CAJERO' }, quienAdmin);
  comprobar(
    'se puede degradar a otro administrador',
    (await prisma.cajero.findUnique({ where: { id: segundo.id } }))?.rol,
    'CAJERO',
  );
  comprobar(
    'pero no al ultimo que queda',
    await mensaje(editarUsuario(admin.id, { rol: 'CAJERO' }, { id: segundo.id, rol: 'ADMIN' })),
    'Es el unico administrador activo. Nombre otro antes de cambiar este.',
  );

  // Desactivar cierra las sesiones de ese usuario.
  await prisma.sesion.create({
    data: {
      cajeroId: karla.id,
      tokenHash: 'a'.repeat(64),
      expiraEn: new Date(Date.now() + 3_600_000),
    },
  });
  await editarUsuario(karla.id, { estado: 'INACTIVO' }, quienAdmin);
  comprobar(
    'desactivar cierra sus sesiones',
    await prisma.sesion.count({ where: { cajeroId: karla.id } }),
    0,
  );
  comprobar(
    'a un inactivo no se le da PIN',
    (await mensaje(asignarPinUsuario(karla.id, '5938', quienAdmin))).includes('esta inactivo'),
    true,
  );

  await editarUsuario(karla.id, { estado: 'ACTIVO' }, quienAdmin);

  // -------------------------------------------------------------------------
  console.log('\n--- PIN de un usuario de caja ---');

  await prisma.cajero.update({
    where: { id: karla.id },
    data: { intentosFallidos: 5, bloqueadoHasta: new Date(Date.now() + 600_000) },
  });
  await prisma.sesion.create({
    data: {
      cajeroId: karla.id,
      tokenHash: 'b'.repeat(64),
      expiraEn: new Date(Date.now() + 3_600_000),
    },
  });

  const reseteo = await asignarPinUsuario(karla.id, '5938', quienAdmin);
  comprobar('resetear cierra su sesion', reseteo.sesionesCerradas, 1);
  const trasReseteo = await prisma.cajero.findUnique({ where: { id: karla.id } });
  comprobar('y la desbloquea', [trasReseteo?.intentosFallidos, trasReseteo?.bloqueadoHasta], [0, null]);
  comprobar('el PIN nuevo sirve', verificarPin('5938', trasReseteo?.pin ?? ''), true);
  comprobar('el viejo ya no', verificarPin('4827', trasReseteo?.pin ?? ''), false);

  const pinEnBitacora = await prisma.eventoAuditoria.findMany({
    where: { tipo: 'PIN_CAMBIADO', entidadId: karla.id },
  });
  comprobar(
    'el PIN nunca queda escrito',
    pinEnBitacora.some((e) =>
      `${e.detalle ?? ''}${e.valoresAnteriores ?? ''}${e.valoresNuevos ?? ''}`.includes('5938'),
    ),
    false,
  );

  // -------------------------------------------------------------------------
  console.log('\n--- Cada quien cambia su propio PIN ---');

  comprobar(
    'sin el PIN actual no se puede',
    await mensaje(cambiarMiPin({ id: karla.id }, '0000', '6274')),
    'El PIN actual no es el correcto.',
  );
  comprobar(
    'ni poniendo el mismo de siempre',
    await mensaje(cambiarMiPin({ id: karla.id }, '5938', '5938')),
    'El PIN nuevo tiene que ser distinto al actual.',
  );
  await cambiarMiPin({ id: karla.id }, '5938', '6274');
  comprobar(
    'con el actual si',
    verificarPin('6274', (await prisma.cajero.findUnique({ where: { id: karla.id } }))?.pin ?? ''),
    true,
  );

  const lista = await listarUsuarios();
  comprobar('la lista no expone ningun PIN', JSON.stringify(lista).includes('scrypt$'), false);
  comprobar('y trae a los tres usuarios', lista.length, 3);

  await limpiar();
  console.log(
    fallos === 0
      ? '\nTodas las comprobaciones pasaron.\n'
      : `\n${fallos} comprobacion(es) fallaron.\n`,
  );
  process.exitCode = fallos === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
