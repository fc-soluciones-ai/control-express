/**
 * La gasolina del repartidor, leida de las fotos.
 *
 * POR QUE
 *
 * Cuando el repartidor tecleaba el kilometraje y el monto, esos numeros eran
 * los que el quisiera: nadie los comparaba con el odometro ni con la factura.
 * Ahora toma dos fotos, el servidor se las pasa a la IA (Gemini o Claude) y
 * guarda lo que ella leyo. El repartidor ve el resultado pero no lo puede cambiar.
 *
 * COMO SE CIERRA LA PUERTA
 *
 *  1. Leer una foto guarda una LecturaFoto con los bytes y lo leido.
 *  2. Registrar la gasolina recibe SOLO los ids de dos lecturas. Los numeros
 *     se sacan de la base, nunca de lo que mande la pantalla.
 *  3. Cada lectura sirve una sola vez, y es del repartidor que la tomo.
 *  4. La misma foto (por su huella) o la misma factura (por numero, o por
 *     bomba + fecha + monto) no se aceptan dos veces.
 *  5. La factura tiene que ser de hoy o de los ultimos dias, y el odometro no
 *     puede retroceder ni dar un salto que no se puede haber rodado.
 *
 * Lo que NO se puede evitar desde aqui: que alguien fotografie una factura
 * ajena que nunca se registro. Para eso queda la foto en la evidencia del
 * gasto, a la vista de la caja, y la observacion de la IA si algo le parecio
 * raro.
 */

import { createHash } from 'node:crypto';

import { prisma } from '@/lib/db/prisma';
import { ErrorNegocio } from '@/server/errores';
import { agregarEvidencia, tipoMimeSegunContenido } from '@/server/services/evidencia';
import { registrarMantenimiento } from '@/server/services/mantenimiento';

export type TipoLectura = 'ODOMETRO' | 'FACTURA';

/** 3 MB, igual que la evidencia: la foto termina alli. */
const MAXIMO_BYTES = 3 * 1024 * 1024;

/** Una lectura vieja ya no describe el momento de la carga. */
const VIGENCIA_LECTURA_MS = 2 * 60 * 60 * 1000;

/** Hasta cuantos dias atras se acepta la fecha de la factura. */
export const DIAS_MAXIMOS_FACTURA = 3;

/**
 * Cuanto puede avanzar el odometro entre dos registros. Una moto de reparto
 * rueda unos 150 km al dia; mas de esto es casi seguro un digito mal leido.
 * Si de verdad rodo eso, la caja lo registra a mano.
 */
export const SALTO_MAXIMO_KM = 2500;

/** Tope de fotos por hora por repartidor: cada lectura cuesta dinero. */
const LECTURAS_POR_HORA = 30;

/** Lo que devuelve el lector, antes de validarlo. */
export interface LecturaCruda {
  legible: boolean;
  motivo?: string | null;
  kilometraje?: number | null;
  totalColones?: number | null;
  fecha?: string | null;
  gasolinera?: string | null;
  numeroFactura?: string | null;
  litros?: number | null;
  observacion?: string | null;
}

export type Lector = (
  foto: { contenido: Buffer; tipoMime: string },
  tipo: TipoLectura,
) => Promise<{ lectura: LecturaCruda; modelo: string }>;

// ---------------------------------------------------------------------------
// Los lectores de verdad: Gemini (Google) o Claude (Anthropic)
// ---------------------------------------------------------------------------
//
// Se usa Gemini si esta su clave, y si no Claude. IA_MODELO cambia el modelo
// del que se este usando.

const MODELO_ANTHROPIC = 'claude-sonnet-5';
/** Alias que Google mueve al Flash mas reciente: no hay que tocarlo al retirarse uno. */
const MODELO_GEMINI = 'gemini-flash-latest';

