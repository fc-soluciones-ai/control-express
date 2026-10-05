/**
 * Normalizacion de texto para comparar y cruzar.
 *
 * Vivia dentro del lector del Excel de ventas. Cuando ese modulo se quito, la
 * funcion se quedo: la usan los repartidores para cruzar nombres y el padron
 * para reconocer a quien ya existe.
 */

/**
 * Nombre sin acentos, en mayusculas y con los espacios colapsados.
 *
 * "José  Pérez" y "JOSE PEREZ" son la misma persona escrita por dos manos
 * distintas. Lo que se guarda en la base no cambia; esto es solo para comparar.
 */
export function normalizarNombre(valor: unknown): string {
  return (
    String(valor ?? '')
      .normalize('NFD')
      // El rango va escapado a proposito: son los acentos ya separados de su
      // letra, y escritos tal cual quedan invisibles en el editor.
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim()
  );
}
