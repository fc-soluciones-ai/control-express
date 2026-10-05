/**
 * Validacion de entrada de los servicios.
 *
 * Esto era casi todo de la caja: abonos, anulaciones, cierres, arqueos y la
 * carga del Excel. Al salir lo contable queda el alta de repartidores, que es
 * lo unico que una persona sigue escribiendo a mano en un formulario.
 *
 * LA REGLA DEL DINERO SIGUE EN PIE
 *
 * Todo monto que entra al sistema se valida como entero en centimos. Un
 * decimal recibido desde el cliente se rechaza en vez de redondearse en
 * silencio. Hoy el unico dinero que una persona escribe son los gastos de
 * taller, que se validan en su propio modulo; el dinero de los pedidos llega
 * del POS y ya viene en centimos. Si vuelve a haber un formulario de montos,
 * el validador va aqui y no suelto en una accion.
 */

import { z } from 'zod';

import { ESTADO_CHOFER } from '@/types/enums';

export const esquemaChofer = z.object({
  idMeseroSoftRestaurant: z
    .string()
    .min(1, 'El codigo de mesero de Soft Restaurant es obligatorio.')
    .max(30),
  nombre: z.string().min(2, 'El nombre es obligatorio.').max(80),
  fotoUrl: z.string().max(300).optional(),
  telefono: z.string().max(30).optional(),
  estado: z.enum(ESTADO_CHOFER).optional(),
});
export type EntradaChofer = z.infer<typeof esquemaChofer>;
