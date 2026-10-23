/**
 * Vuelve a cargar un respaldo hecho con `npm run db:respaldo` en una base NUEVA.
 *
 *   npm run db:restaurar-base -- respaldos/base-2026-10-19_215313
 *   npm run db:restaurar-base -- respaldos/base-2026-10-19_215313 --esquema=pruebas
 *
 * CUANDO SIRVE
 *
 * Cuando la base se perdio o hay que mudarla a otro proyecto de Supabase. Antes de
 * correr esto la base nueva ya tiene que tener las tablas: `npm run db:push`
 * contra la direccion nueva del archivo .env. Esto solo mete los datos.
 *
 * COMO SE PROTEGE
 *
 *  - Se niega a correr si alguna tabla de la base de destino ya tiene filas
 *    (menos las sesiones). Cargar encima de datos vivos los mezcla.
 *  - Carga las tablas en el orden de sus llaves foraneas: primero de las que otras
 *    dependen.
 *  - Despues de cada tabla cuenta las filas de la base y las compara con el
 *    manifiesto del respaldo; si no coinciden, termina con error.
 *  - Deja los contadores de numeros (el numero de pedido) en el maximo cargado,
 *    para que el siguiente pedido no repita uno.
 *
 * No toca ninguna base que no sea la de DATABASE_URL del .env (o el esquema que se
 * indique con --esquema=). Lee el respaldo, nunca lo cambia.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';

import { cargarEnv } from './entorno';

cargarEnv();

interface Manifiesto {
  creado: string;
  esquema: string;
  tablas: Record<string, { filas: number; bytes: number; sha256: string }>;
}

const POR_LOTE = 500;

function argumentoEsquema(): string | null {
  const a = process.argv.find((x) => x.startsWith('--esquema='));
  return a ? a.slice('--esquema='.length) : null;
}

/** Pone ?schema=NOMBRE en la direccion de la base, sin tocar lo demas. */
function conEsquema(url: string, esquema: string): string {
  const [base, consulta = ''] = url.split('?');
  const parametros = new URLSearchParams(consulta);
  parametros.set('schema', esquema);
  return `${base}?${parametros.toString()}`;
}

/** Ordena las tablas para que cada una vaya despues de aquellas a las que apunta. */
export function ordenarPorDependencia(tablas: string[], aristas: Array<[hija: string, padre: string]>): string[] {
  const pendientes = new Set(tablas);
  const dependeDe = new Map<string, Set<string>>();
  for (const t of tablas) dependeDe.set(t, new Set());
  for (const [hija, padre] of aristas) {
    if (hija !== padre && dependeDe.has(hija) && pendientes.has(padre)) dependeDe.get(hija)!.add(padre);
  }
  const orden: string[] = [];
  while (pendientes.size > 0) {
    const listas = [...pendientes].filter((t) => [...dependeDe.get(t)!].every((p) => !pendientes.has(p)));
    if (listas.length === 0) throw new Error(`Hay un ciclo de llaves foraneas entre: ${[...pendientes].join(', ')}`);
    for (const t of listas.sort()) {
      orden.push(t);
      pendientes.delete(t);
    }
  }
  return orden;
}

