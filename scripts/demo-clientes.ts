/**
 * Llena la base de PRUEBAS con clientes de ejemplo para mirar las pantallas.
 *
 *   npm run demo:clientes
 *
 * Los casos no son inventados al azar: son los que de verdad aparecen en la
 * base de la pizzeria, uno por cada estado, para poder ver como se ve cada
 * problema en la pantalla antes de que haya diez mil fichas encima.
 *
 * El PIN del usuario de demostracion sale de PIN_DEMO, y si no viene se
 * genera al azar y se escribe en storage/demo-clientes.txt, que git ignora.
 * Nunca se pasa como argumento del comando: los argumentos quedan en el
 * historial del shell.
 */

import { randomInt } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

import { prisma } from '../src/lib/db/prisma';
import {
  calidadDeDireccion,
  esCelular,
  nombreBuscable,
} from '../src/lib/clientes/normalizar';
import { hashearPin } from '../src/server/services/pin';
import { armarTanda } from '../src/server/services/ubicaciones';
import { exigirBaseDePruebas } from './guarda-pruebas';

interface ClienteDemo {
  clave: string;
  nombre: string;
  telefono: string | null;
  direccion: string;
  estado: string;
  compartido?: boolean;
  origenTelefono?: string;
}

/** Un cliente por cada estado, con los datos tal como se ven en el POS. */
const DEMO: ClienteDemo[] = [
  {
    clave: '008686',
    nombre: 'MARIA RODRIGUEZ SOLIS',
    telefono: '87069355',
    direccion: 'LA GARITA DESPUES DE APARTAMENTOS DE PIRAGUA 5 CASA A LA DERECHA',
    estado: 'LISTO',
  },
  {
    clave: '008051',
    nombre: 'JOSE PABLO DINARTE',
    telefono: '72076079',
    direccion: '300 MTS OESTE DEL CEMENTERIO TURRUCARES, PORTON VERDE',
    estado: 'LISTO',
  },
  {
    clave: '005640',
    nombre: 'CINDY CHACON',
    telefono: '83426372',
    direccion: 'CEBADILLA, 200 METROS OESTE DEL BAR LA CURVA, CASA ESQUINERA',
    estado: 'LISTO',
  },
  {
    clave: '003863',
    nombre: '3101007589    DIPO S.A.',
    telefono: null,
    direccion: 'ALAJUELA',
    estado: 'SIN_TELEFONO',
  },
  // La pareja que colisiona si alguien quita los ceros de la clave.
  {
    clave: '3863',
    nombre: 'GATA',
    telefono: '24875058',
    direccion: 'TORTILLERA',
    estado: 'SOLO_FIJO',
  },
  {
    clave: '006790',
    nombre: 'GRUPO JEA S.R.L',
    telefono: '89801999',
    direccion: 'SANCHEZ FRENTE TALLER ESCULTURAS',
    estado: 'TELEFONO_COMPARTIDO',
    compartido: true,
  },
  {
    clave: '6982',
    nombre: 'JOSE ALFARO',
    telefono: '89801999',
    direccion: 'RECTA DE LOS PINTOS CASA DETRAS DE LUIS ALFARO',
    estado: 'TELEFONO_COMPARTIDO',
    compartido: true,
  },
  {
    clave: '004822',
    nombre: 'ALLAN HERRERA MURILLO',
    telefono: '24878031',
    direccion: '1',
    estado: 'TELEFONO_POR_CONFIRMAR',
    origenTelefono: 'FORMATO_VIEJO',
  },
  {
    clave: '009008',
    nombre: 'DANIEL',
    telefono: '88502804',
    direccion: 'COYOL',
    estado: 'DIRECCION_POBRE',
  },
];

async function main(): Promise<void> {
  exigirBaseDePruebas();

  await prisma.ubicacionCliente.deleteMany();
  await prisma.solicitudUbicacion.deleteMany();
  await prisma.telefonoCliente.deleteMany();
  await prisma.cliente.deleteMany();

  for (const c of DEMO) {
    await prisma.cliente.create({
      data: {
        clave: c.clave,
        nombre: c.nombre,
        nombreBuscable: nombreBuscable(c.nombre),
        telefono: c.telefono,
        esCelular: c.telefono ? esCelular(c.telefono) : false,
        direccionTexto: c.direccion,
        calidadDireccion: calidadDeDireccion(c.direccion),
        estado: c.estado,
        telefonoCompartido: c.compartido ?? false,
        nombreRepetido: false,
        origenCarga: 'DEMOSTRACION',
        telefonos: c.telefono
          ? {
              create: {
                numero: c.telefono,
                esCelular: esCelular(c.telefono),
                origen: c.origenTelefono ?? 'DIRECTO',
                comoVenia: c.origenTelefono === 'FORMATO_VIEJO' ? '4878031' : c.telefono,
                campo: 'telefono',
              },
            }
          : undefined,
      },
    });
  }

  // Un usuario para poder entrar a mirar las pantallas.
  const pinEnClaro = process.env.PIN_DEMO ?? String(randomInt(1000, 10_000));
  const demo = await prisma.cajero.upsert({
    where: { id: 'cajero-demo' },
    update: { pin: await hashearPin(pinEnClaro), estado: 'ACTIVO', rol: 'ADMIN' },
    create: {
      id: 'cajero-demo',
      nombre: 'DEMOSTRACION',
      pin: await hashearPin(pinEnClaro),
      rol: 'ADMIN',
    },
  });

  if (!process.env.PIN_DEMO) {
    mkdirSync('storage', { recursive: true });
    writeFileSync(
      'storage/demo-clientes.txt',
      `Usuario de demostracion de la base de PRUEBAS\n` +
        `usuario: DEMOSTRACION\n` +
        `PIN: ${pinEnClaro}\n\n` +
        `No sirve para la base del negocio. git ignora esta carpeta.\n`,
      'utf8',
    );
    console.log('PIN escrito en storage/demo-clientes.txt (no se imprime aqui a proposito).');
  }

  const { tanda, lineas } = await armarTanda(demo.id, 10);
  console.log(`\n${DEMO.length} clientes de ejemplo. Tanda ${tanda} con ${lineas.length} mensajes.`);
  console.log('Enlaces de cliente para abrir en el navegador:');
  for (const linea of lineas) {
    console.log(`  ${linea.nombre.padEnd(26)} ${linea.enlace}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
