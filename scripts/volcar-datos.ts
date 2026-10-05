/**
 * Saca todas las tablas a un archivo JSON.
 *
 *   npm run db:volcar
 *
 * Su pareja es cargar-volcado.ts, que lo vuelve a meter.
 *
 * PARA QUE SIRVE DE VERDAD
 *
 * Esto nacio para mudar la base de SQLite a PostgreSQL. La mudanza ya paso.
 * Lo que quedo es la red: un archivo que se puede guardar antes de tocar el
 * esquema o antes de vaciar algo, y que se lee desde cualquier motor porque es
 * texto plano.
 *
 * Se escribe asi porque ya se perdio una base por no tener esto a mano. No es
 * un respaldo del motor, que es una copia binaria verificada; es un volcado
 * logico, mas pobre y mas portable.
 *
 * QUE NO LLEVA
 *
 * Las sesiones. Son credenciales vivas, y volver a entrar con el PIN no le
 * cuesta nada a nadie. Tampoco las fotos ni la evidencia: son bytes, no caben
 * razonablemente en un JSON y tienen su propio respaldo.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { cargarEnv } from './entorno';
import { prisma } from '../src/lib/db/prisma';

cargarEnv();

const DESTINO = path.resolve(process.cwd(), 'storage', 'volcados');

async function main(): Promise<void> {
  const datos = {
    generado: new Date().toISOString(),
    // El orden importa al cargarlo: cada tabla va despues de aquellas de las
    // que depende por llave foranea.
    cajeros: await prisma.cajero.findMany(),
    choferes: await prisma.chofer.findMany(),
    motocicletas: await prisma.motocicleta.findMany(),
    asignaciones: await prisma.asignacionMoto.findMany(),
    gastos: await prisma.registroMantenimiento.findMany(),
    clientes: await prisma.cliente.findMany(),
    telefonos: await prisma.telefonoCliente.findMany(),
    solicitudes: await prisma.solicitudUbicacion.findMany(),
    ubicaciones: await prisma.ubicacionCliente.findMany(),
    mensajes: await prisma.mensajeUbicacion.findMany(),
    pedidos: await prisma.pedido.findMany(),
    eventos: await prisma.eventoAuditoria.findMany(),
  };

  await mkdir(DESTINO, { recursive: true });
  const archivo = path.join(DESTINO, `volcado-${Date.now()}.json`);
  await writeFile(archivo, JSON.stringify(datos, null, 2), 'utf8');

  console.log(`Volcado a: ${archivo}\n`);
  for (const [clave, valor] of Object.entries(datos)) {
    if (Array.isArray(valor)) {
      console.log(`  ${clave.padEnd(16)} ${String(valor.length).padStart(6)} fila(s)`);
    }
  }
  console.log('\nPara volver a meterlo:  npm run db:cargar -- --archivo <ruta> --aplicar');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
