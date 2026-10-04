/**
 * Exportacion del historial a Excel.
 *
 * Los montos salen como NUMEROS decimales, no como texto ya formateado: quien
 * abre el reporte va a querer sumar columnas en Excel, y una columna de texto
 * con separador de miles no se suma. El formato de moneda se aplica como
 * formato de celda.
 */

import * as XLSX from 'xlsx';

import { deCentimos, esClaveDeDinero } from '@/lib/money/money';
import { formatearFechaHora } from '@/lib/fechas';
import type { FilaHistorial, MetricasHistorial } from '@/server/services/historial';
import type {
  LineaHistorial as LineaFlota,
  ResumenPorMoto as ResumenMoto,
} from '@/server/services/mantenimiento';

/** Formato de celda para colones sin decimales. */
const FORMATO_MONEDA = '#,##0';

const NOMBRE_EVENTO: Record<string, string> = {
  ABONO: 'Abono parcial',
  ABONO_ANULADO: 'Abono anulado',
  CARGA_EXCEL: 'Carga de Excel',
  CIERRE_CHOFER: 'Cierre de turno',
  ARQUEO: 'Arqueo de caja',
  CHOFER_CREADO: 'Alta de repartidor',
  CHOFER_EDITADO: 'Edicion de repartidor',
  CHOFER_DESACTIVADO: 'Baja de repartidor',
  REIMPRESION: 'Reimpresion',
  LOGIN: 'Entrada a la caja',
  PIN_CAMBIADO: 'Cambio de PIN',
  USUARIO_CREADO: 'Alta de usuario de caja',
  USUARIO_EDITADO: 'Cambio de usuario de caja',
};

function valorLegible(clave: string, valor: unknown): string {
  // Los montos del detalle vienen en centimos; el reporte los muestra en
  // colones para que coincidan con el resto de las columnas.
  if (typeof valor === 'number' && esClaveDeDinero(clave)) return String(deCentimos(valor));
  if (typeof valor === 'object' && valor !== null) return JSON.stringify(valor);
  return String(valor);
}

function resumirDetalle(detalle: Record<string, unknown> | null): string {
  if (!detalle) return '';
  return Object.entries(detalle)
    .filter(([, valor]) => valor !== null && valor !== undefined)
    .map(([clave, valor]) => `${clave}=${valorLegible(clave, valor)}`)
    .join('; ');
}

export interface ParametrosExportacion {
  filas: readonly FilaHistorial[];
  metricas: MetricasHistorial;
  descripcionFiltro: string;
}

/**
 * Genera el libro y lo devuelve en base64 para que la accion de servidor lo
 * mande al navegador sin escribir nada en disco.
 */
export function exportarHistorialAExcel(parametros: ParametrosExportacion): {
  nombreArchivo: string;
  base64: string;
} {
  const libro = XLSX.utils.book_new();

  // --- Hoja de resumen ---
  const m = parametros.metricas;
  const resumen: unknown[][] = [
    ['Control Express - Reporte de historial'],
    ['Filtro aplicado', parametros.descripcionFiltro],
    ['Generado', formatearFechaHora(new Date())],
    [],
    ['Concepto', 'Monto', 'Cantidad'],
    ['Efectivo esperado segun el POS', deCentimos(m.efectivoEsperado), m.cantidadCierres],
    ['Tarjeta', deCentimos(m.tarjeta), ''],
    ['SINPE Movil', deCentimos(m.sinpe), ''],
    ['Viajes', '', m.viajes],
    [],
    ['Abonos parciales recibidos', deCentimos(m.abonosParciales), m.cantidadAbonos],
    ['Entregas en el cierre', deCentimos(m.entregasEnCierre), ''],
    ['Faltantes acumulados', deCentimos(m.faltantes), ''],
    ['Sobrantes acumulados', deCentimos(m.sobrantes), ''],
    ['Diferencia neta', deCentimos(m.diferenciaNeta), ''],
  ];
  const hojaResumen = XLSX.utils.aoa_to_sheet(resumen);
  hojaResumen['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 12 }];
  for (let fila = 5; fila < resumen.length; fila += 1) {
    const celda = hojaResumen[XLSX.utils.encode_cell({ r: fila, c: 1 })];
    if (celda && typeof celda.v === 'number') celda.z = FORMATO_MONEDA;
  }
  XLSX.utils.book_append_sheet(libro, hojaResumen, 'Resumen');

  // --- Hoja de movimientos ---
  const encabezados = [
    'Fecha y hora',
    'Evento',
    'Repartidor',
    'Usuario',
    'Monto',
    'Dispositivo',
    'Entidad',
    'Detalle',
  ];
  const movimientos: unknown[][] = [
    encabezados,
    ...parametros.filas.map((fila) => [
      formatearFechaHora(fila.timestamp),
      NOMBRE_EVENTO[fila.tipo] ?? fila.tipo,
      fila.choferNombre ?? '',
      fila.cajeroNombre ?? '',
      fila.monto === null ? '' : deCentimos(fila.monto),
      fila.dispositivo ?? '',
      fila.entidadTipo ?? '',
      resumirDetalle(fila.detalle),
    ]),
  ];
  const hojaMovimientos = XLSX.utils.aoa_to_sheet(movimientos);
  hojaMovimientos['!cols'] = [
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 60 },
  ];
  for (let fila = 1; fila < movimientos.length; fila += 1) {
    const celda = hojaMovimientos[XLSX.utils.encode_cell({ r: fila, c: 4 })];
    if (celda && typeof celda.v === 'number') celda.z = FORMATO_MONEDA;
  }
  XLSX.utils.book_append_sheet(libro, hojaMovimientos, 'Movimientos');

  const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const marca = new Date().toISOString().slice(0, 10);

  return {
    nombreArchivo: `historial-caja-${marca}.xlsx`,
    base64: buffer.toString('base64'),
  };
}

