/**
 * Comprobacion del semaforo de entregas.
 *
 *   npm run test:entregas
 *
 * Los cortes del semaforo los pidio el dueno con numeros exactos, y de eso
 * depende que alguien en el mostrador decida llamar al repartidor o no. Asi que
 * se comprueban uno por uno, incluidos los bordes, que es donde se rompen.
 *
 * La segunda mitad escribe pedidos y consulta el tablero, asi que corre contra
 * la base de PRUEBAS.
 */

import { prisma } from '@/lib/db/prisma';
import {
  colorDeEspera,
  contarPorTramo,
  minutosDesde,
  tramoDeEspera,
  CORTE_VERDE,
  CORTE_NARANJA,
  CORTE_ROJO,
} from '@/lib/entregas/espera';
import { tableroDeEntregas } from '@/server/services/entregas';
import { diaOperativoDe, rangoDiaOperativo } from '@/lib/fechas';

import { exigirBaseDePruebas } from './guarda-pruebas';

let fallos = 0;

function comprobar(que: string, real: unknown, esperado: unknown): void {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bien) fallos += 1;
  console.log(
    `${bien ? 'OK  ' : 'MAL '} ${que}${bien ? '' : `  (${JSON.stringify(real)} != ${JSON.stringify(esperado)})`}`,
  );
}

function probarLosCortes(): void {
  console.log('\n--- Los cortes del semaforo ---');

  // El cero es verde. Un pedido que acaba de entrar no esta atrasado.
  comprobar('0 minutos es verde', tramoDeEspera(0), 'VERDE');
  comprobar(`${CORTE_VERDE} minutos todavia es verde`, tramoDeEspera(CORTE_VERDE), 'VERDE');
  comprobar(
    `${CORTE_VERDE + 1} minutos ya es naranja`,
    tramoDeEspera(CORTE_VERDE + 1),
    'NARANJA',
  );
  comprobar(`${CORTE_NARANJA} minutos sigue naranja`, tramoDeEspera(CORTE_NARANJA), 'NARANJA');
  comprobar(`${CORTE_NARANJA + 1} minutos ya es rojo`, tramoDeEspera(CORTE_NARANJA + 1), 'ROJO');
  comprobar(`${CORTE_ROJO} minutos sigue rojo`, tramoDeEspera(CORTE_ROJO), 'ROJO');
  comprobar(`${CORTE_ROJO + 1} minutos es critico`, tramoDeEspera(CORTE_ROJO + 1), 'CRITICO');
  comprobar('dos horas es critico', tramoDeEspera(120), 'CRITICO');

  // El unico que parpadea es el critico: si parpadeara otro, el parpadeo deja
  // de significar algo.
  comprobar('solo el critico parpadea', colorDeEspera(CORTE_ROJO + 1).parpadea, true);
  comprobar('el rojo no parpadea', colorDeEspera(CORTE_ROJO).parpadea, false);
  comprobar('el verde no parpadea', colorDeEspera(0).parpadea, false);

  // Sin fecha no se inventa un color.
  comprobar('sin hora no cae en ningun tramo', tramoDeEspera(null), 'SIN_DATO');

  console.log('\n--- Los minutos ---');
  const ahora = new Date('2026-10-04T20:00:00');
  comprobar(
    'cuenta los minutos enteros',
    minutosDesde(new Date('2026-10-04T19:30:00'), ahora),
    30,
  );
  // Redondea hacia abajo: a los 12:40 todavia dice 12 y pinta verde.
  comprobar(
    'redondea hacia abajo y no hacia arriba',
    minutosDesde(new Date('2026-10-04T19:47:20'), ahora),
    12,
  );
  comprobar('sin fecha devuelve nada', minutosDesde(null, ahora), null);
  // Un POS con el reloj adelantado no debe producir minutos negativos.
  comprobar(
    'una hora futura cuenta como cero y no como negativo',
    minutosDesde(new Date('2026-10-04T20:30:00'), ahora),
    0,
  );
  comprobar('lee tambien una fecha en texto', minutosDesde('2026-10-04T19:45:00', ahora), 15);

  console.log('\n--- El conteo por tramo ---');
  comprobar('cuenta cada color', contarPorTramo([0, 5, 15, 25, 90, 200, null]), {
    VERDE: 2,
    NARANJA: 1,
    ROJO: 1,
    CRITICO: 2,
    SIN_DATO: 1,
  });
}

/** Un pedido que entro hace tantos minutos. */
function haceMinutos(minutos: number): Date {
  return new Date(Date.now() - minutos * 60_000);
}

