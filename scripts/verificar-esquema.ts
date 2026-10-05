/**
 * Comprobacion de las garantias que el esquema debe dar POR SI MISMO.
 *
 *   npm run test:esquema
 *
 * Lo que se prueba aqui no es logica nuestra: es lo que la base impide aunque
 * el codigo se equivoque. Un candado de unicidad sigue puesto cuando alguien
 * escriba un servicio nuevo y se olvide de la regla; una comprobacion en
 * TypeScript, no.
 *
 * Escribe y borra filas, asi que corre contra la base de PRUEBAS. Antes corria
 * contra DATABASE_URL directo, lo que significaba que un descuido en el .env
 * escribia en la base del negocio.
 *
 * Esto probaba los candados de los turnos y la suma de los abonos. Las dos
 * tablas salieron con lo contable. Lo que queda que la base tiene que
 * garantizar sola son los candados de las asignaciones de moto y la clave
 * unica del pedido del POS.
 */

import { prisma } from '@/lib/db/prisma';

import { exigirBaseDePruebas } from './guarda-pruebas';

let fallos = 0;

function comprobar(que: string, real: unknown, esperado: unknown): void {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bien) fallos += 1;
  console.log(`${bien ? 'OK  ' : 'MAL '} ${que}${bien ? '' : `  (${real} != ${esperado})`}`);
}

/**
 * Lista las tablas sin depender del motor.
 *
 * Cada base guarda su catalogo en un lugar distinto, y esta comprobacion tiene
 * que seguir sirviendo tanto en un archivo de SQLite como en Supabase.
 */
async function listarTablas(): Promise<string[]> {
  const esSqlite = (process.env.DATABASE_URL ?? '').startsWith('file:');
  const consulta = esSqlite
    ? "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' ORDER BY name"
    : "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' AND table_name NOT LIKE '_prisma%' ORDER BY table_name";
  const filas = await prisma.$queryRawUnsafe<Array<{ name: string }>>(consulta);
  return filas.map((f) => f.name);
}

async function main(): Promise<void> {
  exigirBaseDePruebas();

  const tablas = await listarTablas();
  console.log('Tablas creadas:', tablas.join(', '));
  console.log('');

  // Las tablas de lo contable no deben volver por una migracion mal hecha.
  const contables = [
    'turnos_chofer',
    'abonos_efectivo',
    'cargas_excel',
    'ventas_chofer_excel',
    'cierres_chofer',
    'arqueos_caja',
    'tiquetes',
  ];
  comprobar(
    'no queda ninguna tabla de lo contable',
    tablas.filter((t) => contables.includes(t)),
    [],
  );
  comprobar('la tabla de pedidos existe', tablas.includes('pedidos'), true);
  comprobar('la de clientes tambien', tablas.includes('clientes'), true);

  const marca = Date.now();
  const chofer = await prisma.chofer.create({
    data: {
      idMeseroSoftRestaurant: `PRUEBA-${marca}`,
      nombre: 'Antonio Rojas',
      nombreNormalizado: 'ANTONIO ROJAS',
    },
  });
  const moto = await prisma.motocicleta.create({
    data: { placa: `MOT-${marca}`, marca: 'Honda', modelo: 'CG 150', anio: 2020, kilometrajeActual: 1000 },
  });
  const otra = await prisma.motocicleta.create({
    data: { placa: `OTR-${marca}`, marca: 'Honda', modelo: 'CG 150', anio: 2020, kilometrajeActual: 1000 },
  });

  // --- Un chofer no puede tener dos motos a la vez ---------------------------
  const asignacion = await prisma.asignacionMoto.create({
    data: {
      placa: moto.placa,
      choferId: chofer.id,
      candadoChoferActivo: chofer.id,
      candadoMotoActiva: moto.placa,
    },
  });

  let bloqueado = false;
  try {
    await prisma.asignacionMoto.create({
      data: {
        placa: otra.placa,
        choferId: chofer.id,
        candadoChoferActivo: chofer.id,
        candadoMotoActiva: otra.placa,
      },
    });
  } catch {
    bloqueado = true;
  }
  comprobar('la base rechaza una segunda moto para el mismo chofer', bloqueado, true);

  // --- Y una moto no puede estar con dos choferes ----------------------------
  const otroChofer = await prisma.chofer.create({
    data: {
      idMeseroSoftRestaurant: `PRUEBA2-${marca}`,
      nombre: 'Bernal Mora',
      nombreNormalizado: 'BERNAL MORA',
    },
  });
  bloqueado = false;
  try {
    await prisma.asignacionMoto.create({
      data: {
        placa: moto.placa,
        choferId: otroChofer.id,
        candadoChoferActivo: otroChofer.id,
        candadoMotoActiva: moto.placa,
      },
    });
  } catch {
    bloqueado = true;
  }
  comprobar('la base rechaza la misma moto para dos choferes', bloqueado, true);

  // --- Al cerrar la asignacion, los candados se liberan ----------------------
  await prisma.asignacionMoto.update({
    where: { id: asignacion.id },
    data: { fechaFin: new Date(), candadoChoferActivo: null, candadoMotoActiva: null },
  });
  const reasignada = await prisma.asignacionMoto.create({
    data: {
      placa: moto.placa,
      choferId: otroChofer.id,
      candadoChoferActivo: otroChofer.id,
      candadoMotoActiva: moto.placa,
    },
  });
  comprobar('cerrada la anterior, la moto se puede reasignar', reasignada.id.length > 0, true);

  // --- El mismo pedido del POS no entra dos veces ----------------------------
  const clave = `A-${marca}`;
  await prisma.pedido.create({
    data: { claveDelPos: clave, folio: '1', entroEn: new Date(), estado: 'RECIBIDO' },
  });
  bloqueado = false;
  try {
    await prisma.pedido.create({
      data: { claveDelPos: clave, folio: '1', entroEn: new Date(), estado: 'RECIBIDO' },
    });
  } catch {
    bloqueado = true;
  }
  comprobar('la base rechaza el mismo pedido del POS dos veces', bloqueado, true);

  // --- Limpieza --------------------------------------------------------------
  await prisma.pedido.deleteMany({ where: { claveDelPos: clave } });
  await prisma.asignacionMoto.deleteMany({
    where: { choferId: { in: [chofer.id, otroChofer.id] } },
  });
  await prisma.chofer.deleteMany({ where: { id: { in: [chofer.id, otroChofer.id] } } });
  await prisma.motocicleta.deleteMany({ where: { placa: { in: [moto.placa, otra.placa] } } });

  console.log(`\n${fallos === 0 ? 'Todo bien' : `${fallos} fallas`}`);
  if (fallos > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
