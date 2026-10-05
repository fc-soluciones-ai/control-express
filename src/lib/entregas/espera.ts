/**
 * Cuanto lleva esperando un pedido, y de que color se pinta.
 *
 * POR QUE ESTO ES UN ARCHIVO APARTE
 *
 * El mismo semaforo aparece en tres lugares: el tablero del mostrador, la
 * pantalla del repartidor y, cuando exista, el enlace de rastreo del cliente.
 * Si cada pantalla decide sus propios cortes, un pedido sale naranja en una y
 * rojo en la otra, y nadie vuelve a creerle al tablero. Los cortes se definen
 * una sola vez, aqui, y no hay numeros de minutos escritos en ningun .tsx.
 *
 * QUE SE MIDE
 *
 * Los minutos que lleva un pedido desde que entro al POS hasta que SALE la
 * moto. El reloj arranca con la entrada y se detiene con el despacho.
 *
 * Las dos puntas se eligieron por el mismo motivo: son las unicas horas de
 * este POS en las que se puede confiar. La entrada la escribe el sistema al
 * levantar el cheque, y la salida se pone cuando el repartidor toma el
 * pedido. La de llegada, en cambio, se marca en bloque: cinco pedidos que
 * salieron a lo largo de dos horas aparecen llegando todos dentro del mismo
 * medio minuto.
 *
 * LOS CORTES
 *
 * Primero fueron 20, 35 y 55, pensados para el tiempo total hasta la casa del
 * cliente. Cuando el tablero paso a medir solo el despacho quedaron grandes:
 * un pedido que tarda 55 minutos en SALIR llega a la hora y media.
 *
 * La medicion de la semana del 4 de octubre de 2026, sobre 195 pedidos, dio un
 * promedio de 25 minutos hasta el despacho, con un maximo de 237. Con los
 * cortes viejos, el pedido promedio salia naranja y el naranja dejaba de
 * significar algo. Asi que el dueno los bajo a 12, 20 y 30: ahora el promedio
 * de hoy cae en rojo, que es exactamente lo que hay que ver para poder
 * bajarlo.
 *
 * El limite de cada tramo es inclusivo. Un pedido no puede estar de dos
 * colores a la vez, y cuando hay empate conviene que caiga del lado que avisa.
 */

/** Minuto en que termina cada tramo. El ultimo no tiene techo. */
export const CORTE_VERDE = 12;
export const CORTE_NARANJA = 20;
export const CORTE_ROJO = 30;

export const TRAMOS_DE_ESPERA = ['VERDE', 'NARANJA', 'ROJO', 'CRITICO', 'SIN_DATO'] as const;
export type TramoDeEspera = (typeof TRAMOS_DE_ESPERA)[number];

/** Como se le dice a cada tramo en pantalla, para no repetir los numeros. */
export const ETIQUETA_TRAMO: Record<TramoDeEspera, string> = {
  VERDE: `hasta ${CORTE_VERDE} min`,
  NARANJA: `${CORTE_VERDE + 1} a ${CORTE_NARANJA} min`,
  ROJO: `${CORTE_NARANJA + 1} a ${CORTE_ROJO} min`,
  CRITICO: `mas de ${CORTE_ROJO} min`,
  SIN_DATO: 'sin hora',
};

/**
 * Minutos enteros transcurridos, redondeados hacia abajo.
 *
 * Hacia abajo y no al mas cercano: a los 12 minutos y 40 segundos el tablero
 * dice 12 y pinta verde. Redondeando al mas cercano diria 13 y saltaria a
 * naranja antes de que el minuto 13 exista, y quien mira el reloj de la pared
 * no entenderia por que.
 *
 * Devuelve null cuando no hay fecha, y nunca un negativo: un pedido con hora
 * futura (el reloj del servidor del POS adelantado) cuenta como recien
 * entrado, no como entregado hace rato.
 */
export function minutosDesde(fecha: Date | string | null, ahora: Date = new Date()): number | null {
  if (!fecha) return null;
  const inicio = fecha instanceof Date ? fecha : new Date(fecha);
  const ms = inicio.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((ahora.getTime() - ms) / 60_000));
}

/** En que tramo cae una espera. */
export function tramoDeEspera(minutos: number | null): TramoDeEspera {
  if (minutos === null) return 'SIN_DATO';
  if (minutos <= CORTE_VERDE) return 'VERDE';
  if (minutos <= CORTE_NARANJA) return 'NARANJA';
  if (minutos <= CORTE_ROJO) return 'ROJO';
  return 'CRITICO';
}

export interface ColorDeEspera {
  tramo: TramoDeEspera;
  /** Clases de Tailwind. Van completas y literales: Tailwind no lee cadenas armadas. */
  fondo: string;
  borde: string;
  texto: string;
  /**
   * Para las etiquetas y la letra chica de la tarjeta.
   *
   * No es un detalle de gusto: en el tramo critico el fondo va relleno de
   * rojo, y el gris de las etiquetas queda ilegible encima. Se probo en
   * pantalla y no se leia a dos metros, que es la distancia a la que se mira
   * el monitor del mostrador.
   */
  secundario: string;
  /** Solo el tramo critico parpadea. */
  parpadea: boolean;
}

const COLORES: Record<TramoDeEspera, Omit<ColorDeEspera, 'tramo'>> = {
  VERDE: {
    secundario: 'text-slate-400',
    fondo: 'bg-entrada/10',
    borde: 'border-entrada/40',
    texto: 'text-entrada',
    parpadea: false,
  },
  NARANJA: {
    secundario: 'text-slate-400',
    fondo: 'bg-aviso/15',
    borde: 'border-aviso/50',
    texto: 'text-aviso',
    parpadea: false,
  },
  ROJO: {
    secundario: 'text-slate-400',
    fondo: 'bg-alerta/20',
    borde: 'border-alerta/70',
    texto: 'text-alerta',
    parpadea: false,
  },
  // El critico no es el rojo con mas opacidad: es el rojo relleno y con letra
  // clara. A dos metros de un monitor de mostrador, un borde mas fuerte no se
  // distingue; un bloque de color si.
  CRITICO: {
    secundario: 'text-rose-100',
    fondo: 'bg-critico/90',
    borde: 'border-critico',
    texto: 'text-white',
    parpadea: true,
  },
  SIN_DATO: {
    secundario: 'text-slate-500',
    fondo: 'bg-panelClaro',
    borde: 'border-borde',
    texto: 'text-slate-400',
    parpadea: false,
  },
};

export function colorDeEspera(minutos: number | null): ColorDeEspera {
  const tramo = tramoDeEspera(minutos);
  return { tramo, ...COLORES[tramo] };
}

/** Cuantos pedidos hay en cada tramo, para los contadores de arriba. */
export function contarPorTramo(
  esperas: ReadonlyArray<number | null>,
): Record<TramoDeEspera, number> {
  const cuenta: Record<TramoDeEspera, number> = {
    VERDE: 0,
    NARANJA: 0,
    ROJO: 0,
    CRITICO: 0,
    SIN_DATO: 0,
  };
  for (const minutos of esperas) cuenta[tramoDeEspera(minutos)] += 1;
  return cuenta;
}