async function probarElTablero(): Promise<void> {
  console.log('\n--- El tablero contra la base ---');
  exigirBaseDePruebas();

  const dia = diaOperativoDe();
  const { desde } = rangoDiaOperativo(dia);

  await prisma.pedido.deleteMany();

  const marca = Date.now();
  const chofer = await prisma.chofer.create({
    data: {
      idMeseroSoftRestaurant: `ENT-${marca}`,
      nombre: 'Tono Vargas',
      nombreNormalizado: 'TONO VARGAS',
    },
  });

  // Cuatro sin despachar, uno en cada color, mas los que NO deben aparecer.
  await prisma.pedido.createMany({
    data: [
      // Los cuatro que si cuentan: entraron y nadie les ha puesto moto.
      m(`${marca}-a`, '101', haceMinutos(5), 'RECIBIDO'),
      m(`${marca}-b`, '102', haceMinutos(15), 'EN_COCINA'),
      m(`${marca}-c`, '103', haceMinutos(25), 'RECIBIDO'),
      m(`${marca}-d`, '104', haceMinutos(45), 'RECIBIDO'),
      // YA SALIO. Es la regla nueva: el tablero lo suelta cuando arranca la
      // moto, no cuando llega. Se cuenta como despachado y nada mas.
      m(`${marca}-e`, '105', haceMinutos(90), 'EN_CAMINO', chofer.id),
      // Cancelado: no cuenta para nada.
      { ...m(`${marca}-f`, '106', haceMinutos(80), 'CANCELADO'), cancelado: true },
      // Para comer en el local: no sale en ninguna moto y se quedaria en rojo
      // para siempre.
      { ...m(`${marca}-g`, '107', haceMinutos(200), 'RECIBIDO'), esADomicilio: false },
      // De ayer: un cheque mal cerrado no es un pedido atrasado.
      m(`${marca}-h`, '108', new Date(desde.getTime() - 3_600_000), 'RECIBIDO'),
      // Se resolvio sin que nadie le pusiera hora de salida: se cobro en el
      // local o el cajero lo cerro. Si no se excluyera, se quedaria pegado
      // arriba del tablero toda la noche.
      m(`${marca}-i`, '109', haceMinutos(150), 'ENTREGADO'),
    ],
  });

  const tablero = await tableroDeEntregas();

  comprobar('muestra solo los de hoy que no han salido', tablero.pendientes.length, 4);
  comprobar(
    'del mas viejo al mas nuevo',
    tablero.pendientes.map((p) => p.folio),
    ['104', '103', '102', '101'],
  );
  comprobar('el que ya salio no aparece', tablero.pendientes.some((p) => p.folio === '105'), false);
  comprobar('ni el que se cerro sin salir', tablero.pendientes.some((p) => p.folio === '109'), false);
  comprobar('cuenta los despachados aparte', tablero.despachadosHoy, 1);
  comprobar('reparte los colores', tablero.porTramo, {
    VERDE: 1,
    NARANJA: 1,
    ROJO: 1,
    CRITICO: 1,
    SIN_DATO: 0,
  });
  comprobar(
    'el mas viejo es el critico',
    colorDeEspera(tablero.pendientes[0]?.minutosEsperando ?? 0).tramo,
    'CRITICO',
  );
  comprobar('todavia no tienen repartidor asignado', tablero.pendientes[0]?.repartidor, null);
  comprobar('dice cuando fue la ultima sincronizacion', tablero.ultimaSincronizacion !== null, true);
  comprobar('y no viene recortado con nueve pedidos', tablero.recortado, false);

  await prisma.pedido.deleteMany();
  await prisma.chofer.delete({ where: { id: chofer.id } });
}

/** Un pedido a domicilio con lo minimo para guardarlo. */
function m(clave: string, folio: string, entroEn: Date, estado: string, choferId?: string) {
  return {
    claveDelPos: clave,
    folio,
    entroEn,
    estado,
    esADomicilio: true,
    cancelado: false,
    total: 1_000_000,
    efectivo: 1_000_000,
    ...(choferId ? { choferId } : {}),
    // EN_CAMINO sin hora de salida seria incoherente con lo que deriva el
    // agente, asi que se pone.
    ...(estado === 'EN_CAMINO' ? { salioEn: new Date(entroEn.getTime() + 600_000) } : {}),
    // El entregado de la prueba se cerro SIN hora de salida, que es el caso
    // del pedido cobrado en el local.
    ...(estado === 'ENTREGADO' ? { pagado: true } : {}),
  };
}

async function main(): Promise<void> {
  probarLosCortes();
  await probarElTablero();
  console.log(`\n${fallos === 0 ? 'Todo bien' : `${fallos} fallas`}`);
  if (fallos > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