async function main(): Promise<void> {
  const carpetaArg = process.argv.slice(2).find((x) => !x.startsWith('--'));
  if (!carpetaArg) throw new Error('Falta la carpeta del respaldo. Ejemplo: npm run db:restaurar-base -- respaldos/base-2026-10-19_215313');
  const carpeta = path.resolve(process.cwd(), carpetaArg);
  const manifiesto = JSON.parse(await readFile(path.join(carpeta, 'manifiesto.json'), 'utf8')) as Manifiesto;

  const esquemaPedido = argumentoEsquema();
  const urlBase = process.env.DATABASE_URL;
  if (!urlBase) throw new Error('No hay DATABASE_URL en el .env.');
  const prisma = new PrismaClient(esquemaPedido ? { datasources: { db: { url: conEsquema(urlBase, esquemaPedido) } } } : undefined);

  try {
    const esquema = (await prisma.$queryRawUnsafe<Array<{ s: string }>>('SELECT current_schema() AS s'))[0]?.s ?? 'public';
    console.log(`Respaldo: ${carpeta}`);
    console.log(`Hecho el ${manifiesto.creado} · destino: esquema "${esquema}"\n`);

    const existentes = (
      await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`,
      )
    ).map((t) => t.table_name);
    const faltan = Object.keys(manifiesto.tablas).filter((t) => !existentes.includes(t));
    if (faltan.length > 0) {
      throw new Error(`La base de destino no tiene estas tablas: ${faltan.join(', ')}. Corra primero npm run db:push contra esa base.`);
    }

    // 1. Que el destino este vacio.
    const conDatos: string[] = [];
    for (const t of Object.keys(manifiesto.tablas)) {
      const n = Number((await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT COUNT(*) AS n FROM "${t}"`))[0]?.n ?? 0n);
      if (n > 0) conDatos.push(`${t} (${n})`);
    }
    if (conDatos.length > 0) {
      throw new Error(`La base de destino ya tiene datos: ${conDatos.join(', ')}. No se carga encima para no mezclar.`);
    }

    // 2. Los archivos son los que se respaldaron.
    const filasPorTabla: Record<string, unknown[]> = {};
    for (const [tabla, datos] of Object.entries(manifiesto.tablas)) {
      const texto = await readFile(path.join(carpeta, `${tabla}.ndjson`), 'utf8');
      const huella = createHash('sha256').update(texto).digest('hex');
      if (huella !== datos.sha256) throw new Error(`El archivo ${tabla}.ndjson no es el que se respaldo (la huella no coincide).`);
      filasPorTabla[tabla] = texto === '' ? [] : texto.trimEnd().split('\n').map((l) => JSON.parse(l) as unknown);
      if (filasPorTabla[tabla]!.length !== datos.filas) throw new Error(`${tabla}: el archivo tiene ${filasPorTabla[tabla]!.length} filas y el manifiesto dice ${datos.filas}.`);
    }

    // 3. Orden por llaves foraneas.
    const aristas = (
      await prisma.$queryRawUnsafe<Array<{ hija: string; padre: string }>>(
        `SELECT c.conrelid::regclass::text AS hija, c.confrelid::regclass::text AS padre
         FROM pg_constraint c
         WHERE c.contype = 'f' AND c.connamespace = current_schema()::regnamespace`,
      )
    ).map((a) => [a.hija.replace(/"/g, '').split('.').pop()!, a.padre.replace(/"/g, '').split('.').pop()!] as [string, string]);
    const orden = ordenarPorDependencia(Object.keys(manifiesto.tablas), aristas);

    // 4. Cargar.
    let total = 0;
    for (const tabla of orden) {
      const filas = filasPorTabla[tabla]!;
      for (let i = 0; i < filas.length; i += POR_LOTE) {
        const lote = JSON.stringify(filas.slice(i, i + POR_LOTE));
        await prisma.$executeRawUnsafe(
          `INSERT INTO "${tabla}" SELECT * FROM jsonb_populate_recordset(NULL::"${tabla}", $1::jsonb)`,
          lote,
        );
      }
      const n = Number((await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT COUNT(*) AS n FROM "${tabla}"`))[0]?.n ?? 0n);
      const ok = n === manifiesto.tablas[tabla]!.filas;
      total += n;
      console.log(`${ok ? 'OK  ' : 'MAL '} ${tabla.padEnd(28)} ${String(n).padStart(8)} filas${ok ? '' : `  (debian ser ${manifiesto.tablas[tabla]!.filas})`}`);
      if (!ok) process.exitCode = 1;
    }

    // 5. Contadores (numero de pedido y similares).
    const contadores = await prisma.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND column_default LIKE 'nextval(%'`,
    );
    for (const { table_name, column_name } of contadores) {
      await prisma.$queryRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${table_name}"', '${column_name}'), COALESCE(MAX("${column_name}"), 1), MAX("${column_name}") IS NOT NULL) FROM "${table_name}"`,
      );
      console.log(`Contador al dia: ${table_name}.${column_name}`);
    }

    console.log(`\n${total} filas cargadas.`);
    console.log(process.exitCode ? '\nFALLO: revise las tablas marcadas MAL.' : '\nRestauracion completa y verificada.');
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && /restaurar-base\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((e) => {
    console.error(`\n${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  });
}
