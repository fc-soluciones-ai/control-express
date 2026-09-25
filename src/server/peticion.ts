/**
 * Datos de la peticion actual, cuando los hay.
 *
 * Los servicios corren tanto dentro del servidor de Next como desde los
 * scripts de terminal. next/headers solo existe en el primero, asi que se
 * carga a proposito en caliente y, si no esta, se devuelve null en vez de
 * romper el script.
 */

/** Direccion de quien hizo la peticion, o null fuera del servidor web. */
export async function ipDeLaPeticion(): Promise<string | null> {
  try {
    const { headers } = await import('next/headers');
    const cabeceras = headers();
    // Vercel y cualquier proxy ponen la del visitante primero en la lista.
    const reenviada = cabeceras.get('x-forwarded-for');
    const ip = reenviada?.split(',')[0]?.trim() || cabeceras.get('x-real-ip');
    return ip || null;
  } catch {
    return null;
  }
}