const INSTRUCCIONES: Record<TipoLectura, string> = {
  ODOMETRO:
    'La foto deberia mostrar el tablero de una motocicleta. Lea el ODOMETRO TOTAL ' +
    '(ODO), en kilometros enteros, sin decimales. NO use el parcial (TRIP), la ' +
    'velocidad ni la hora. Si el numero no se lee con certeza, o la foto no es de ' +
    'un tablero, marque legible=false y explique por que en pocas palabras. ' +
    'Si parece una foto tomada a otra pantalla o a otra foto, digalo en observacion.',
  FACTURA:
    'La foto deberia mostrar la factura o tiquete de una gasolinera de Costa Rica, ' +
    'en colones. Extraiga: el TOTAL pagado en colones (el monto final, no el ' +
    'subtotal ni el impuesto), la fecha de emision en formato AAAA-MM-DD, el nombre ' +
    'de la gasolinera o estacion de servicio, el numero de la factura (el ' +
    'consecutivo o la clave numerica) y los litros si aparecen. Si el total o la ' +
    'fecha no se leen con certeza, o no es una factura de combustible, marque ' +
    'legible=false y explique por que. Si parece una foto de una pantalla, una ' +
    'fotocopia o una factura alterada, digalo en observacion.',
};

const ESQUEMA: Record<TipoLectura, object> = {
  ODOMETRO: {
    type: 'object',
    properties: {
      legible: { type: 'boolean' },
      motivo: {
        type: ['string', 'null'],
        description: 'Por que no se pudo leer.',
      },
      kilometraje: { type: ['integer', 'null'] },
      observacion: { type: ['string', 'null'] },
    },
    required: ['legible', 'kilometraje'],
  },
  FACTURA: {
    type: 'object',
    properties: {
      legible: { type: 'boolean' },
      motivo: { type: ['string', 'null'] },
      totalColones: { type: ['number', 'null'] },
      fecha: { type: ['string', 'null'], description: 'AAAA-MM-DD' },
      gasolinera: { type: ['string', 'null'] },
      numeroFactura: { type: ['string', 'null'] },
      litros: { type: ['number', 'null'] },
      observacion: { type: ['string', 'null'] },
    },
    required: ['legible', 'totalColones', 'fecha', 'gasolinera'],
  },
};

/**
 * El mismo esquema en el formato de Gemini: tipos en mayusculas y "nullable"
 * en lugar de la lista de tipos.
 */
function esquemaGemini(esquema: object): object {
  const { type, properties, required } = esquema as {
    type: string;
    properties: Record<string, { type: string | string[]; description?: string }>;
    required: string[];
  };
  return {
    type: type.toUpperCase(),
    required,
    properties: Object.fromEntries(
      Object.entries(properties).map(([nombre, campo]) => {
        const tipos = Array.isArray(campo.type) ? campo.type : [campo.type];
        const tipo = tipos.find((t) => t !== 'null') ?? 'string';
        return [
          nombre,
          {
            type: tipo.toUpperCase(),
            nullable: tipos.includes('null'),
            ...(campo.description ? { description: campo.description } : {}),
          },
        ];
      }),
    ),
  };
}

export function iaConfigurada(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

const SIN_CONFIGURAR = 'La lectura de fotos todavia no esta configurada. Avise a la caja.';

async function pedir(url: string, init: RequestInit): Promise<Response> {
  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e) {
    console.error('[lectura-ia] sin respuesta', e instanceof Error ? e.name : e);
    throw new ErrorNegocio(
      'IA_NO_DISPONIBLE',
      'No se pudo leer la foto ahora mismo. Revise la senal e intente de nuevo.',
    );
  }
  if (!respuesta.ok) {
    // Solo el estado: el cuerpo puede repetir partes de la peticion.
    console.error('[lectura-ia] estado', respuesta.status);
    throw new ErrorNegocio(
      'IA_NO_DISPONIBLE',
      [400, 401, 403].includes(respuesta.status)
        ? 'La lectura de fotos esta mal configurada. Avise a la caja.'
        : 'No se pudo leer la foto ahora mismo. Intente de nuevo en un momento.',
    );
  }
  return respuesta;
}

