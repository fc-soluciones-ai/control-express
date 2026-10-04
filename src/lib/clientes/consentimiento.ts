/**
 * El permiso que da el cliente al mandar su ubicacion.
 *
 * Vive en una constante, y no en el texto de la pantalla, porque lo que se
 * guarda en la base tiene que ser lo que el cliente tuvo a la vista. Si el
 * texto viniera del navegador, cualquiera podria mandar un permiso distinto
 * del que leyo, y el registro no probaria nada.
 *
 * Cambiar esta redaccion es cambiar lo que se les prometio a los clientes que
 * ya respondieron. Si hace falta cambiarla, se agrega una version nueva y las
 * respuestas viejas conservan la que firmaron.
 */

export const VERSION_CONSENTIMIENTO = 1;

export const TEXTO_CONSENTIMIENTO =
  'Comparto mi ubicacion con la pizzeria para que me lleguen los pedidos a domicilio. ' +
  'Entiendo que se usa solo para las entregas, que no se comparte con nadie mas, ' +
  'y que puedo pedir que la borren cuando quiera.';
