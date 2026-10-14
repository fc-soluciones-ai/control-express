# El menú de la app de delivery

Propuesta para revisar con el dueño. Sale del menú real del POS (563 productos,
294 marcados para domicilio, copiados a la nube el 13 de octubre de 2026).

## La idea

El menú del POS es el de la caja: sirve para cobrar rápido en el mostrador y está
lleno de duplicados y de trucos (cada tamaño de pizza es un producto distinto, el
acompañamiento del pollo cambia el producto, los extras se repiten por tamaño).
**No se toca**: los restaurantes siguen con el suyo.

La app lleva un menú propio, armado como el de los quioscos de McDonald's, KFC y
Pizza Hut: pocas decisiones por pantalla, botones grandes, y el sistema se encarga
de traducir lo que el cliente eligió al producto exacto del POS.

Cada opción que el cliente puede elegir apunta a **un producto del POS**. Ese
vínculo es lo que hace que la cuenta caiga bien en la caja, que el precio sea el
de la caja y que la comanda llegue a la impresora de su área.

## Cómo se pide (estilo quiosco)

1. **Inicio**: ocho fichas grandes con foto (Pizzas, Pollo, Parrilla, Hamburguesas
   y sándwiches, Combos, Bebidas, Postres, Adicionales). Carrito siempre visible
   abajo con el total.
2. **Producto**: se abre una hoja desde abajo con lo que hay que decidir, en este
   orden y con botones grandes: tamaño o presentación, acompañamiento, extras con
   más y menos, notas rápidas ("sin cebolla", "masa delgada") y cantidad. El botón
   verde dice "Agregar ₡9,950".
3. **Antes de pagar**, una sola sugerencia, como en los quioscos: "¿Le agregamos
   una bebida?" o "¿Papas?". Siempre se puede saltar.
4. **Datos**: el teléfono. Si ya pidió antes, su nombre y su dirección aparecen
   solos. Si es nuevo, nombre, ubicación en el mapa y una referencia.
5. **Pago**: efectivo contra entrega (piloto). Se pregunta con cuánto paga.
6. **Confirmación**: número de pedido y seguimiento. "Repetir mi último pedido" en
   un toque para el cliente que vuelve.

## Las ocho categorías, con lo que hay hoy

| Categoría | Qué trae | De dónde sale en el POS |
|---|---|---|
| **Pizzas** | 14 sabores en 3 tamaños (Personal, Mediana, Familiar), extras por ingrediente (aceituna, hongos, jalapeños, jamón, molida, peperonni, queso, salami, tomate, carne mechada), mitad y mitad | grupos 01, 02, 03 |
| **Pollo** | Muslo y cuarto, pechuga y ala (con ceviche, papas o papas agrandadas), 3 piezas (4 combinaciones), alitas, pollo asado (entero, 1/2, 1/4), nuggets, porción frito con ensalada | grupo 04 |
| **Parrilla** | Costilla de cerdo, pechuga a la plancha | 04062 y 04060 |
| **Hamburguesas y sándwiches** | 3 hamburguesas de carne, 2 de pollo, 5 sándwiches, 2 ensaladas; extras (huevo, frijol, jamón, carne mechada, tocineta) | grupo 05 |
| **Combos** | Combo 1 a 4 de pollo, combo de 12 alitas, promo 1 y promo 2 de pizzas | 04034–04040, 5001, 01056, 01057 |
| **Bebidas** | Gaseosas por marca y tamaño (600 ml, 2.5 L), naturales (normal y grande), batidos, té, agua | grupo 06 |
| **Postres** | Tres leches, cheese cake, flan, helados, dulces | grupo 07 |
| **Adicionales** | Papas, salsas, tortillas, ceviche, hielo, empaque | grupo 09 |

## Cómo se traduce lo que el cliente elige

- **Pizza**: sabor + tamaño → producto del POS (`PIZZA FAMILIAR LA ESTACION` es
  `01012`). Cada extra → el `EXTRA FAM/MED/PER` del tamaño elegido.
- **Pollo**: la pieza + el acompañamiento → el producto que ya trae esa
  combinación (`MUSLO Y CUARTO C/PAPAS AGRANDADAS` es `04006`).
- **Bebidas**: marca + tamaño → un producto.

Así, el cliente ve "Muslo y cuarto" **una vez**, con tres botones de
acompañamiento, y no tres productos casi iguales.

## Lo que se deja fuera, y por qué

- **Grupo 08 EXPRESS**: son los cargos de envío (1,400 / 1,600 / 2,000 / 2,500),
  y `PEAJES`. La app calcula el envío según la zona y agrega el renglón correcto.
  Incluye `ALQUILER DE LOCAL` (₡734,500), que es un cobro interno.
- **Grupo 10 YOBEL y grupo 11 FIESTA NIÑO**: tienen precios especiales
  (convenio y fiestas). A confirmar si entran.
- **Productos de cobro interno**: `SERVICIO RESTAURANTE` (₡0), `DESAYUNO`,
  `CASADO DEL DIA`. A confirmar si se venden por delivery.
- **Duplicados**: en las pizzas medianas los extras de jalapeños, jamón, queso y
  salami están dos veces (₡500 y ₡505). Se usa uno solo.

## Lo que falta decidir

1. La regla del cargo de envío: ¿cómo escoge la caja entre 1,400, 1,600 y 2,000?
2. Si YOBEL, FIESTA NIÑO, DESAYUNO y CASADO DEL DIA entran.
3. El significado de las notas de cocina más usadas ("P.F", "Q.PIZZA", "C,C",
   "Q,BLANCO"), para ofrecerlas como botones y que la comanda diga lo mismo.
4. Si se empieza solo con lo principal (pizza, pollo, parrilla, hamburguesas) y
   el resto va en una segunda etapa.

## Cómo se construye (y qué ya está hecho)

**Hecho (13 de octubre de 2026).** La primera etapa, solo lo principal:

- Tablas que no tocan el POS: `categorias_app`, `items_app`, `variantes_app`
  (qué combinación de tamaño y acompañamiento corresponde a qué producto del POS)
  y `complementos_app` (los extras, que dependen del tamaño).
- La propuesta inicial, en `src/lib/menu/propuesta-inicial.ts`: **5 categorías,
  43 platos, 87 variantes y 423 extras**, armada con los productos reales del POS y
  sin ningún producto faltante. Solo agrega: nunca pisa lo que el dueño cambie.
- La pantalla del cliente en `/pedir`, estilo quiosco: fichas de categoría,
  hoja de producto desde abajo (tamaño, acompañamiento, extras con más y menos,
  notas rápidas, cantidad), y carrito siempre visible. El carrito sobrevive a
  recargar la página.
- Pruebas: `npm run test:estructura` (la lógica del menú y el carrito),
  `npm run test:menu-app` (la base).

**Falta.** Datos de entrega y pago, el cálculo del envío, la cola de pedidos con su
interruptor de emergencia, el agente que escribe el pedido en el POS e imprime las
comandas, la pantalla para que el dueño revise y cambie el menú, mitad y mitad,
bebidas / postres / adicionales, y las fotos (el POS no tiene ninguna: las columnas de imagen están vacías; salen de la página de Facebook o de fotos nuevas).

**Cargar el menú en la base real:** `npm run db:push` (crea las tablas) y después
`npm run db:menu-app` (carga la propuesta). Para verlo en pruebas con el menú real:
`npm run demo:menu` y `npm run dev:pruebas`, y abrir `/pedir`.