export const lectorGemini: Lector = async (foto, tipo) => {
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) throw new ErrorNegocio('IA_NO_DISPONIBLE', SIN_CONFIGURAR);
  const modelo = process.env.IA_MODELO || MODELO_GEMINI;

  const respuesta = await pedir(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`,
    {
      method: 'POST',
      // La clave va en la cabecera, no en la direccion: las direcciones
      // quedan en las bitacoras.
      headers: { 'x-goog-api-key': clave, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                inline_data: {
                  mime_type: foto.tipoMime,
                  data: foto.contenido.toString('base64'),
                },
              },
              { text: INSTRUCCIONES[tipo] },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: esquemaGemini(ESQUEMA[tipo]),
        },
      }),
    },
  );

  const cuerpo = (await respuesta.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const texto = cuerpo.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  try {
    return { lectura: JSON.parse(texto) as LecturaCruda, modelo };
  } catch {
    return {
      lectura: { legible: false, motivo: 'No se obtuvo respuesta.' },
      modelo,
    };
  }
};

export const lectorAnthropic: Lector = async (foto, tipo) => {
  const clave = process.env.ANTHROPIC_API_KEY;
  if (!clave) throw new ErrorNegocio('IA_NO_DISPONIBLE', SIN_CONFIGURAR);
  const modelo = process.env.IA_MODELO || MODELO_ANTHROPIC;

  const respuesta = await pedir('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': clave,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 1024,
      tools: [
        {
          name: 'registrar_lectura',
          description: 'Registra lo que se leyo en la foto.',
          input_schema: ESQUEMA[tipo],
        },
      ],
      tool_choice: { type: 'tool', name: 'registrar_lectura' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: foto.tipoMime,
                data: foto.contenido.toString('base64'),
              },
            },
            { type: 'text', text: INSTRUCCIONES[tipo] },
          ],
        },
      ],
    }),
  });

  const cuerpo = (await respuesta.json()) as {
    content?: Array<{ type: string; input?: LecturaCruda }>;
  };
  const uso = cuerpo.content?.find((c) => c.type === 'tool_use');
  if (!uso?.input) {
    return {
      lectura: { legible: false, motivo: 'No se obtuvo respuesta.' },
      modelo,
    };
  }
  return { lectura: uso.input, modelo };
};

/** Gemini si tiene clave; si no, Claude. */
export const lectorPorDefecto: Lector = (foto, tipo) =>
  process.env.GEMINI_API_KEY ? lectorGemini(foto, tipo) : lectorAnthropic(foto, tipo);

// ---------------------------------------------------------------------------
// Leer una foto
// ---------------------------------------------------------------------------

export interface LecturaParaPantalla {
  id: string;
  tipo: TipoLectura;
  legible: boolean;
  motivo: string | null;
  kilometraje: number | null;
  monto: number | null;
  fechaFactura: string | null;
  gasolinera: string | null;
  numeroFactura: string | null;
  litros: number | null;
  observacion: string | null;
}

function texto(valor: unknown, largo: number): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.replace(/\s+/g, ' ').trim();
  return limpio ? limpio.slice(0, largo) : null;
}

/** AAAA-MM-DD como mediodia en Costa Rica, para no correrse de dia. */
export function fechaDeFactura(valor: unknown): Date | null {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const fecha = new Date(`${valor}T12:00:00-06:00`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Deja la lectura en valores que la base acepta, o la marca ilegible. */
function normalizar(tipo: TipoLectura, cruda: LecturaCruda) {
  const base = {
    motivo: texto(cruda.motivo, 200),
    observacion: texto(cruda.observacion, 300),
    kilometraje: null as number | null,
    monto: null as number | null,
    fechaFactura: null as Date | null,
    gasolinera: null as string | null,
    numeroFactura: null as string | null,
    litros: null as number | null,
  };

  if (!cruda.legible) {
    return {
      ...base,
      legible: false,
      motivo: base.motivo ?? 'No se pudo leer.',
    };
  }

  if (tipo === 'ODOMETRO') {
    const km = Number(cruda.kilometraje);
    if (!Number.isInteger(km) || km <= 0 || km > 999_999) {
      return {
        ...base,
        legible: false,
        motivo: 'No se distingue el kilometraje.',
      };
    }
    return { ...base, legible: true, kilometraje: km };
  }

  const total = Number(cruda.totalColones);
  const fecha = fechaDeFactura(cruda.fecha);
  if (!Number.isFinite(total) || total <= 0 || total > 1_000_000) {
    return {
      ...base,
      legible: false,
      motivo: 'No se distingue el total de la factura.',
    };
  }
  if (!fecha) {
    return {
      ...base,
      legible: false,
      motivo: 'No se distingue la fecha de la factura.',
    };
  }
  const litros = Number(cruda.litros);
  return {
    ...base,
    legible: true,
    // Colones a centimos: el colon tiene dos decimales en ISO 4217.
    monto: Math.round(total * 100),
    fechaFactura: fecha,
    gasolinera: texto(cruda.gasolinera, 120),
    numeroFactura: texto(cruda.numeroFactura, 60)?.replace(/\s/g, '') ?? null,
    litros: Number.isFinite(litros) && litros > 0 ? Math.round(litros * 1000) / 1000 : null,
  };
}

function paraPantalla(fila: {
  id: string;
  tipo: string;
  legible: boolean;
  motivo: string | null;
  kilometraje: number | null;
  monto: number | null;
  fechaFactura: Date | null;
  gasolinera: string | null;
  numeroFactura: string | null;
  litros: number | null;
  observacion: string | null;
}): LecturaParaPantalla {
  return {
    ...fila,
    tipo: fila.tipo as TipoLectura,
    fechaFactura: fila.fechaFactura
      ? fila.fechaFactura.toLocaleDateString('es-CR', {
          timeZone: 'America/Costa_Rica',
        })
      : null,
  };
}

async function motoDe(choferId: string): Promise<{ placa: string; kilometrajeActual: number }> {
  const asignacion = await prisma.asignacionMoto.findFirst({
    where: { choferId, fechaFin: null },
    select: { moto: { select: { placa: true, kilometrajeActual: true } } },
  });
  if (!asignacion) {
    throw new ErrorNegocio(
      'DATOS_INVALIDOS',
      'Hoy no tiene ninguna moto asignada, asi que no hay a cual cargarle la gasolina.',
    );
  }
  return asignacion.moto;
}

export async function leerFoto(
  entrada: { choferId: string; tipo: TipoLectura; contenido: Buffer },
  lector: Lector = lectorPorDefecto,
): Promise<LecturaParaPantalla> {
  if (entrada.tipo !== 'ODOMETRO' && entrada.tipo !== 'FACTURA') {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'No se sabe que muestra esa foto.');
  }
  if (entrada.contenido.length === 0) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'La foto llego vacia.');
  }
  if (entrada.contenido.length > MAXIMO_BYTES) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'La foto pesa demasiado. Tomela de nuevo.');
  }
  const tipoMime = tipoMimeSegunContenido(entrada.contenido);
  const moto = await motoDe(entrada.choferId);

  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000);
  const recientes = await prisma.lecturaFoto.count({
    where: { choferId: entrada.choferId, creadaEn: { gte: haceUnaHora } },
  });
  if (recientes >= LECTURAS_POR_HORA) {
    throw new ErrorNegocio(
      'DATOS_INVALIDOS',
      'Demasiadas fotos en la ultima hora. Espere un rato o avise a la caja.',
    );
  }

  // De paso se sueltan los bytes de las fotos que nadie llego a usar.
  await limpiarLecturasVencidas();

  const huella = createHash('sha256').update(entrada.contenido).digest('hex');
  const yaUsada = await prisma.lecturaFoto.findFirst({
    where: { huella, gastoId: { not: null } },
    select: { id: true },
  });
  if (yaUsada) {
    throw new ErrorNegocio(
      'FACTURA_REPETIDA',
      'Esa foto ya se uso en otro registro. Tome una nueva.',
    );
  }

  const { lectura, modelo } = await lector(
    { contenido: entrada.contenido, tipoMime },
    entrada.tipo,
  );
  const valores = normalizar(entrada.tipo, lectura);

  const fila = await prisma.lecturaFoto.create({
    data: {
      choferId: entrada.choferId,
      placa: moto.placa,
      tipo: entrada.tipo,
      contenido: entrada.contenido,
      tipoMime,
      huella,
      modelo,
      ...valores,
    },
  });

  return paraPantalla(fila);
}

// ---------------------------------------------------------------------------
// Registrar la gasolina con dos lecturas
// ---------------------------------------------------------------------------

async function tomarLectura(id: string, choferId: string, tipo: TipoLectura, clave: string) {
  const fila = await prisma.lecturaFoto.findUnique({ where: { id } });
  if (!fila || fila.choferId !== choferId || fila.tipo !== tipo) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Vuelva a tomar las fotos.');
  }
  if (!fila.legible) {
    throw new ErrorNegocio('FOTO_ILEGIBLE', 'Una de las fotos no se pudo leer. Tomela de nuevo.');
  }
  if (fila.usadaEn && fila.claveUso !== clave) {
    throw new ErrorNegocio(
      'FACTURA_REPETIDA',
      'Esa foto ya se uso en otro registro. Tome una nueva.',
    );
  }
  if (!fila.usadaEn && Date.now() - fila.creadaEn.getTime() > VIGENCIA_LECTURA_MS) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Las fotos son de hace rato. Tomelas de nuevo.');
  }
  return fila;
}

/** Reserva la lectura para esta clave. Falla si otro envio la gano. */
async function reservar(id: string, clave: string): Promise<void> {
  const { count } = await prisma.lecturaFoto.updateMany({
    where: { id, usadaEn: null },
    data: { usadaEn: new Date(), claveUso: clave },
  });
  if (count === 1) return;
  const fila = await prisma.lecturaFoto.findUnique({
    where: { id },
    select: { claveUso: true },
  });
  if (fila?.claveUso !== clave) {
    throw new ErrorNegocio(
      'FACTURA_REPETIDA',
      'Esa foto ya se uso en otro registro. Tome una nueva.',
    );
  }
}

async function liberar(ids: string[], clave: string): Promise<void> {
  await prisma.lecturaFoto.updateMany({
    where: { id: { in: ids }, claveUso: clave, gastoId: null },
    data: { usadaEn: null, claveUso: null },
  });
}

export async function registrarGasolinaLeida(entrada: {
  choferId: string;
  lecturaOdometroId: string;
  lecturaFacturaId: string;
  claveIdempotencia: string;
  ahora?: Date;
}): Promise<{
  id: string;
  placa: string;
  kilometraje: number;
  monto: number;
  repetido: boolean;
}> {
  const clave = entrada.claveIdempotencia;
  if (!clave) throw new ErrorNegocio('DATOS_INVALIDOS', 'Falta la clave del envio.');
  const ahora = entrada.ahora ?? new Date();

  const odometro = await tomarLectura(
    entrada.lecturaOdometroId,
    entrada.choferId,
    'ODOMETRO',
    clave,
  );
  const factura = await tomarLectura(entrada.lecturaFacturaId, entrada.choferId, 'FACTURA', clave);
  const km = odometro.kilometraje!;
  const monto = factura.monto!;
  const fecha = factura.fechaFactura!;

  const moto = await motoDe(entrada.choferId);
  if (odometro.placa !== moto.placa || factura.placa !== moto.placa) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Las fotos son de otra moto. Tomelas de nuevo.');
  }

  const yaRegistrado = odometro.gastoId ?? factura.gastoId;
  if (!yaRegistrado) {
    const dias = (ahora.getTime() - fecha.getTime()) / 86_400_000;
    if (dias < -1) {
      throw new ErrorNegocio(
        'DATOS_INVALIDOS',
        'La factura tiene una fecha futura. Revise la foto.',
      );
    }
    if (dias > DIAS_MAXIMOS_FACTURA + 0.5) {
      throw new ErrorNegocio(
        'DATOS_INVALIDOS',
        `La factura es de hace mas de ${DIAS_MAXIMOS_FACTURA} dias. Esa la registra la caja.`,
      );
    }
    if (km - moto.kilometrajeActual > SALTO_MAXIMO_KM) {
      throw new ErrorNegocio(
        'DATOS_INVALIDOS',
        `Se leyo ${km.toLocaleString('es-CR')} km y la moto marcaba ` +
          `${moto.kilometrajeActual.toLocaleString('es-CR')}. Tome otra foto del odometro, mas de cerca.`,
      );
    }

    // La misma factura, con otra foto.
    const repetida = await prisma.registroMantenimiento.findFirst({
      where: {
        categoria: 'GASOLINA',
        OR: [
          ...(factura.numeroFactura ? [{ numeroFactura: factura.numeroFactura }] : []),
          {
            fechaFactura: fecha,
            costoTotal: monto,
            tallerOProveedor: factura.gasolinera,
          },
        ],
      },
      select: { id: true },
    });
    if (repetida) {
      throw new ErrorNegocio('FACTURA_REPETIDA', 'Esa factura ya estaba registrada.');
    }
  }

  const ids = [odometro.id, factura.id];
  await reservar(odometro.id, clave);
  try {
    await reservar(factura.id, clave);
  } catch (e) {
    await liberar([odometro.id], clave);
    throw e;
  }

  let gasto;
  try {
    gasto = await registrarMantenimiento({
      placa: moto.placa,
      tipo: 'PREVENTIVO',
      categoria: 'GASOLINA',
      costoTotal: monto,
      kilometrajeEvento: km,
      tallerOProveedor: factura.gasolinera ?? undefined,
      choferId: entrada.choferId,
      claveIdempotencia: clave,
      origen: 'IA',
      fechaFactura: fecha,
      numeroFactura: factura.numeroFactura ?? undefined,
      descripcion: factura.litros ? `${factura.litros} litros` : undefined,
    });
  } catch (e) {
    await liberar(ids, clave);
    throw e;
  }

  // Las fotos pasan a la evidencia del gasto. Si esto se corta a medias, el
  // reintento con la misma clave termina lo que falte.
  for (const [fila, tipoFoto] of [
    [odometro, 'ODOMETRO'],
    [factura, 'FACTURA'],
  ] as const) {
    const actual = await prisma.lecturaFoto.findUnique({
      where: { id: fila.id },
      select: { contenido: true, gastoId: true },
    });
    if (actual?.gastoId || !actual?.contenido) continue;
    await agregarEvidencia(
      {
        entidadTipo: 'GASTO',
        entidadId: gasto.id,
        tipo: tipoFoto,
        contenido: Buffer.from(actual.contenido),
        descripcion: 'Leida por IA',
      },
      { choferId: entrada.choferId },
    );
    await prisma.lecturaFoto.update({
      where: { id: fila.id },
      data: { gastoId: gasto.id, contenido: null },
    });
  }

  return {
    id: gasto.id,
    placa: gasto.placa,
    kilometraje: gasto.kilometrajeActualizado,
    monto,
    repetido: gasto.repetido,
  };
}

/** Las lecturas que nunca se usaron pierden los bytes al vencer. */
export async function limpiarLecturasVencidas(ahora = new Date()): Promise<number> {
  const { count } = await prisma.lecturaFoto.updateMany({
    where: {
      usadaEn: null,
      contenido: { not: null },
      creadaEn: { lt: new Date(ahora.getTime() - VIGENCIA_LECTURA_MS) },
    },
    data: { contenido: null },
  });
  return count;
}
