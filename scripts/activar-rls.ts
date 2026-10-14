/**
 * Activa la seguridad por filas (RLS) en todas las tablas de un esquema.
 *
 *   npm run db:rls                          -> solo MIRA y dice que haria
 *   npm run db:rls -- --aplicar             -> lo aplica en el esquema public
 *   npm run db:rls -- --esquema=pruebas     -> mira otro esquema
 *   npm run db:rls -- --esquema=pruebas --aplicar
 *
 * POR QUE
 *
 * Supabase publica una API REST de toda la base. Las tablas nacieron sin RLS y
 * los roles anon y authenticated existen: quien tenga la llave publica de una
 * aplicacion de clientes podria leer y escribir CUALQUIER tabla (clientes,
 * telefonos, pedidos). Hoy no pasa nada porque no hay llave publica en ningun
 * lado, pero la app de delivery de los clientes la va a llevar en su codigo.
 *
 * QUE HACE
 *
 * ENABLE ROW LEVEL SECURITY sin ninguna politica = nadie de afuera ve ni toca
 * nada. No se usa FORCE: Prisma se conecta con el rol dueno de las tablas
 * (postgres) y sigue funcionando igual, porque el dueno se salta el RLS.
 * La app de clientes nunca habla con la base directo, solo con nuestras rutas.
 *
 * DESPUES DE CADA CAMBIO DE ESQUEMA (db push con tablas nuevas) HAY QUE VOLVER A
 * CORRERLO: una tabla nueva nace sin RLS. Es seguro repetirlo.
 *
 * Es idempotente y por defecto no escribe nada.
 */

import { PrismaClient } from '@prisma/client';

import { cargarEnv } from './entorno';

/** Entre comillas dobles, como pide PostgreSQL para un identificador. */
export function identificador(nombre: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(nombre)) {
    throw new Error(`Nombre no permitido: ${nombre}`);
  }
  return `"${nombre}"`;
}

/** Las sentencias que hay que correr para las tablas que aun no tienen RLS. */
export function sentenciasParaRls(esquema: string, tablasSinRls: string[]): string[] {
  return tablasSinRls.map(
    (t) => `ALTER TABLE ${identificador(esquema)}.${identificador(t)} ENABLE ROW LEVEL SECURITY`,
  );
}

function probar(): void {
  let fallos = 0;
  const comprobar = (que: string, real: unknown, esperado: unknown): void => {
    const bien = JSON.stringify(real) === JSON.stringify(esperado);
    if (!bien) fallos += 1;
    console.log(`${bien ? 'OK  ' : 'MAL '} ${que}${bien ? '' : `  (${real} != ${esperado})`}`);
  };
  comprobar('cita un nombre', identificador('Cliente'), '"Cliente"');
  comprobar(
    'rechaza una inyeccion',
    (() => {
      try {
        identificador('x"; DROP TABLE y;--');
        return 'acepto';
      } catch {
        return 'rechazo';
      }
    })(),
    'rechazo',
  );
  comprobar('una sentencia por tabla', sentenciasParaRls('public', ['A', 'B']).length, 2);
  comprobar(
    'sentencia exacta',
    sentenciasParaRls('public', ['Cliente'])[0],
    'ALTER TABLE "public"."Cliente" ENABLE ROW LEVEL SECURITY',
  );
  comprobar('sin tablas, sin sentencias', sentenciasParaRls('public', []), []);
  if (fallos > 0) process.exit(1);
  console.log('\nTodo bien.');
}

interface FilaTabla {
  tabla: string;
  rls: boolean;
}

