/**
 * Carga en la base del negocio la primera version del menu de la app.
 *
 *   npm run db:menu-app
 *
 * Toma los productos del POS que el agente ya copio a la nube y arma el menu de la
 * app con la propuesta inicial (src/lib/menu/propuesta-inicial.ts).
 *
 * Solo AGREGA: lo que el dueno ya cambio (nombres, platos apagados, orden) no se
 * toca, y es seguro correrlo otra vez. Si la propuesta menciona un producto que el
 * POS no tiene, lo dice al final y sigue con el resto.
 *
 * Requisito: el agente nuevo ya mando el menu (tabla productos_menu con filas).
 */

import { prisma } from '@/lib/db/prisma';
import { aplicarPropuestaInicial } from '@/server/services/menu-app';

import { cargarEnv } from './entorno';

async function main(): Promise<void> {
  cargarEnv();

  const productos = await prisma.productoMenu.count();
  console.log(`Productos del POS en la nube: ${productos}`);
  if (productos === 0) {
    console.log('El agente todavia no mando el menu. No hay nada que cargar.');
    return;
  }

  const r = await aplicarPropuestaInicial();
  console.log(
    `Agregado: ${r.categorias} categorias, ${r.items} platos, ${r.variantes} variantes, ${r.complementos} extras.`,
  );
  if (r.faltantes.length > 0) {
    console.log(`Productos que la propuesta menciona y el POS no tiene: ${r.faltantes.join(', ')}`);
  }
  console.log(
    `Hay ahora ${await prisma.itemApp.count()} platos en ${await prisma.categoriaApp.count()} categorias.`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
