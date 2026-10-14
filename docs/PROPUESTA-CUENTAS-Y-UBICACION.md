# Propuesta: cuentas y ubicación, como Uber Eats

Lo que pidió el dueño (14 de octubre de 2026): que el cliente **entre una vez con su
teléfono y quede adentro**, que la app **tome su ubicación sola** y le calcule el costo
del pedido sin que tenga que mandarla a mano, y que los usuarios de la app **se
reconozcan contra los clientes de la base del restaurante**.

Esto es una propuesta para decidir. No está construido.

## 1. Cómo funciona Uber Eats (y qué copiamos)

1. Al abrir la app pide permiso de ubicación **una sola vez** y la usa para todo.
2. Arriba siempre dice **"Entregar en: tu dirección"**, y se puede cambiar.
3. Sin que el cliente haga nada más, muestra el **costo de envío y el tiempo** de cada
   restaurante.
4. Para entrar, el cliente escribe su teléfono, recibe un **código** y queda con la
   sesión abierta meses.
5. Guarda varias direcciones (Casa, Trabajo) y el historial de pedidos.

Lo de hoy es distinto: la ubicación se pide **al final**, en el paso de pago, y no hay
cuenta. Eso se invierte.

## 2. La propuesta, en tres bloques

### A. La ubicación al principio

- La primera pantalla pregunta **"¿Dónde te entregamos?"** con un botón "Usar mi
  ubicación actual" y las direcciones guardadas, si hay.
- La dirección elegida queda arriba en todas las pantallas: **"📍 Entregar en: …  ▾"**.
- Con la ubicación, el envío y el tiempo se calculan **al instante** y se ven en la
  cabecera ("Envío ₡1.500 · 35–50 min"), en el carrito y en el pago. Si queda fuera de la
  zona, se avisa **antes** de armar el pedido, no al final.
- Al pagar, la dirección ya está: solo se confirma o se cambia.
- **Un mapa pequeño con un pin que se puede mover**, como Uber: el GPS del teléfono se
  equivoca unos metros y en el campo más. El cliente corrige el pin y el repartidor llega
  a la puerta. Hace falta un proveedor de mapas (ver §5).
- Si el cliente **niega el permiso**, entra igual: elige una dirección guardada o mueve el
  pin en el mapa a mano.

### B. La cuenta: teléfono y sesión que queda abierta

- **Identidad = el teléfono.** Entra con su número.
- **Código de verificación** que llega por WhatsApp o SMS (una vez por dispositivo). Con
  eso se comprueba que el número es suyo.
- **Después queda abierto**: una cookie segura de larga duración (unos 12 meses) en ese
  dispositivo. Mientras no cierre sesión, no vuelve a pedir nada.
- La cuenta guarda: nombre, **varias direcciones** con su ubicación y señas (una es la
  predeterminada), los datos de la factura electrónica y el historial.
- "Repetir mi último pedido" en un toque.

### C. El enlace con los clientes del restaurante

- Al crear la cuenta, el teléfono se busca en los **clientes del POS** (ya copiados a la
  nube: unos 13.000). Si hay **uno solo** con ese número, la cuenta se enlaza a esa ficha:
  el cliente ve su nombre y sus direcciones de siempre, y su pedido va a su ficha.
- Si **no hay**, se crea un cliente nuevo, y cuando el agente escriba el pedido en el POS,
  se crea también allá, con su dirección **y su ubicación en el mapa** (hoy ninguna de las
  12.833 direcciones del POS la tiene: cada pedido mejora tu base).
- Si el teléfono lo comparten **varias fichas**, no se adivina: se le pide confirmar su
  nombre y se enlaza solo a esa.
- **Sin duplicados:** un teléfono, una ficha.

## 3. Por qué el código de verificación

Sin código, cualquiera podría escribir el teléfono de otra persona y ver su nombre y
dirección, o hacer pedidos falsos a su nombre. Uber Eats lo resuelve con el código, y es
lo que da algo más: **un teléfono confirmado**, que es lo que necesita el repartidor
cuando llega.

**Para el piloto** se puede ir más liviano: sin código, mostrando solo el **nombre de
pila** y pidiendo que el cliente **escriba** su dirección en lugar de mostrársela. Se
agrega el código antes de abrir la app a todo el público.

## 4. Seguridad y privacidad (lo que no se negocia)

- Sesión en cookie `httpOnly`, `Secure` y `SameSite`, con un código aleatorio de 256 bits
  guardado **con hash** en la base: si alguien viera la base, no podría usarlo.
- El código de verificación caduca en 10 minutos, tiene pocos intentos y un tope de
  envíos por teléfono y por hora (también protege el costo de los mensajes).
- La respuesta nunca confirma si un teléfono "ya existe" a quien no está verificado.
- Solo se guarda lo necesario, y la persona puede borrar su cuenta.
- Un aviso corto de privacidad en la app. En Costa Rica aplica la ley de protección de
  datos personales (Ley 8968): conviene que tu abogado lo revise. Esto no es asesoría
  legal.

## 5. Lo que cuesta y lo que hay que decidir

Los costos de abajo **no están verificados**: hay que pedir precios actuales.

| Pieza | Opciones | Qué considerar |
|---|---|---|
| Enviar el código | **WhatsApp** (API de Meta) · **SMS** (un proveedor) · correo | WhatsApp es lo que la gente más usa, pero exige verificar el negocio con Meta y plantillas aprobadas (días); el número fijo de la pizzería no sirve tal cual. SMS tiene costo por mensaje. El correo es gratis pero lo usa poca gente. |
| Mapa y pin | OpenStreetMap con un proveedor de mapas, o Google Maps | Google es el más completo y cobra por uso; OpenStreetMap gratis tiene límites para uso comercial. |
| Escribir la dirección con sugerencias | Google Places u otro | Las direcciones de Costa Rica son por señas, y ningún buscador las entiende bien. Por eso el pin vale más que el texto. |

## 6. En qué orden se construye

1. **Fase 1 — Ubicación al principio** (mediana). Barra "Entregar en", envío y tiempo al
   instante, pin movible, direcciones guardadas en el dispositivo y sesión larga **sin
   código**. Es lo que más se nota en el teléfono y no depende de nadie.
2. **Fase 2 — Cuenta con teléfono verificado** (mediana). El código, la sesión por
   dispositivo, varias direcciones, el historial y "repetir pedido". **Depende de elegir
   cómo se manda el código.**
3. **Fase 3 — Enlace con el POS** (grande y delicada). Buscar la ficha por teléfono, crear
   clientes y direcciones en el POS, ubicación en el mapa. Como toca la caja, se prueba
   **primero en la copia**; escribir en la base real necesita tu permiso aparte.
4. **Fase 4 — Extras tipo Uber Eats:** favoritos, promociones, calificar el pedido.

Es **independiente** de que el pedido llegue al POS y salgan las comandas: eso sigue
siendo la prioridad, porque sin eso la app no vende de verdad.

## 7. Lo que necesito que decidas

1. ¿Empezamos por la **Fase 1** (ubicación al principio, sin código)?
2. ¿Cómo mandamos el código cuando llegue la Fase 2: **WhatsApp**, **SMS** o correo?
3. ¿Para el piloto aceptás entrar **sin código**, mostrando solo el nombre de pila?
4. ¿Qué proveedor de mapas preferís, o dejo que lo proponga yo según el costo?
5. ¿Quién revisa el aviso de privacidad?