async function main(): Promise<void> {
  if (process.argv.includes('--probar')) {
    probar();
    return;
  }

  cargarEnv();
  const aplicar = process.argv.includes('--aplicar');
  const argEsquema = process.argv.find((a) => a.startsWith('--esquema='));
  const esquema = argEsquema ? argEsquema.slice('--esquema='.length) : 'public';
  identificador(esquema); // valida el nombre

  const url = process.env.DATABASE_URL;
  if (!url || url.startsWith('file:')) {
    throw new Error('DATABASE_URL no apunta a PostgreSQL. No hay nada que activar.');
  }
  const destino = new URL(url);
  console.log(`Base: ${destino.hostname}:${destino.port || '5432'}   esquema: ${esquema}`);
  console.log(aplicar ? 'MODO: APLICAR' : 'MODO: solo mirar (agregue --aplicar para cambiar algo)');
  console.log('');

  // Prisma lee DATABASE_URL del .env por su cuenta.
  const prisma = new PrismaClient();
  try {
    const yo = await prisma.$queryRawUnsafe<
      { usuario: string; salta_rls: boolean; superusuario: boolean }[]
    >(
      `SELECT current_user::text AS usuario, r.rolbypassrls AS salta_rls, r.rolsuper AS superusuario
       FROM pg_roles r WHERE r.rolname = current_user`,
    );
    const rol = yo[0];
    console.log(`Conectado como: ${rol.usuario} (se salta el RLS: ${rol.salta_rls || rol.superusuario ? 'si' : 'NO'})`);
    if (!(rol.salta_rls || rol.superusuario)) {
      console.log('  AVISO: este rol NO se salta el RLS. Si es el dueno de las tablas igual funciona,');
      console.log('  pero hay que comprobarlo despues de aplicar.');
    }

    const tablas = await prisma.$queryRawUnsafe<FilaTabla[]>(
      `SELECT c.relname::text AS tabla, c.relrowsecurity AS rls
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind = 'r' ORDER BY c.relname`,
      esquema,
    );
    console.log(`Tablas en ${esquema}: ${tablas.length}`);
    for (const t of tablas) console.log(`  ${t.rls ? 'con RLS   ' : 'SIN RLS   '} ${t.tabla}`);
    console.log('');

    const roles = await prisma.$queryRawUnsafe<{ rolname: string }[]>(
      `SELECT rolname::text FROM pg_roles WHERE rolname IN ('anon', 'authenticated') ORDER BY rolname`,
    );
    console.log(`Roles publicos de Supabase presentes: ${roles.map((r) => r.rolname).join(', ') || '(ninguno)'}`);

    const faltan = tablas.filter((t) => !t.rls).map((t) => t.tabla);
    if (faltan.length === 0) {
      console.log('\nTodas las tablas ya tienen RLS. No hay nada que hacer.');
      return;
    }
    const sentencias = sentenciasParaRls(esquema, faltan);
    console.log(`\nFaltan ${faltan.length} tablas.`);
    if (!aplicar) {
      console.log('Se correria:');
      for (const s of sentencias) console.log(`  ${s}`);
      return;
    }

    for (const s of sentencias) {
      await prisma.$executeRawUnsafe(s);
      console.log(`  hecho: ${s}`);
    }

    // Comprobacion: todas con RLS, y la aplicacion (este mismo rol) sigue leyendo.
    const despues = await prisma.$queryRawUnsafe<FilaTabla[]>(
      `SELECT c.relname::text AS tabla, c.relrowsecurity AS rls
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind = 'r'`,
      esquema,
    );
    const sin = despues.filter((t) => !t.rls);
    console.log(`\nTablas con RLS ahora: ${despues.length - sin.length} de ${despues.length}`);
    if (sin.length > 0) throw new Error(`Siguen sin RLS: ${sin.map((t) => t.tabla).join(', ')}`);

    const prueba = despues[0]?.tabla;
    if (prueba) {
      const filas = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM ${identificador(esquema)}.${identificador(prueba)}`,
      );
      console.log(`La aplicacion sigue leyendo: ${prueba} tiene ${filas[0].n} filas.`);
    }
    console.log('\nLISTO.');
  } finally {
    await prisma.$disconnect();
  }
}

// Solo corre si se invoca como script (no cuando otro archivo lo importa).
if (process.argv[1] && /activar-rls\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
