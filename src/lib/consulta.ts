/**
 * Los filtros viven en la direccion, no en el estado del componente.
 *
 * Asi una busqueda se puede compartir, guardar en favoritos o recargar sin
 * perderla, y el boton Atras del navegador deshace el ultimo filtro en vez de
 * sacar de la pantalla. Aqui estan las dos operaciones que hacen falta para
 * mantener esa direccion ordenada.
 */

/** Arma la direccion con los cambios aplicados; el valor vacio quita el filtro. */
export function conParametros(
  ruta: string,
  actuales: URLSearchParams | string,
  cambios: Record<string, string | number | null | undefined>,
): string {
  const nuevos = new URLSearchParams(actuales.toString());
  for (const [clave, valor] of Object.entries(cambios)) {
    const texto = valor === null || valor === undefined ? '' : String(valor).trim();
    if (texto === '') nuevos.delete(clave);
    else nuevos.set(clave, texto);
  }
  // Cualquier cambio de filtro vuelve a la primera pagina: quedarse en la
  // cuatro con un filtro nuevo muestra una tabla vacia que parece un error.
  if (!('pagina' in cambios)) nuevos.delete('pagina');
  const cadena = nuevos.toString();
  return cadena ? `${ruta}?${cadena}` : ruta;
}

/** Numero de pagina valido (1 en adelante). */
export function paginaDe(valor: string | undefined): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export const TAMANOS_DE_PAGINA = [10, 25, 50] as const;

export function tamanoDePagina(valor: string | undefined, porDefecto = 25): number {
  const n = Number(valor);
  return (TAMANOS_DE_PAGINA as ReadonlyArray<number>).includes(n) ? n : porDefecto;
}

/**
 * Normaliza un texto para buscar: sin mayusculas y sin tildes.
 *
 * "DAVID-R" tiene que aparecer buscando "david", y "Fredón" buscando "fredon".
 * Quien escribe con una mano mientras cuenta billetes con la otra no va a
 * poner la tilde.
 */
export function paraBuscar(texto: string): string {
  return (
    texto
      .normalize('NFD')
      // El rango va escapado a proposito: son los acentos ya separados de su
      // letra, y escritos tal cual quedan invisibles en el editor.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
  );
}
