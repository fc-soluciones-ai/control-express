/**
 * Prueba del proyecto de ubicaciones de clientes.
 *
 * Lo que se vigila aqui no es que la pantalla se vea bien, sino las cuatro
 * cosas que, si fallan, se notan cuando ya se mandaron miles de mensajes:
 *
 *   1. Que la lectura de los archivos del POS no invente ni pierda telefonos.
 *   2. Que no se le arme una solicitud a quien no deberia recibirla.
 *   3. Que el enlace de un cliente no sirva para tocar la ficha de otro.
 *   4. Que un punto que llega no reemplace la direccion por su cuenta.
 *
 * Ejecutar con: npm run test:ubicaciones
 */

import { prisma } from '@/lib/db/prisma';
import {
  calidadDeDireccion,
  esCelular,
  estadoDelCliente,
  juntarDireccion,
  leerTelefono,
  mejorDireccion,
  nombreBuscable,
  reconstruirFormatoViejo,
  telefonoBonito,
  telefonosEnTexto,
} from '@/lib/clientes/normalizar';
import { TEXTO_CONSENTIMIENTO } from '@/lib/clientes/consentimiento';
import { esErrorNegocio } from '@/server/errores';
import { condicionDeClientes } from '@/server/services/clientes';
import {
  abrirSolicitud,
  armarTanda,
  aceptarUbicacion,
  guardarUbicacionDelCliente,
  marcarTandaEnviada,
  rechazarSolicitud,
  vencerSolicitudesViejas,
} from '@/server/services/ubicaciones';
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

async function mensaje(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
    return 'SIN_ERROR';
  } catch (e) {
    if (esErrorNegocio(e)) return e.message;
    console.error(e);
    return 'ERROR_INESPERADO';
  }
}

async function limpiar(): Promise<void> {
  await prisma.ubicacionCliente.deleteMany();
  await prisma.solicitudUbicacion.deleteMany();
  await prisma.telefonoCliente.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.eventoAuditoria.deleteMany();
  await prisma.cajero.deleteMany();
}

/** Un cliente de prueba con los datos ya calculados. */
async function sembrarCliente(datos: {
  clave: string;
  nombre: string;
  telefono: string | null;
  direccion: string;
  estado: string;
  compartido?: boolean;
}) {
  return prisma.cliente.create({
    data: {
      clave: datos.clave,
      nombre: datos.nombre,
      nombreBuscable: nombreBuscable(datos.nombre),
      telefono: datos.telefono,
      esCelular: datos.telefono ? esCelular(datos.telefono) : false,
      direccionTexto: datos.direccion,
      calidadDireccion: calidadDeDireccion(datos.direccion),
      estado: datos.estado,
      telefonoCompartido: datos.compartido ?? false,
      origenCarga: 'PRUEBA',
      telefonos: datos.telefono
        ? {
            create: {
              numero: datos.telefono,
              esCelular: esCelular(datos.telefono),
              origen: 'DIRECTO',
              comoVenia: datos.telefono,
              campo: 'telefono',
            },
          }
        : undefined,
    },
  });
}