// ---------------------------------------------------------------------------
// Gastos de flota
// ---------------------------------------------------------------------------

const NOMBRE_CATEGORIA: Record<string, string> = {
  GASOLINA: 'Gasolina',
  CAMBIO_ACEITE: 'Cambio de aceite',
  LLANTAS: 'Llantas',
  FRENOS: 'Frenos',
  REPUESTOS: 'Repuestos',
  RTV: 'Revision tecnica',
  SEGURO: 'Seguro',
  OTRO: 'Otro',
};

const ENCABEZADOS_GASTOS = [
  'Fecha y hora',
  'Moto',
  'Categoria',
  'Tipo',
  'Proveedor',
  'Odometro (km)',
  'Costo',
  'Descripcion',
  'Registrado por',
];

function filasDeGastos(lineas: readonly LineaFlota[]): unknown[][] {
  return lineas.map((l) => [
    formatearFechaHora(new Date(l.timestamp)),
    l.placa,
    NOMBRE_CATEGORIA[l.categoria] ?? l.categoria,
    l.tipo,
    l.tallerOProveedor ?? '',
    l.kilometrajeEvento,
    deCentimos(l.costoTotal),
    l.descripcion ?? '',
    l.cajeroNombre,
  ]);
}

export interface ParametrosGastos {
  lineas: readonly LineaFlota[];
  resumen: readonly ResumenMoto[];
  descripcionFiltro: string;
}

