/**
 * Valores validos de las columnas tipo "enum" del esquema.
 *
 * Las columnas son String y no enums nativos, de cuando la base era SQLite.
 * Este archivo es la unica definicion autorizada de los valores permitidos y
 * se usa tanto para validar con Zod como para tipar el codigo.
 *
 * De aqui salieron los valores de lo contable: turnos, tipos de corte, tipos
 * de reporte del Excel, tiquetes y estados de impresion. Si alguno vuelve a
 * aparecer en un archivo, es que quedo codigo viejo sin quitar.
 */

export const ESTADO_CHOFER = ['ACTIVO', 'INACTIVO'] as const;
export type EstadoChofer = (typeof ESTADO_CHOFER)[number];

/**
 * Los estados por los que pasa un pedido, tal como los deriva el agente de las
 * marcas de tiempo del POS. Ver estadoDelPedido en services/pos.ts.
 *
 * Hoy EN_COCINA y ASIGNADO casi no aparecen: el POS tiene las columnas pero
 * nadie las usa en el local. Se mantienen porque el dia que se empiecen a
 * marcar, el tablero ya sabe pintarlas y no hay que migrar nada.
 */
export const ESTADO_PEDIDO = [
  'RECIBIDO',
  'EN_COCINA',
  'ASIGNADO',
  'EN_CAMINO',
  'ENTREGADO',
  'CANCELADO',
] as const;
export type EstadoPedido = (typeof ESTADO_PEDIDO)[number];

export const TIPO_EVENTO = [
  'CHOFER_CREADO',
  'CHOFER_EDITADO',
  'CHOFER_DESACTIVADO',
  'LOGIN',
  'LOGIN_FALLIDO',
  'CAJERO_BLOQUEADO',
  'PIN_CAMBIADO',
  'RESPALDO',
  'MOTO_CREADA',
  'MOTO_EDITADA',
  'MOTO_ESTADO',
  'MOTO_ASIGNADA',
  'MOTO_LIBERADA',
  'EVIDENCIA',
  'MANTENIMIENTO',
  'USUARIO_CREADO',
  'USUARIO_EDITADO',
  'CLIENTES_IMPORTADOS',
  'SOLICITUDES_GENERADAS',
  'SOLICITUDES_MARCADAS_ENVIADAS',
  'UBICACION_RECIBIDA',
  'UBICACION_ACEPTADA',
  'UBICACION_RECHAZADA',
] as const;
export type TipoEvento = (typeof TIPO_EVENTO)[number];

export const ROL_CAJERO = ['CAJERO', 'SUPERVISOR', 'ADMIN'] as const;
export type RolCajero = (typeof ROL_CAJERO)[number];

/**
 * Estado de una motocicleta.
 *
 * EN_MANTENIMIENTO es temporal y se espera que vuelva; FUERA_DE_SERVICIO es
 * para la moto que no va a volver pronto, por accidente o por venta. Las dos
 * disparan el reemplazo por la comodin, pero conviene distinguirlas en los
 * reportes.
 */
export const ESTADO_MOTO = ['OPERATIVA', 'EN_MANTENIMIENTO', 'FUERA_DE_SERVICIO'] as const;
export type EstadoMoto = (typeof ESTADO_MOTO)[number];

export const TIPO_MANTENIMIENTO = ['PREVENTIVO', 'CORRECTIVO'] as const;
export type TipoMantenimiento = (typeof TIPO_MANTENIMIENTO)[number];

/** RTV es la revision tecnica vehicular de Costa Rica. */
export const CATEGORIA_MANTENIMIENTO = [
  'GASOLINA',
  'CAMBIO_ACEITE',
  'LLANTAS',
  'FRENOS',
  'REPUESTOS',
  'RTV',
  'SEGURO',
  'OTRO',
] as const;
export type CategoriaMantenimiento = (typeof CATEGORIA_MANTENIMIENTO)[number];

/** FIJA es la moto de siempre del chofer; COMODIN es el reemplazo temporal. */
export const TIPO_ASIGNACION = ['FIJA', 'COMODIN'] as const;
export type TipoAsignacion = (typeof TIPO_ASIGNACION)[number];

// -----------------------------------------------------------------------------
// Clientes y ubicaciones
// -----------------------------------------------------------------------------

/**
 * Que tanto sirve una direccion escrita para que un repartidor salga con ella.
 *
 * Se mide por el largo del texto porque en Costa Rica no hay numeros de casa:
 * una direccion util es una cadena de referencias ("200 metros oeste de la
 * iglesia, porton verde"), y esas no caben en doce letras. "ALAJUELA" no es
 * una direccion, es una provincia.
 */
export const CALIDAD_DIRECCION = [
  'VACIA',
  'SOLO_LUGAR',
  'POBRE',
  'PASABLE',
  'DETALLADA',
] as const;
export type CalidadDireccion = (typeof CALIDAD_DIRECCION)[number];

/** Las dos ultimas son las que sirven para repartir sin llamar. */
export const DIRECCION_SIRVE: ReadonlyArray<CalidadDireccion> = ['PASABLE', 'DETALLADA'];

/**
 * En que punto esta cada cliente para el proyecto de ubicaciones.
 *
 * Es el orden de trabajo: LISTO se le puede escribir hoy, y cada otro valor
 * dice exactamente que falta antes de poder escribirle.
 */
export const ESTADO_CLIENTE = [
  'LISTO',
  'SIN_NOMBRE',
  'SIN_TELEFONO',
  'TELEFONO_POR_CONFIRMAR',
  'TELEFONO_COMPARTIDO',
  'SOLO_FIJO',
  'DIRECCION_POBRE',
] as const;
export type EstadoCliente = (typeof ESTADO_CLIENTE)[number];

/**
 * De donde salio un telefono.
 *
 * Importa para decidir a quien se le escribe: DIRECTO venia bien en el
 * archivo, pero FORMATO_VIEJO se reconstruyo con la regla de 2008 y
 * ESCONDIDO_DIRECCION lo leyo un programa dentro de un texto. A esos dos hay
 * que confirmarlos antes de mandarles nada: el numero puede ser de otra casa.
 */
export const ORIGEN_TELEFONO = [
  'DIRECTO',
  'FORMATO_VIEJO',
  'EXTRAIDO_TEXTO',
  'ESCONDIDO_DIRECCION',
  'CLAVE_DEL_POS',
] as const;
export type OrigenTelefono = (typeof ORIGEN_TELEFONO)[number];

/** Los que se pueden usar sin que una persona los revise primero. */
export const TELEFONO_CONFIABLE: ReadonlyArray<OrigenTelefono> = ['DIRECTO', 'CLAVE_DEL_POS'];

export const ESTADO_SOLICITUD = [
  'PENDIENTE',
  'ENVIADA',
  'ABIERTA',
  'RESPONDIDA',
  'VENCIDA',
  'RECHAZADA',
] as const;
export type EstadoSolicitud = (typeof ESTADO_SOLICITUD)[number];

export const ORIGEN_UBICACION = ['CLIENTE', 'REPARTIDOR', 'CAJA'] as const;
export type OrigenUbicacion = (typeof ORIGEN_UBICACION)[number];

/** Una ubicacion entra como PROPUESTA y no reemplaza nada hasta aceptarse. */
export const ESTADO_UBICACION = ['PROPUESTA', 'ACEPTADA', 'RECHAZADA'] as const;
export type EstadoUbicacion = (typeof ESTADO_UBICACION)[number];
