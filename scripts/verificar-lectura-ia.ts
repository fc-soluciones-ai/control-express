/**
 * Prueba de la gasolina leida de las fotos.
 *
 * No llama a la IA: usa un lector falso que devuelve lo que la prueba le
 * pida. Lo que se prueba es lo que pasa ALREDEDOR de la lectura, que es donde
 * estan las puertas para manipular los numeros.
 *
 * Ejecutar con: npm run test:lectura
 */

import { prisma } from '@/lib/db/prisma';
import { esErrorNegocio } from '@/server/errores';
import { evidenciaDe } from '@/server/services/evidencia';
import {
  DIAS_MAXIMOS_FACTURA,
  SALTO_MAXIMO_KM,
  fechaDeFactura,
  leerFoto,
  registrarGasolinaLeida,
  type Lector,
  type LecturaCruda,
} from '@/server/services/lectura-ia';
import { asignarMoto, crearMoto } from '@/server/services/motos';
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

async function codigoDe(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
    return 'SIN_ERROR';
  } catch (e) {
    if (esErrorNegocio(e)) return e.codigo;
    console.error(e);
    return 'ERROR_INESPERADO';
  }
}

async function limpiar(): Promise<void> {
  await prisma.lecturaFoto.deleteMany();
  await prisma.evidencia.deleteMany();
  await prisma.registroMantenimiento.deleteMany();
  await prisma.asignacionMoto.deleteMany();
  await prisma.motocicleta.deleteMany();
  await prisma.eventoAuditoria.deleteMany();
  await prisma.chofer.deleteMany();
  await prisma.cajero.deleteMany();
}

/** Un PNG distinto cada vez: la huella de la foto tiene que cambiar. */
let contador = 0;
function foto(): Buffer {
  contador += 1;
  const cabecera = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([cabecera, Buffer.from(`foto-${contador}`)]);
}

/** Lector falso: devuelve la siguiente respuesta de la cola. */
function lectorCon(...respuestas: LecturaCruda[]): Lector {
  return async () => {
    const lectura = respuestas.shift();
    if (!lectura) throw new Error('El lector falso se quedo sin respuestas.');
    return { lectura, modelo: 'falso' };
  };
}