/** El mismo reporte de flota que se ve en pantalla, en un libro de Excel. */
export function exportarGastosAExcel(parametros: ParametrosGastos): {
  nombreArchivo: string;
  base64: string;
} {
  const libro = XLSX.utils.book_new();

  const porMoto: unknown[][] = [
    ['Control Express - Gastos de flota'],
    ['Filtro aplicado', parametros.descripcionFiltro],
    ['Generado', formatearFechaHora(new Date())],
    [],
    ['Moto', 'Gastos', 'Costo total', 'Km recorridos', 'Costo por km'],
    ...parametros.resumen.map((m) => [
      m.placa,
      m.cantidadRegistros,
      deCentimos(m.gastoTotal),
      m.kmRecorridos,
      m.kmRecorridos > 0 ? deCentimos(Math.round(m.gastoTotal / m.kmRecorridos)) : '',
    ]),
  ];
  const hojaMotos = XLSX.utils.aoa_to_sheet(porMoto);
  hojaMotos['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(libro, hojaMotos, 'Por moto');

  const hojaGastos = XLSX.utils.aoa_to_sheet([
    ENCABEZADOS_GASTOS,
    ...filasDeGastos(parametros.lineas),
  ]);
  hojaGastos['!cols'] = [
    { wch: 18 },
    { wch: 12 },
    { wch: 18 },
    { wch: 14 },
    { wch: 26 },
    { wch: 14 },
    { wch: 14 },
    { wch: 40 },
    { wch: 18 },
  ];
  for (let fila = 1; fila <= parametros.lineas.length; fila += 1) {
    const celda = hojaGastos[XLSX.utils.encode_cell({ r: fila, c: 6 })];
    if (celda && typeof celda.v === 'number') celda.z = FORMATO_MONEDA;
  }
  XLSX.utils.book_append_sheet(libro, hojaGastos, 'Gastos');

  const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return {
    nombreArchivo: `gastos-flota-${new Date().toISOString().slice(0, 10)}.xlsx`,
    base64: buffer.toString('base64'),
  };
}

/**
 * El mismo detalle en CSV, para quien lo va a cargar en otro sistema.
 *
 * Separador de punto y coma y BOM al inicio: Excel en espanol abre asi el
 * archivo con las columnas separadas y las tildes derechas. Con coma y sin
 * BOM, todo cae en una sola columna y "Revision tecnica" sale con simbolos.
 */
export function exportarGastosACsv(parametros: ParametrosGastos): {
  nombreArchivo: string;
  base64: string;
} {
  const escapar = (valor: unknown): string => {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };

  const lineas = [ENCABEZADOS_GASTOS, ...filasDeGastos(parametros.lineas)]
    .map((fila) => fila.map(escapar).join(';'))
    .join('\r\n');

  return {
    nombreArchivo: `gastos-flota-${new Date().toISOString().slice(0, 10)}.csv`,
    base64: Buffer.from(`\ufeff${lineas}`, 'utf8').toString('base64'),
  };
}

// -----------------------------------------------------------------------------
// La lista de envio de una tanda de WhatsApp
// -----------------------------------------------------------------------------

/**
 * La tanda en Excel, para que quien manda los mensajes trabaje de arriba a
 * abajo sin volver a la pantalla.
 *
 * El telefono sale como TEXTO, no como numero: 88887777 puesto como numero se
 * ve bien, pero un fijo como 24431234 pierde nada y 06... perderia el cero.
 * Mas importante: Excel convierte en notacion cientifica cualquier cosa que
 * parezca grande, y un telefono roto es un mensaje que no sale.
 *
 * La columna del enlace de WhatsApp va de ultima y es la que se usa: se hace
 * clic y abre la conversacion con el texto escrito. El mensaje tambien va
 * aparte, para quien prefiera copiarlo.
 */
export function exportarTandaAExcel(parametros: {
  tanda: number;
  lineas: ReadonlyArray<{
    clave: string;
    nombre: string;
    telefono: string;
    direccionActual: string;
    enlace: string;
    mensaje: string;
    enlaceWhatsApp: string;
  }>;
}): { nombreArchivo: string; base64: string } {
  const libro = XLSX.utils.book_new();

  const instrucciones: unknown[][] = [
    [`Control Express - Tanda ${parametros.tanda} de pedidos de ubicacion`],
    ['Generado', formatearFechaHora(new Date())],
    ['Mensajes en esta tanda', parametros.lineas.length],
    [],
    ['COMO SE MANDA'],
    ['1', 'Abra WhatsApp en el telefono o en la computadora, con el numero de la pizzeria.'],
    ['2', 'En la hoja "Mensajes", haga clic en el enlace de la ultima columna.'],
    ['3', 'WhatsApp abre la conversacion con el texto ya escrito. Revise y mande.'],
    ['4', 'Cuando termine la tanda, vuelva a la pantalla y marquela como enviada.'],
    [],
    ['LO QUE NO HAY QUE HACER'],
    ['', 'No mandar mas de una tanda por dia: Meta bloquea el numero por mensajes masivos.'],
    ['', 'No cambiar el texto para que parezca mas urgente. Un cliente molesto bloquea el numero.'],
    ['', 'No insistirle a quien no contesto: la siguiente tanda ya lo vuelve a incluir si hace falta.'],
  ];
  const hojaInstrucciones = XLSX.utils.aoa_to_sheet(instrucciones);
  hojaInstrucciones['!cols'] = [{ wch: 6 }, { wch: 92 }];
  XLSX.utils.book_append_sheet(libro, hojaInstrucciones, 'Como se manda');

  const mensajes = parametros.lineas.map((l, i) => ({
    '#': i + 1,
    Clave: l.clave,
    Cliente: l.nombre,
    Telefono: l.telefono,
    'Direccion que tenemos': l.direccionActual,
    Mensaje: l.mensaje,
    'Abrir WhatsApp': l.enlaceWhatsApp,
  }));
  const hoja = XLSX.utils.json_to_sheet(mensajes);
  hoja['!cols'] = [
    { wch: 5 },
    { wch: 12 },
    { wch: 34 },
    { wch: 12 },
    { wch: 50 },
    { wch: 60 },
    { wch: 44 },
  ];
  if (mensajes.length > 0) hoja['!autofilter'] = { ref: hoja['!ref'] as string };
  // El telefono como texto, para que Excel no lo redondee ni lo recorte.
  for (let fila = 2; fila <= mensajes.length + 1; fila += 1) {
    const celda = hoja[`D${fila}`];
    if (celda) celda.t = 's';
  }
  XLSX.utils.book_append_sheet(libro, hoja, 'Mensajes');

  return {
    nombreArchivo: `tanda-${String(parametros.tanda).padStart(3, '0')}-ubicaciones.xlsx`,
    base64: XLSX.write(libro, { type: 'base64', bookType: 'xlsx' }) as string,
  };
}
