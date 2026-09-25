'use client';

/**
 * Aviso de cambios sin guardar.
 *
 * Una ficha de moto son veinte campos, y la de un repartidor lleva foto. Con
 * el dedo, la equis de cerrar queda a un centimetro del campo de arriba: sin
 * este aviso, un roce borra diez minutos de trabajo sin decir nada.
 *
 * Cubre las dos salidas posibles:
 *   - cerrar o recargar la pestana, que solo el navegador puede frenar, y lo
 *     hace con su propio dialogo (no se puede cambiar ese texto);
 *   - cerrar el formulario desde la pantalla, que se frena aqui con una
 *     pregunta en el idioma del negocio.
 */

import { useCallback, useEffect } from 'react';

const PREGUNTA = 'Tiene cambios sin guardar. ¿Salir y perderlos?';

/**
 * Devuelve un guardian: envuelva con el la accion de cerrar o cancelar.
 *
 *   const confirmarSalida = useAvisoSinGuardar(hayCambios);
 *   <button onClick={() => confirmarSalida(alCerrar)}>Cancelar</button>
 */
export function useAvisoSinGuardar(hayCambios: boolean): (salir: () => void) => void {
  useEffect(() => {
    if (!hayCambios) return;
    const alSalir = (e: BeforeUnloadEvent) => {
      // La unica forma de que el navegador muestre su dialogo.
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, [hayCambios]);

  return useCallback(
    (salir: () => void) => {
      if (!hayCambios || window.confirm(PREGUNTA)) salir();
    },
    [hayCambios],
  );
}
