/**
 * Deja la base lista para empezar a operar de verdad.
 *
 *   npm run db:vaciar                 (muestra que borraria)
 *   npm run db:vaciar -- --aplicar
 *
 * Borra los pedidos, los clientes, la flota y la bitacora. CONSERVA los
 * usuarios del sistema y los repartidores con su PIN y su foto: son las
 * personas del negocio, no datos de prueba.
 *
 * Los clientes y los pedidos se borran sin miedo porque no nacen aqui: el
 * agente los vuelve a traer de la base del POS en la siguiente pasada. Lo
 * unico que no vuelve son las ubicaciones que la gente mando por WhatsApp, y
 * por eso el volcado previo no es opcional.
 *
 * Antes de borrar nada escribe un volcado JSON de TODAS las tablas en
 * storage/vaciados/, que git ignora. No es un respaldo del motor (ver
 * docs/RESPALDOS.md), pero permite recuperar un dato que se haya ido por
 * error.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { prisma } from '../src/lib/db/prisma';
import { cargarEnv } from './entorno';

cargarEnv();

const APLICAR = process.argv.includes('--aplicar');
const DESTINO = path.resolve(process.cwd(), 'storage', 'vaciados');

/** Oculta la contrasena para poder mostrar a que base apunta. */
function sinClave(url = ''): string {
  return url.replace(/:\/\/([^:]+):[^@]+@/, '://$1:****@');
}

async function volcar(): Promise<string> {
  // Los bytes de las fotos van en base64 para que quepan en el JSON.
  const enBase64 = <T extends { contenido: Buffer | Uint8Array | null }>(filas: T[]) =>
    filas.map((f) => ({
      ...f,
      contenido: f.contenido ? Buffer.from(f.contenido).toString('base64') : null,
    }));

  const datos = {
    generado: new Date().toISOString(),
    cajeros: await prisma.cajero.findMany(),
    choferes: await prisma.chofer.findMany(),
    fotosChofer: enBase64(await prisma.fotoChofer.findMany()),
    sesiones: await prisma.sesion.findMany(),
    clientes: await prisma.cliente.findMany(),
    telefonos: await prisma.telefonoCliente.findMany(),
    solicitudes: await prisma.solicitudUbicacion.findMany(),
    ubicaciones: await prisma.ubicacionCliente.findMany(),
    mensajes: await prisma.mensajeUbicacion.findMany(),
    pedidos: await prisma.pedido.findMany(),
    motocicletas: await prisma.motocicleta.findMany(),
    asignaciones: await prisma.asignacionMoto.findMany(),
    gastos: await prisma.registroMantenimiento.findMany(),
    evidencias: enBase64(await prisma.evidencia.findMany()),
    lecturas: enBase64(await prisma.lecturaFoto.findMany()),
    eventos: await prisma.eventoAuditoria.findMany(),
  };

  await mkdir(DESTINO, { recursive: true });
  const archivo = path.join(DESTINO, `antes-de-vaciar-${Date.now()}.json`);
  await writeFile(archivo, JSON.stringify(datos, null, 2), 'utf8');
  return archivo;
}

async function main(): Promise<void> {
  console.log(`Base: ${sinClave(process.env.DATABASE_URL)}\n`);

  // El orden importa: cada tabla va antes que aquellas de las que depende.
  const tablas = [
    ['lecturas de fotos', () => prisma.lecturaFoto.deleteMany()],
    ['evidencia', () => prisma.evidencia.deleteMany()],
    ['gastos de flota', () => prisma.registroMantenimiento.deleteMany()],
    ['asignaciones de moto', () => prisma.asignacionMoto.deleteMany()],
    ['motocicletas', () => prisma.motocicleta.deleteMany()],
    ['pedidos', () => prisma.pedido.deleteMany()],
    ['mensajes de WhatsApp', () => prisma.mensajeUbicacion.deleteMany()],
    ['ubicaciones', () => prisma.ubicacionCliente.deleteMany()],
    ['solicitudes de ubicacion', () => prisma.solicitudUbicacion.deleteMany()],
    ['telefonos de cliente', () => prisma.telefonoCliente.deleteMany()],
    ['clientes', () => prisma.cliente.deleteMany()],
    ['bitacora', () => prisma.eventoAuditoria.deleteMany()],
  ] as const;

  const cuentas = {
    lecturas: await prisma.lecturaFoto.count(),
    evidencia: await prisma.evidencia.count(),
    gastos: await prisma.registroMantenimiento.count(),
    asignaciones: await prisma.asignacionMoto.count(),
    motocicletas: await prisma.motocicleta.count(),
    pedidos: await prisma.pedido.count(),
    mensajes: await prisma.mensajeUbicacion.count(),
    ubicaciones: await prisma.ubicacionCliente.count(),
    solicitudes: await prisma.solicitudUbicacion.count(),
    telefonosCliente: await prisma.telefonoCliente.count(),
    clientes: await prisma.cliente.count(),
    bitacora: await prisma.eventoAuditoria.count(),
  };
  console.log('Se borraria:');
  for (const [nombre, cuanto] of Object.entries(cuentas)) {
    console.log(`  ${nombre.padEnd(22)} ${cuanto}`);
  }

  const cajeros = await prisma.cajero.count();
  const choferes = await prisma.chofer.count();
  const conPin = await prisma.chofer.count({ where: { pin: { not: null } } });
  console.log(
    `\nSe conserva: ${cajeros} usuario(s) de caja y ${choferes} repartidor(es), ` +
      `${conPin} con PIN.`,
  );

  if (!APLICAR) {
    console.log('\nSIMULACION: no se borro nada. Repita con --aplicar.');
    return;
  }

  const archivo = await volcar();
  console.log(`\nVolcado previo: ${archivo}`);

  for (const [nombre, borrar] of tablas) {
    const { count } = await borrar();
    console.log(`  ${nombre.padEnd(22)} ${count} borrado(s)`);
  }

  console.log('\nListo. Quedan los usuarios y los repartidores.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
