/**
 * Prueba de lo que llega desde WhatsApp.
 *
 * Lo que se vigila es lo que no se puede arreglar despues: que no entre un
 * aviso falso, que un mensaje repetido no deje dos puntos, y que una ubicacion
 * no termine en la ficha equivocada cuando dos clientes comparten el telefono.
 *
 * Ejecutar con: npm run test:whatsapp
 */

import { createHmac } from 'node:crypto';

import { prisma } from '@/lib/db/prisma';
import { calidadDeDireccion, esCelular, nombreBuscable } from '@/lib/clientes/normalizar';
import {
  firmaValida,
  recibirUbicacion,
  respuestaDeVerificacion,
  resumenDeMensajes,
  telefonoDeWhatsApp,
  ubicacionesDelAviso,
} from '@/server/services/whatsapp';
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

const SECRETO = 'secreto-de-prueba';

/** Un aviso de Meta con una ubicacion adentro. */
function aviso(id: string, de: string, lat: number, lon: number, nombre?: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              messages: [
                {
                  id,
                  from: de,
                  type: 'location',
                  timestamp: '1790000000',
                  location: { latitude: lat, longitude: lon, name: nombre },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function firmar(cuerpo: string): string {
  return 'sha256=' + createHmac('sha256', SECRETO).update(cuerpo, 'utf8').digest('hex');
}

async function sembrar(clave: string, nombre: string, telefono: string) {
  const direccion = 'CEBADILLA, 200 METROS OESTE DEL BAR, PORTON VERDE';
  return prisma.cliente.create({
    data: {
      clave,
      nombre,
      nombreBuscable: nombreBuscable(nombre),
      telefono,
      esCelular: esCelular(telefono),
      direccionTexto: direccion,
      calidadDireccion: calidadDeDireccion(direccion),
      estado: 'LISTO',
      origenCarga: 'PRUEBA',
      telefonos: {
        create: {
          numero: telefono,
          esCelular: esCelular(telefono),
          origen: 'DIRECTO',
          comoVenia: telefono,
          campo: 'telefono',
        },
      },
    },
  });
}

async function limpiar(): Promise<void> {
  await prisma.mensajeUbicacion.deleteMany();
  await prisma.ubicacionCliente.deleteMany();
  await prisma.solicitudUbicacion.deleteMany();
  await prisma.telefonoCliente.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.eventoAuditoria.deleteMany();
}

async function main(): Promise<void> {
  exigirBaseDePruebas();
  await limpiar();

  process.env.WHATSAPP_APP_SECRET = SECRETO;
  process.env.WHATSAPP_VERIFY_TOKEN = 'token-de-alta';

  // ===========================================================================
  console.log('--- La firma de Meta ---');

  const cuerpo = JSON.stringify(aviso('wamid.1', '50687069355', 10.0162, -84.2116));
  comprobar('una firma buena pasa', firmaValida(cuerpo, firmar(cuerpo)), true);
  comprobar('una firma de otro cuerpo no pasa', firmaValida(cuerpo, firmar(cuerpo + ' ')), false);
  comprobar('sin cabecera no pasa', firmaValida(cuerpo, null), false);
  comprobar('con otro formato no pasa', firmaValida(cuerpo, 'sha1=abc'), false);
  comprobar('una firma corta no pasa', firmaValida(cuerpo, 'sha256=00'), false);
  comprobar('basura en la firma no pasa', firmaValida(cuerpo, 'sha256=zzzz'), false);

  // Sin secreto configurado NO se acepta nada: es preferible que el webhook
  // deje de funcionar a que acepte cualquier cosa sin comprobar.
  const guardado = process.env.WHATSAPP_APP_SECRET;
  delete process.env.WHATSAPP_APP_SECRET;
  comprobar('sin secreto configurado no pasa nada', firmaValida(cuerpo, firmar(cuerpo)), false);
  process.env.WHATSAPP_APP_SECRET = guardado;

  console.log('\n--- El alta del webhook ---');
  const alta = new URLSearchParams({
    'hub.mode': 'subscribe',
    'hub.verify_token': 'token-de-alta',
    'hub.challenge': '98765',
  });
  comprobar('con el token bueno devuelve el reto', respuestaDeVerificacion(alta), '98765');
  const mala = new URLSearchParams({
    'hub.mode': 'subscribe',
    'hub.verify_token': 'otro',
    'hub.challenge': '98765',
  });
  comprobar('con otro token no devuelve nada', respuestaDeVerificacion(mala), null);

  // ===========================================================================
  console.log('\n--- Sacar la ubicacion del aviso ---');

  const sacadas = ubicacionesDelAviso(aviso('wamid.1', '50687069355', 10.0162, -84.2116, 'Casa'));
  comprobar('se saca una ubicacion', sacadas.length, 1);
  comprobar('con su id de mensaje', sacadas[0]?.mensajeId, 'wamid.1');
  comprobar('y el nombre que puso el cliente', sacadas[0]?.nombre, 'Casa');

  // Tambien llegan avisos de entrega, de lectura y mensajes de texto.
  const texto = {
    entry: [
      {
        changes: [
          { value: { messages: [{ id: 'wamid.2', from: '50687069355', type: 'text' }] } },
        ],
      },
    ],
  };
  comprobar('un mensaje de texto se ignora', ubicacionesDelAviso(texto).length, 0);
  comprobar('un aviso vacio no revienta', ubicacionesDelAviso({}).length, 0);
  comprobar('y uno nulo tampoco', ubicacionesDelAviso(null).length, 0);

  console.log('\n--- El numero que manda WhatsApp ---');
  comprobar('viene con codigo de pais', telefonoDeWhatsApp('50687069355'), '87069355');
  comprobar('con el mas adelante', telefonoDeWhatsApp('+506 8706 9355'), '87069355');
  comprobar('un numero de otro pais no sirve', telefonoDeWhatsApp('13055551234'), null);

  // ===========================================================================
  console.log('\n--- Guardar lo que llega ---');

  const maria = await sembrar('000103', 'MARIA RODRIGUEZ', '87069355');

  comprobar(
    'se liga al cliente del telefono',
    await recibirUbicacion({
      mensajeId: 'wamid.10',
      telefonoCrudo: '50687069355',
      latitud: 10.0162,
      longitud: -84.2116,
      nombre: 'Mi casa',
      direccion: null,
    }),
    'LIGADA',
  );

  const puntos = await prisma.ubicacionCliente.findMany({ where: { clienteId: maria.id } });
  comprobar('queda un punto en su ficha', puntos.length, 1);
  // Igual que las de la pantalla: nadie reemplaza la direccion por su cuenta.
  comprobar('entra como propuesta', puntos[0]?.estado, 'PROPUESTA');
  comprobar('con lo que el cliente escribio', puntos[0]?.nota, 'Mi casa');
  const tel = await prisma.telefonoCliente.findFirst({ where: { clienteId: maria.id } });
  comprobar('contestar verifica el telefono', tel?.verificadoEn !== null, true);

  // Meta reintenta el lote entero cuando no contestamos rapido.
  comprobar(
    'el mismo mensaje no entra dos veces',
    await recibirUbicacion({
      mensajeId: 'wamid.10',
      telefonoCrudo: '50687069355',
      latitud: 10.0162,
      longitud: -84.2116,
      nombre: null,
      direccion: null,
    }),
    'REPETIDA',
  );
  comprobar(
    'y no deja un segundo punto',
    await prisma.ubicacionCliente.count({ where: { clienteId: maria.id } }),
    1,
  );

  console.log('\n--- Los casos que decide una persona ---');

  comprobar(
    'un numero que no esta en la base',
    await recibirUbicacion({
      mensajeId: 'wamid.11',
      telefonoCrudo: '50688889999',
      latitud: 10.0162,
      longitud: -84.2116,
      nombre: null,
      direccion: null,
    }),
    'SIN_CLIENTE',
  );

  // 337 telefonos de la base real estan en mas de una ficha.
  await sembrar('006790', 'GRUPO JEA S.R.L', '89801999');
  await sembrar('6982', 'JOSE ALFARO', '89801999');
  comprobar(
    'un telefono en dos fichas no se adivina',
    await recibirUbicacion({
      mensajeId: 'wamid.12',
      telefonoCrudo: '50689801999',
      latitud: 10.0162,
      longitud: -84.2116,
      nombre: null,
      direccion: null,
    }),
    'AMBIGUA',
  );
  const ambigua = await prisma.mensajeUbicacion.findUnique({ where: { mensajeId: 'wamid.12' } });
  comprobar('y se anota cuantos candidatos habia', ambigua?.candidatos, 2);
  comprobar(
    'una ambigua no toca ninguna ficha',
    await prisma.ubicacionCliente.count(),
    1,
  );

  comprobar(
    'un punto en Miami no entra en la ficha',
    await recibirUbicacion({
      mensajeId: 'wamid.13',
      telefonoCrudo: '50687069355',
      latitud: 25.76,
      longitud: -80.19,
      nombre: null,
      direccion: null,
    }),
    'FUERA_DE_ZONA',
  );
  comprobar(
    'y Maria sigue con un solo punto',
    await prisma.ubicacionCliente.count({ where: { clienteId: maria.id } }),
    1,
  );

  console.log('\n--- La bandeja ---');
  const resumen = await resumenDeMensajes();
  comprobar('ligadas', resumen.LIGADA, 1);
  comprobar('sin cliente', resumen.SIN_CLIENTE, 1);
  comprobar('ambiguas', resumen.AMBIGUA, 1);
  comprobar('fuera de zona', resumen.FUERA_DE_ZONA, 1);

  await limpiar();
  console.log(`\n${fallos === 0 ? 'Todo bien' : `${fallos} fallas`}`);
  if (fallos > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