function hoy(desplazamientoDias = 0): string {
  const d = new Date(Date.now() + desplazamientoDias * 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
}

const facturaBuena = (cambios: Partial<LecturaCruda> = {}): LecturaCruda => ({
  legible: true,
  totalColones: 6500,
  fecha: hoy(),
  gasolinera: 'Servicentro La Uruca',
  numeroFactura: '00100001010000012345',
  litros: 7.9,
  ...cambios,
});

async function main(): Promise<void> {
  exigirBaseDePruebas();
  await limpiar();

  const cajero = await prisma.cajero.create({
    data: { nombre: 'Karla (Caja 1)', pin: 'hash', rol: 'ADMIN' },
  });
  const crearChofer = (nombre: string, id: string) =>
    prisma.chofer.create({
      data: { idMeseroSoftRestaurant: id, nombre, nombreNormalizado: nombre.toUpperCase() },
    });
  const david = await crearChofer('DAVID-R', '10');
  const pinito = await crearChofer('PINITO-R', '12');
  const sinMoto = await crearChofer('NESTOR', '35');

  await crearMoto(
    { placa: 'MOT100', marca: 'Honda', modelo: 'CB125', anio: 2022, kilometrajeActual: 18_000 },
    cajero.id,
  );
  await crearMoto(
    { placa: 'MOT200', marca: 'Bajaj', modelo: 'Boxer', anio: 2021, kilometrajeActual: 40_000 },
    cajero.id,
  );
  await asignarMoto('MOT100', david.id, cajero.id);
  await asignarMoto('MOT200', pinito.id, cajero.id);

  // -------------------------------------------------------------------------
  console.log('--- Leer las fotos ---');

  const odo = await leerFoto(
    { choferId: david.id, tipo: 'ODOMETRO', contenido: foto() },
    lectorCon({ legible: true, kilometraje: 18_120 }),
  );
  comprobar('el odometro se lee', [odo.legible, odo.kilometraje], [true, 18_120]);

  const fac = await leerFoto(
    { choferId: david.id, tipo: 'FACTURA', contenido: foto() },
    lectorCon(facturaBuena()),
  );
  comprobar('la factura se lee', fac.legible, true);
  comprobar('el monto pasa a centimos', fac.monto, 650_000);
  comprobar('con la gasolinera', fac.gasolinera, 'Servicentro La Uruca');

  const borrosa = await leerFoto(
    { choferId: david.id, tipo: 'ODOMETRO', contenido: foto() },
    lectorCon({ legible: false, kilometraje: null, motivo: 'foto movida' }),
  );
  comprobar('una foto borrosa queda ilegible', [borrosa.legible, borrosa.motivo], [false, 'foto movida']);

  const inventada = await leerFoto(
    { choferId: david.id, tipo: 'FACTURA', contenido: foto() },
    lectorCon(facturaBuena({ fecha: 'ayer' })),
  );
  comprobar('una fecha que no es fecha la deja ilegible', inventada.legible, false);

  const decimal = await leerFoto(
    { choferId: david.id, tipo: 'ODOMETRO', contenido: foto() },
    lectorCon({ legible: true, kilometraje: 18_120.5 }),
  );
  comprobar('un kilometraje con decimales no se acepta', decimal.legible, false);

  comprobar(
    'sin moto asignada no se lee nada',
    await codigoDe(
      leerFoto(
        { choferId: sinMoto.id, tipo: 'ODOMETRO', contenido: foto() },
        lectorCon({ legible: true, kilometraje: 1 }),
      ),
    ),
    'DATOS_INVALIDOS',
  );
  comprobar(
    'un archivo que no es imagen se rechaza',
    await codigoDe(
      leerFoto(
        { choferId: david.id, tipo: 'ODOMETRO', contenido: Buffer.from('hola') },
        lectorCon({ legible: true, kilometraje: 1 }),
      ),
    ),
    'DATOS_INVALIDOS',
  );

  // -------------------------------------------------------------------------
  console.log('\n--- Registrar con las lecturas ---');

  comprobar(
    'no se registra con una foto ilegible',
    await codigoDe(
      registrarGasolinaLeida({
        choferId: david.id,
        lecturaOdometroId: borrosa.id,
        lecturaFacturaId: fac.id,
        claveIdempotencia: 'c-ilegible',
      }),
    ),
    'FOTO_ILEGIBLE',
  );
  comprobar(
    'ni con las lecturas cruzadas',
    await codigoDe(
      registrarGasolinaLeida({
        choferId: david.id,
        lecturaOdometroId: fac.id,
        lecturaFacturaId: odo.id,
        claveIdempotencia: 'c-cruzada',
      }),
    ),
    'DATOS_INVALIDOS',
  );
  comprobar(
    'ni con las fotos de otro repartidor',
    await codigoDe(
      registrarGasolinaLeida({
        choferId: pinito.id,
        lecturaOdometroId: odo.id,
        lecturaFacturaId: fac.id,
        claveIdempotencia: 'c-ajena',
      }),
    ),
    'DATOS_INVALIDOS',
  );

  const gasto = await registrarGasolinaLeida({
    choferId: david.id,
    lecturaOdometroId: odo.id,
    lecturaFacturaId: fac.id,
    claveIdempotencia: 'c-buena',
  });
  comprobar('se registra con lo leido', [gasto.kilometraje, gasto.monto], [18_120, 650_000]);

  const fila = await prisma.registroMantenimiento.findUnique({ where: { id: gasto.id } });
  comprobar('queda marcado como leido por IA', fila?.origen, 'IA');
  comprobar('a nombre del repartidor', fila?.choferId, david.id);
  comprobar('con la factura', fila?.numeroFactura, '00100001010000012345');
  comprobar('y la gasolinera', fila?.tallerOProveedor, 'Servicentro La Uruca');
  comprobar(
    'el odometro de la moto avanza',
    (await prisma.motocicleta.findUnique({ where: { placa: 'MOT100' } }))?.kilometrajeActual,
    18_120,
  );

  const fotos = await evidenciaDe('GASTO', gasto.id);
  comprobar('las dos fotos pasan a la evidencia', fotos.map((f) => f.tipo).sort(), ['FACTURA', 'ODOMETRO']);
  const usadas = await prisma.lecturaFoto.findMany({
    where: { id: { in: [odo.id, fac.id] } },
    select: { contenido: true, gastoId: true },
  });
  comprobar(
    'y las lecturas sueltan los bytes',
    usadas.map((u) => [u.contenido === null, u.gastoId === gasto.id]),
    [
      [true, true],
      [true, true],
    ],
  );

  const otraVez = await registrarGasolinaLeida({
    choferId: david.id,
    lecturaOdometroId: odo.id,
    lecturaFacturaId: fac.id,
    claveIdempotencia: 'c-buena',
  });
  comprobar('el doble toque no duplica', [otraVez.id, otraVez.repetido], [gasto.id, true]);
  comprobar('ni las fotos', (await evidenciaDe('GASTO', gasto.id)).length, 2);

  comprobar(
    'las mismas lecturas no sirven para otro gasto',
    await codigoDe(
      registrarGasolinaLeida({
        choferId: david.id,
        lecturaOdometroId: odo.id,
        lecturaFacturaId: fac.id,
        claveIdempotencia: 'c-otra',
      }),
    ),
    'FACTURA_REPETIDA',
  );

  // -------------------------------------------------------------------------
  console.log('\n--- Intentos de repetir o inflar ---');

  const nuevoOdo = () =>
    leerFoto(
      { choferId: david.id, tipo: 'ODOMETRO', contenido: foto() },
      lectorCon({ legible: true, kilometraje: 18_200 }),
    );
  const nuevaFactura = (cambios: Partial<LecturaCruda>) =>
    leerFoto(
      { choferId: david.id, tipo: 'FACTURA', contenido: foto() },
      lectorCon(facturaBuena(cambios)),
    );

  const intento = async (cambios: Partial<LecturaCruda>, clave: string, km?: number) => {
    const o = km
      ? await leerFoto(
          { choferId: david.id, tipo: 'ODOMETRO', contenido: foto() },
          lectorCon({ legible: true, kilometraje: km }),
        )
      : await nuevoOdo();
    const f = await nuevaFactura(cambios);
    return codigoDe(
      registrarGasolinaLeida({
        choferId: david.id,
        lecturaOdometroId: o.id,
        lecturaFacturaId: f.id,
        claveIdempotencia: clave,
      }),
    );
  };

  comprobar('la misma factura con otra foto se rechaza', await intento({}, 'r1'), 'FACTURA_REPETIDA');
  comprobar(
    'y sin numero, por bomba + fecha + monto',
    await intento({ numeroFactura: null }, 'r2'),
    'FACTURA_REPETIDA',
  );
  comprobar(
    `una factura de hace mas de ${DIAS_MAXIMOS_FACTURA} dias se rechaza`,
    await intento({ numeroFactura: 'VIEJA', fecha: hoy(-(DIAS_MAXIMOS_FACTURA + 2)) }, 'r3'),
    'DATOS_INVALIDOS',
  );
  comprobar(
    'una factura con fecha futura tambien',
    await intento({ numeroFactura: 'FUTURA', fecha: hoy(3) }, 'r4'),
    'DATOS_INVALIDOS',
  );
  comprobar(
    'el odometro no retrocede',
    await intento({ numeroFactura: 'ATRAS', totalColones: 1234 }, 'r5', 17_000),
    'DATOS_INVALIDOS',
  );
  comprobar(
    `ni salta mas de ${SALTO_MAXIMO_KM} km`,
    await intento({ numeroFactura: 'SALTO', totalColones: 2345 }, 'r6', 18_120 + SALTO_MAXIMO_KM + 1),
    'DATOS_INVALIDOS',
  );

  // Una moto dada de alta en cero no tiene contra que comparar: su primera
  // lectura es la que le pone el odometro al dia, aunque marque medio millon.
  await crearMoto(
    { placa: 'MOT300', marca: 'Fredon', modelo: 'Fire 200', anio: 2020, kilometrajeActual: 0 },
    cajero.id,
  );
  await asignarMoto('MOT300', pinito.id, cajero.id);
  const odoNuevo = await leerFoto(
    { choferId: pinito.id, tipo: 'ODOMETRO', contenido: foto() },
    lectorCon({ legible: true, kilometraje: 502_912 }),
  );
  const facNuevo = await leerFoto(
    { choferId: pinito.id, tipo: 'FACTURA', contenido: foto() },
    lectorCon(facturaBuena({ numeroFactura: 'CERO-1', totalColones: 6202 })),
  );
  comprobar(
    'una moto en cero acepta su primera lectura',
    await codigoDe(
      registrarGasolinaLeida({
        choferId: pinito.id,
        lecturaOdometroId: odoNuevo.id,
        lecturaFacturaId: facNuevo.id,
        claveIdempotencia: 'cero-1',
      }),
    ),
    'SIN_ERROR',
  );
  comprobar(
    'y desde ahi ya queda protegida del salto',
    (await prisma.motocicleta.findUnique({ where: { placa: 'MOT300' } }))?.kilometrajeActual,
    502_912,
  );
  const odoSalto = await leerFoto(
    { choferId: pinito.id, tipo: 'ODOMETRO', contenido: foto() },
    lectorCon({ legible: true, kilometraje: 502_912 + SALTO_MAXIMO_KM + 1 }),
  );
  const facSalto = await leerFoto(
    { choferId: pinito.id, tipo: 'FACTURA', contenido: foto() },
    lectorCon(facturaBuena({ numeroFactura: 'CERO-2', totalColones: 7000 })),
  );
  comprobar(
    'el siguiente salto grande si se rechaza',
    await codigoDe(
      registrarGasolinaLeida({
        choferId: pinito.id,
        lecturaOdometroId: odoSalto.id,
        lecturaFacturaId: facSalto.id,
        claveIdempotencia: 'cero-2',
      }),
    ),
    'DATOS_INVALIDOS',
  );

  // Las lecturas de los intentos fallidos no quedan reservadas.
  const reservadasSinGasto = await prisma.lecturaFoto.count({
    where: { usadaEn: { not: null }, gastoId: null },
  });
  comprobar('un intento rechazado no deja lecturas tomadas', reservadasSinGasto, 0);

  comprobar(
    'una factura distinta de ayer si pasa',
    await intento({ numeroFactura: 'AYER-1', totalColones: 3000, fecha: hoy(-1) }, 'r7'),
    'SIN_ERROR',
  );

  const repetidaFoto = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
  const conFoto = await leerFoto(
    { choferId: david.id, tipo: 'ODOMETRO', contenido: repetidaFoto },
    lectorCon({ legible: true, kilometraje: 18_300 }),
  );
  const facFoto = await nuevaFactura({ numeroFactura: 'HUELLA', totalColones: 4100 });
  await registrarGasolinaLeida({
    choferId: david.id,
    lecturaOdometroId: conFoto.id,
    lecturaFacturaId: facFoto.id,
    claveIdempotencia: 'r8',
  });
  comprobar(
    'la misma foto no se puede volver a leer',
    await codigoDe(
      leerFoto(
        { choferId: david.id, tipo: 'ODOMETRO', contenido: repetidaFoto },
        lectorCon({ legible: true, kilometraje: 18_400 }),
      ),
    ),
    'FACTURA_REPETIDA',
  );

  // Una lectura vieja ya no sirve.
  const viejaOdo = await nuevoOdo();
  const viejaFac = await nuevaFactura({ numeroFactura: 'TARDE', totalColones: 5000 });
  await prisma.lecturaFoto.updateMany({
    where: { id: { in: [viejaOdo.id, viejaFac.id] } },
    data: { creadaEn: new Date(Date.now() - 3 * 60 * 60 * 1000) },
  });
  comprobar(
    'fotos de hace horas no sirven',
    await codigoDe(
      registrarGasolinaLeida({
        choferId: david.id,
        lecturaOdometroId: viejaOdo.id,
        lecturaFacturaId: viejaFac.id,
        claveIdempotencia: 'r9',
      }),
    ),
    'DATOS_INVALIDOS',
  );

  // Si la caja le cambia la moto, las fotos de la anterior no sirven.
  const antesOdo = await nuevoOdo();
  const antesFac = await nuevaFactura({ numeroFactura: 'CAMBIO', totalColones: 5100 });
  await asignarMoto('MOT200', david.id, cajero.id);
  comprobar(
    'las fotos de otra moto no sirven',
    await codigoDe(
      registrarGasolinaLeida({
        choferId: david.id,
        lecturaOdometroId: antesOdo.id,
        lecturaFacturaId: antesFac.id,
        claveIdempotencia: 'r10',
      }),
    ),
    'DATOS_INVALIDOS',
  );

  comprobar('la fecha de factura es mediodia en Costa Rica', fechaDeFactura('2026-09-16')?.toISOString(), '2026-09-16T18:00:00.000Z');

  const vencidas = await prisma.lecturaFoto.count({
    where: { id: { in: [viejaOdo.id, viejaFac.id] }, contenido: null },
  });
  comprobar('las lecturas vencidas sueltan los bytes', vencidas, 2);

  await limpiar();
  console.log(
    fallos === 0 ? '\nTodas las comprobaciones pasaron.\n' : `\n${fallos} comprobacion(es) fallaron.\n`,
  );
  process.exitCode = fallos === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
