/**
 * Respaldo completo de la base de datos, en la carpeta del proyecto.
 *
 *   npm run db:respaldo
 *
 * Deja una carpeta nueva en `respaldos/` con un archivo por tabla (una fila por
 * linea, en JSON) y un `manifiesto.json` con cuantas filas tiene cada una y su
 * huella sha256. Es de solo lectura: no cambia nada en la base.
 *
 * POR QUE OTRO ARCHIVO Y NO `db:respaldar`
 *
 * El respaldo que ya existia, con la base en PostgreSQL, solo guarda tres tablas
 * (usuarios, repartidores y bitacora). Los pedidos de la app, el menu, los
 * clientes y las motos quedaban fuera. Este recorre TODAS las tablas que haya,
 * asi que una tabla nueva entra sola, sin acordarse de agregarla a una lista.
 *
 * QUE NO LLEVA
 *
 * Las sesiones: son llaves vivas y caducan solas; volver a entrar con el PIN no
 * le cuesta nada a nadie. Los PIN van como el hash que ya tienen en la base,
 * nunca en claro.
 *
 * LA CARPETA `respaldos/` NO SE SUBE A GITHUB (esta en .gitignore): lleva
 * telefonos y direcciones de clientes.
 *
 * Devuelve codigo de salida 1 si algo fallo o si lo releido no coincide con lo
 * escrito, para que una tarea programada no aparezca en verde sin respaldo.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { cargarEnv } from './entorno';
import { prisma } from '../src/lib/db/prisma';

cargarEnv();

const NO_SE_RESPALDAN = new Set(['_prisma_migrations', 'sesiones']);
const POR_LOTE = 5000;

interface TablaRespaldada {
  filas: number;
  bytes: number;
  sha256: string;
}

function marcaDeTiempo(): string {
  const f = new Date();
  const dos = (n: number): string => String(n).padStart(2, '0');
  return `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}_${dos(f.getHours())}${dos(f.getMinutes())}${dos(f.getSeconds())}`;
}

function enMegas(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function main(): Promise<void> {
  const inicio = Date.now();
  const esquema = (await prisma.$queryRawUnsafe<Array<{ s: string }>>('SELECT current_schema() AS s'))[0]?.s ?? 'public';
  const tablas = (
    await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    )
  )
    .map((t) => t.table_name)
    .filter((t) => !NO_SE_RESPALDAN.has(t));

  const carpeta = path.resolve(process.cwd(), 'respaldos', `base-${marcaDeTiempo()}`);
  await mkdir(carpeta, { recursive: true });
  console.log(`Esquema: ${esquema} · ${tablas.length} tablas`);
  console.log(`Carpeta: ${carpeta}\n`);

  const resultado: Record<string, TablaRespaldada> = {};
  let problemas = 0;

  for (const tabla of tablas) {
    const nombre = `"${tabla.replace(/"/g, '""')}"`;
    const archivo = path.join(carpeta, `${tabla}.ndjson`);
    const esperadas = Number(
      (await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT COUNT(*) AS n FROM ${nombre}`))[0]?.n ?? 0n,
    );

    const lineas: string[] = [];
    let escritas = 0;
    // Se pagina por la primera columna para que cada vuelta traiga filas distintas.
    for (let desde = 0; desde < esperadas; desde += POR_LOTE) {
      const lote = await prisma.$queryRawUnsafe<Array<{ fila: unknown }>>(
        `SELECT to_jsonb(t) AS fila FROM (SELECT * FROM ${nombre} ORDER BY 1 LIMIT ${POR_LOTE} OFFSET ${desde}) t`,
      );
      for (const { fila } of lote) lineas.push(JSON.stringify(fila));
      escritas += lote.length;
    }
    await writeFile(archivo, lineas.length === 0 ? '' : `${lineas.join('\n')}\n`, 'utf8');

    // Verificacion: se vuelve a leer lo escrito. Un archivo que nadie abrio hasta el
    // dia del desastre no es un respaldo.
    const texto = await readFile(archivo, 'utf8');
    const releidas = texto === '' ? 0 : texto.trimEnd().split('\n').length;
    const info = await stat(archivo);
    const ok = releidas === escritas && escritas === esperadas;
    if (!ok) problemas += 1;

    resultado[tabla] = {
      filas: releidas,
      bytes: info.size,
      sha256: createHash('sha256').update(texto).digest('hex'),
    };
    console.log(
      `${ok ? 'OK  ' : 'MAL '} ${tabla.padEnd(28)} ${String(releidas).padStart(8)} filas  ${enMegas(info.size).padStart(10)}` +
        (ok ? '' : `  (la base tenia ${esperadas}, se escribieron ${escritas}, se releyeron ${releidas})`),
    );
  }

  const totalFilas = Object.values(resultado).reduce((suma, t) => suma + t.filas, 0);
  const totalBytes = Object.values(resultado).reduce((suma, t) => suma + t.bytes, 0);
  await writeFile(
    path.join(carpeta, 'manifiesto.json'),
    JSON.stringify(
      { creado: new Date().toISOString(), esquema, formato: 'una-fila-por-linea-json', sinRespaldar: [...NO_SE_RESPALDAN], tablas: resultado },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`\n${totalFilas} filas · ${enMegas(totalBytes)} · ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
  if (problemas > 0) {
    console.error(`\nFALLO: ${problemas} tabla(s) no coinciden. No confie en este respaldo.`);
    process.exitCode = 1;
  } else {
    console.log('\nRespaldo completo y verificado.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
