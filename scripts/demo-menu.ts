/**
 * Llena la base de PRUEBAS con el menu real del POS, para ver la app de clientes.
 *
 *   npm run demo:menu
 *
 * Copia los productos y grupos que el agente mando a la nube (solo LEE de la base
 * del negocio) a la base de pruebas, y carga encima la propuesta inicial del menu
 * de la app. Despues se levanta con `npm run dev:pruebas` y se abre /pedir.
 *
 * No escribe nada en la base del negocio.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { aplicarPropuestaInicial } from '@/server/services/menu-app';

import { exigirBaseDePruebas } from './guarda-pruebas';

/** La direccion del negocio, leida del .env (el envoltorio ya puso la de pruebas en el entorno). */
function direccionDelNegocio(): string {
  const texto = readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
  for (const linea of texto.split('\n')) {
    const l = linea.trim();
    if (l.startsWith('DATABASE_URL=')) return l.slice('DATABASE_URL='.length).replace(/^["']|["']$/g, '');
  }
  throw new Error('No hay DATABASE_URL en .env');
}

async function main(): Promise<void> {
  exigirBaseDePruebas();

  const negocio = new PrismaClient({ datasources: { db: { url: direccionDelNegocio() } } });
  try {
    const grupos = await negocio.grupoMenu.findMany();
    const productos = await negocio.productoMenu.findMany();
    console.log(`En la base del negocio: ${grupos.length} grupos, ${productos.length} productos.`);
    if (productos.length === 0) {
      console.log('El agente todavia no mando el menu. No hay nada que copiar.');
      return;
    }

    await prisma.complementoApp.deleteMany();
    await prisma.varianteApp.deleteMany();
    await prisma.itemApp.deleteMany();
    await prisma.categoriaApp.deleteMany();
    await prisma.productoMenu.deleteMany();
    await prisma.grupoMenu.deleteMany();

    await prisma.grupoMenu.createMany({ data: grupos });
    await prisma.productoMenu.createMany({ data: productos });
    const r = await aplicarPropuestaInicial();
    console.log(
      `Menu de la app: ${r.categorias} categorias, ${r.items} platos, ${r.variantes} variantes, ${r.complementos} extras.`,
    );
    if (r.faltantes.length > 0) console.log(`Productos que la propuesta menciona y el POS no tiene: ${r.faltantes.join(', ')}`);
  } finally {
    await negocio.$disconnect();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