async function main(): Promise<void> {
  exigirBaseDePruebas();
  await limpiar();

  // ===========================================================================
  console.log('--- Leer los telefonos como vienen del POS ---');

  comprobar('un celular bien escrito', leerTelefono('87069355'), {
    numero: '87069355',
    origen: 'DIRECTO',
    comoVenia: '87069355',
  });
  comprobar('un fijo bien escrito', leerTelefono('2443-2440')?.numero, '24432440');
  comprobar('con el codigo de pais', leerTelefono('+506 8706 9355')?.numero, '87069355');

  // La migracion de 2008: los fijos ganaron un 2 y los celulares un 8.
  comprobar('fijo viejo de Alajuela', reconstruirFormatoViejo('4875058'), '24875058');
  comprobar('celular viejo', reconstruirFormatoViejo('8247361'), '88247361');
  comprobar('prefijo 3 era celular', reconstruirFormatoViejo('3812345'), '83812345');
  // El 1 y el 7 no existian como prefijo de siete digitos: no hay regla.
  comprobar('prefijo sin regla', reconstruirFormatoViejo('7123456'), '');
  comprobar('el de 7 digitos queda marcado', leerTelefono('4875058')?.origen, 'FORMATO_VIEJO');

  comprobar('una cedula juridica no es telefono', leerTelefono('3101587533'), null);
  comprobar('una cedula fisica no es telefono', leerTelefono('115620764'), null);
  comprobar('texto que no es telefono', leerTelefono('BLANCO NO USAR'), null);
  comprobar('relleno de ceros', leerTelefono('00'), null);
  comprobar('vacio', leerTelefono(null), null);

  comprobar(
    'dos numeros pegados: se toma el primero',
    leerTelefono('84498775             84498775')?.numero,
    '84498775',
  );
  // "4878031MIRIAM": los digitos son siete, asi que pasa por la regla de 2008.
  comprobar('numero con un nombre pegado', leerTelefono('4878031MIRIAM')?.numero, '24878031');

  comprobar(
    'telefono escondido en la direccion',
    telefonosEnTexto('83858634 RECIBE JESSICA COYOL INDOPARK'),
    ['83858634'],
  );
  comprobar(
    'no confunde una cedula con un telefono',
    telefonosEnTexto('CEDULA 3101587533 OFICINA'),
    [],
  );

  comprobar('celular contra fijo', [esCelular('87069355'), esCelular('24432440')], [true, false]);
  comprobar('como se muestra', telefonoBonito('87069355'), '8706-9355');

  // ===========================================================================
  console.log('\n--- Que tanto sirve una direccion ---');

  comprobar('vacia', calidadDeDireccion(''), 'VACIA');
  comprobar('el POS obliga a llenarla y pusieron un 1', calidadDeDireccion('1'), 'VACIA');
  comprobar('solo la provincia', calidadDeDireccion('ALAJUELA'), 'SOLO_LUGAR');
  comprobar('un barrio', calidadDeDireccion('CEBADILLA LAGUITO'), 'POBRE');
  comprobar(
    'con una referencia',
    calidadDeDireccion('300 MTS OESTE DEL CEMENTERIO TURRUCARES'),
    'PASABLE',
  );
  comprobar(
    'con todo el detalle',
    calidadDeDireccion('LA GARITA DESPUES DE APARTAMENTOS DE PIRAGUA 5 CASA A LA DERECHA'),
    'DETALLADA',
  );

  comprobar(
    'junta los pedazos y bota el relleno',
    juntarDireccion(['CEBADILLA', '0', 'LAGUITO', null, 'CEBADILLA']),
    'CEBADILLA, LAGUITO',
  );
  // En 1.694 clientes el archivo de domicilio dejo la calle en "1".
  comprobar('gana la que dice algo', mejorDireccion('SAN JOSE PAVAS', '1'), 'SAN JOSE PAVAS');
  comprobar(
    'gana la mas descriptiva',
    mejorDireccion('ALAJUELA', '200 METROS SUR DE LA IGLESIA, CASA VERDE'),
    '200 METROS SUR DE LA IGLESIA, CASA VERDE',
  );

  // ===========================================================================
  console.log('\n--- El estado de cada cliente ---');

  const base = {
    nombre: 'JOSE PEREZ',
    telefono: '87069355',
    origenTelefono: 'DIRECTO' as const,
    calidadDireccion: 'DETALLADA' as const,
    telefonoCompartido: false,
  };
  comprobar('todo en orden', estadoDelCliente(base), 'LISTO');
  comprobar('sin nombre', estadoDelCliente({ ...base, nombre: '' }), 'SIN_NOMBRE');
  comprobar('sin telefono', estadoDelCliente({ ...base, telefono: null }), 'SIN_TELEFONO');
  comprobar(
    'telefono reconstruido',
    estadoDelCliente({ ...base, origenTelefono: 'FORMATO_VIEJO' }),
    'TELEFONO_POR_CONFIRMAR',
  );
  comprobar(
    'telefono de varios clientes',
    estadoDelCliente({ ...base, telefonoCompartido: true }),
    'TELEFONO_COMPARTIDO',
  );
  comprobar(
    'un fijo no recibe WhatsApp',
    estadoDelCliente({ ...base, telefono: '24432440' }),
    'SOLO_FIJO',
  );
  comprobar(
    'direccion que no sirve',
    estadoDelCliente({ ...base, calidadDireccion: 'SOLO_LUGAR' }),
    'DIRECCION_POBRE',
  );
  // El orden importa: conseguir el telefono es lo que desbloquea lo demas.
  comprobar(
    'sin telefono y con direccion mala manda SIN_TELEFONO',
    estadoDelCliente({ ...base, telefono: null, calidadDireccion: 'VACIA' }),
    'SIN_TELEFONO',
  );

  // ===========================================================================
  console.log('\n--- La clave del POS con sus ceros ---');

  // 1.484 pares de claves colisionan al quitar los ceros, y ninguno es la
  // misma persona. Si alguna vez se normaliza la clave, esto truena.
  const conCeros = await sembrarCliente({
    clave: '003863',
    nombre: '3101007589 DIPO S.A.',
    telefono: null,
    direccion: 'ALAJUELA',
    estado: 'SIN_TELEFONO',
  });
  const sinCeros = await sembrarCliente({
    clave: '3863',
    nombre: 'GATA',
    telefono: '88887777',
    direccion: '200 METROS SUR DE LA ESCUELA, CASA AZUL',
    estado: 'LISTO',
  });
  comprobar('003863 y 3863 son dos clientes', conCeros.id !== sinCeros.id, true);
  comprobar('cuantos clientes hay', await prisma.cliente.count(), 2);

  // ===========================================================================
  console.log('\n--- A quien se le arma una solicitud ---');

  const cajero = await prisma.cajero.create({
    data: { nombre: 'PRUEBA', pin: 'x', rol: 'ADMIN' },
  });

  await sembrarCliente({
    clave: '000100',
    nombre: 'CLIENTE CON FIJO',
    telefono: '24432440',
    direccion: '100 METROS NORTE DE LA IGLESIA DE TAMBOR',
    estado: 'SOLO_FIJO',
  });
  await sembrarCliente({
    clave: '000101',
    nombre: 'CLIENTE SIN TELEFONO',
    telefono: null,
    direccion: '100 METROS NORTE DE LA IGLESIA DE TAMBOR',
    estado: 'SIN_TELEFONO',
  });
  await sembrarCliente({
    clave: '000102',
    nombre: 'CLIENTE COMPARTIDO',
    telefono: '89801999',
    direccion: '100 METROS NORTE DE LA IGLESIA DE TAMBOR',
    estado: 'TELEFONO_COMPARTIDO',
    compartido: true,
  });
  const listo = await sembrarCliente({
    clave: '000103',
    nombre: 'MARIA RODRIGUEZ',
    telefono: '87069355',
    direccion: 'CEBADILLA, 200 METROS OESTE DEL BAR, PORTON VERDE',
    estado: 'LISTO',
  });

  const primera = await armarTanda(cajero.id, 50);
  comprobar('la tanda es la numero 1', primera.tanda, 1);
  // De los cinco clientes sembrados solo dos estan LISTO: GATA y MARIA.
  comprobar('solo entran los que estan listos', primera.lineas.length, 2);
  comprobar(
    'no entro el del telefono fijo',
    primera.lineas.some((l) => l.telefono === '24432440'),
    false,
  );
  comprobar(
    'no entro el del telefono compartido',
    primera.lineas.some((l) => l.telefono === '89801999'),
    false,
  );

  const deMaria = primera.lineas.find((l) => l.clave === '000103');
  comprobar('el enlace lleva el token', deMaria?.enlace.includes('/ubicacion/'), true);
  comprobar(
    'el mensaje saluda por el primer nombre',
    deMaria?.mensaje.startsWith('Hola Maria,'),
    true,
  );
  comprobar(
    'el enlace de WhatsApp apunta al numero del cliente',
    deMaria?.enlaceWhatsApp.startsWith('https://wa.me/50687069355?text='),
    true,
  );

  // Armar otra tanda sin que haya nadie nuevo no debe repetir a los mismos.
  const segunda = await armarTanda(cajero.id, 50);
  comprobar('no se le escribe dos veces al mismo', segunda.lineas.length, 0);

  comprobar('una tanda de 0 no se permite', await mensaje(armarTanda(cajero.id, 0)),
    'La tanda tiene que ser de 1 a 500 mensajes. Mas de 500 en un dia hace que WhatsApp bloquee el numero.');
  comprobar('una tanda de 5.000 tampoco', await mensaje(armarTanda(cajero.id, 5000)),
    'La tanda tiene que ser de 1 a 500 mensajes. Mas de 500 en un dia hace que WhatsApp bloquee el numero.');

  comprobar('marcar la tanda como enviada', await marcarTandaEnviada(1, cajero.id), 2);

  // ===========================================================================
  console.log('\n--- El enlace del cliente ---');

  const token = deMaria?.enlace.split('/ubicacion/')[1] ?? '';
  const abierta = await abrirSolicitud(token);
  comprobar('el enlace abre la ficha de su cliente', abierta?.nombreCliente, 'MARIA RODRIGUEZ');
  comprobar(
    'muestra la direccion que hay que corregir',
    abierta?.direccionActual,
    'CEBADILLA, 200 METROS OESTE DEL BAR, PORTON VERDE',
  );
  comprobar('un token inventado no abre nada', await abrirSolicitud('noexiste'), null);

  // Abrir el enlace prueba que el numero es de quien creiamos.
  const telefonoDeMaria = await prisma.telefonoCliente.findFirst({
    where: { clienteId: listo.id },
  });
  comprobar('abrir el enlace verifica el telefono', telefonoDeMaria?.verificadoEn !== null, true);
  const solicitudDeMaria = await prisma.solicitudUbicacion.findUnique({ where: { token } });
  comprobar('queda anotado que lo abrio', solicitudDeMaria?.estado, 'ABIERTA');

  // ===========================================================================
  console.log('\n--- El punto que manda el cliente ---');

  comprobar(
    'una ubicacion fuera de Costa Rica se rechaza',
    await mensaje(
      guardarUbicacionDelCliente({
        token,
        latitud: 25.76,
        longitud: -80.19, // Miami
        precisionMetros: 10,
        nota: null,
        textoAceptado: TEXTO_CONSENTIMIENTO,
        ip: null,
      }),
    ),
    'La ubicacion que mando su telefono no esta en Costa Rica. Revise que tenga el GPS encendido.',
  );

  comprobar(
    'un punto con medio kilometro de error se rechaza',
    await mensaje(
      guardarUbicacionDelCliente({
        token,
        latitud: 10.0162,
        longitud: -84.2116,
        precisionMetros: 500,
        nota: null,
        textoAceptado: TEXTO_CONSENTIMIENTO,
        ip: null,
      }),
    ),
    'Su telefono dice que la ubicacion puede estar equivocada por 500 metros. ' +
      'Salga al patio o a la calle y vuelva a intentarlo.',
  );

  await guardarUbicacionDelCliente({
    token,
    latitud: 10.0162,
    longitud: -84.2116,
    precisionMetros: 12,
    nota: 'Porton verde, el perro ladra',
    textoAceptado: TEXTO_CONSENTIMIENTO,
    ip: '186.15.1.1',
  });

  const puntos = await prisma.ubicacionCliente.findMany({ where: { clienteId: listo.id } });
  comprobar('quedo un punto guardado', puntos.length, 1);
  // Lo mas importante de todo el modulo: no reemplaza nada por su cuenta.
  comprobar('entra como propuesta, no como la buena', puntos[0]?.estado, 'PROPUESTA');
  comprobar('con la nota del cliente', puntos[0]?.nota, 'Porton verde, el perro ladra');
  comprobar('y con el origen', puntos[0]?.origen, 'CLIENTE');

  const trasResponder = await prisma.solicitudUbicacion.findUnique({ where: { token } });
  comprobar('la solicitud queda respondida', trasResponder?.estado, 'RESPONDIDA');
  comprobar(
    'se guarda el permiso que leyo, palabra por palabra',
    trasResponder?.textoAceptado,
    TEXTO_CONSENTIMIENTO,
  );
  comprobar('y desde donde lo acepto', trasResponder?.ip, '186.15.1.1');

  const clienteTrasPunto = await prisma.cliente.findUnique({ where: { clave: '000103' } });
  comprobar(
    'la direccion escrita no se toco',
    clienteTrasPunto?.direccionTexto,
    'CEBADILLA, 200 METROS OESTE DEL BAR, PORTON VERDE',
  );

  // ===========================================================================
  console.log('\n--- Aceptar y rechazar ---');

  const idPunto = puntos[0]?.id ?? '';
  await aceptarUbicacion(idPunto, cajero.id);
  const aceptado = await prisma.ubicacionCliente.findUnique({ where: { id: idPunto } });
  comprobar('aceptada', aceptado?.estado, 'ACEPTADA');
  comprobar('queda quien la reviso', aceptado?.revisadaPor, cajero.id);

  // Un segundo punto del mismo cliente: al aceptarlo, el primero deja de ser
  // el bueno pero no se borra (un cliente que se muda y vuelve es comun).
  const segundoPunto = await prisma.ubicacionCliente.create({
    data: {
      clienteId: listo.id,
      latitud: 10.017,
      longitud: -84.212,
      precisionMetros: 8,
      origen: 'REPARTIDOR',
      estado: 'PROPUESTA',
    },
  });
  await aceptarUbicacion(segundoPunto.id, cajero.id);
  const primeroAhora = await prisma.ubicacionCliente.findUnique({ where: { id: idPunto } });
  comprobar('el punto viejo deja de ser el bueno', primeroAhora?.estado, 'PROPUESTA');
  comprobar('pero no se borra', primeroAhora !== null, true);
  comprobar(
    'solo hay una aceptada',
    await prisma.ubicacionCliente.count({ where: { clienteId: listo.id, estado: 'ACEPTADA' } }),
    1,
  );

  // ===========================================================================
  console.log('\n--- Cuando el cliente dice que no ---');

  const deGata = primera.lineas.find((l) => l.clave === '3863');
  const tokenGata = deGata?.enlace.split('/ubicacion/')[1] ?? '';
  await rechazarSolicitud(tokenGata, '186.15.1.2');
  comprobar(
    'queda rechazada',
    (await prisma.solicitudUbicacion.findUnique({ where: { token: tokenGata } }))?.estado,
    'RECHAZADA',
  );
  // Preguntar dos veces despues de un no es como se consigue un bloqueo.
  comprobar('el enlace ya no abre', await abrirSolicitud(tokenGata), null);
  const trasRechazo = await armarTanda(cajero.id, 50);
  comprobar('no se le vuelve a escribir', trasRechazo.lineas.length, 0);

  // ===========================================================================
  console.log('\n--- Los enlaces que vencen ---');

  await prisma.solicitudUbicacion.updateMany({
    where: { token },
    data: { estado: 'ENVIADA', expiraEn: new Date(Date.now() - 1000) },
  });
  comprobar('se cierra el vencido', await vencerSolicitudesViejas(), 1);
  comprobar('un enlace vencido no abre', await abrirSolicitud(token), null);

  // ===========================================================================
  console.log('\n--- La busqueda de la pantalla ---');

  const porNombre = await prisma.cliente.count({
    where: condicionDeClientes({ buscar: 'maria' }),
  });
  comprobar('busca por nombre sin importar mayusculas', porNombre, 1);
  const porTelefono = await prisma.cliente.count({
    where: condicionDeClientes({ buscar: '8706-9355' }),
  });
  comprobar('busca por telefono con guion', porTelefono, 1);
  const porClave = await prisma.cliente.count({
    where: condicionDeClientes({ buscar: '003863' }),
  });
  comprobar('busca por la clave con ceros', porClave, 1);
  const conUbicacion = await prisma.cliente.count({
    where: condicionDeClientes({ conUbicacion: 'SI' }),
  });
  comprobar('filtra los que ya mandaron un punto', conUbicacion, 1);

  // ===========================================================================
  console.log('\n--- Lo que quedo en la bitacora ---');

  const eventos = await prisma.eventoAuditoria.groupBy({
    by: ['tipo'],
    _count: { _all: true },
  });
  const porTipo = Object.fromEntries(eventos.map((e) => [e.tipo, e._count._all]));
  // Solo la tanda que de verdad armo mensajes: una tanda vacia no es un hecho
  // que valga la pena anotar.
  comprobar('se anoto la tanda armada', porTipo.SOLICITUDES_GENERADAS, 1);
  comprobar('y la que se marco como enviada', porTipo.SOLICITUDES_MARCADAS_ENVIADAS, 1);
  comprobar('y el punto que llego', porTipo.UBICACION_RECIBIDA, 1);
  comprobar('y las dos que se aceptaron', porTipo.UBICACION_ACEPTADA, 2);

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
