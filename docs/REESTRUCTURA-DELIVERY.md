# Reestructura: la aplicación es solo delivery

17 de octubre de 2026. El dueño pidió quitar lo que venía de "Control Express"
(la flota de motos con mantenimiento y gastos) y dejar la aplicación enfocada en
la entrega a domicilio. Esta es la lista de qué quedó, qué se quitó y por qué.

> Las secciones de `ARQUITECTURA.md` sobre la flota, los gastos, la lectura de
> fotos con IA y la evidencia describen código que **ya no existe**. Este
> documento manda.

## Qué quedó (cuatro pestañas)

| Pestaña | Pantallas | Para qué |
|---|---|---|
| **Pedidos** | Pedidos de la app (`/pedidos-app`, la pantalla de inicio), Pedidos del POS (`/entregas`), Historial | Lo que piden los clientes desde la app, a quién le toca cada uno, y los pedidos del POS que esperan moto |
| **Repartidores** | `/repartidores` | Quiénes llevan pedidos y la moto que trae cada uno hoy (alta rápida de una moto: placa y cómo se le dice) |
| **Clientes** | `/clientes`, `/ubicacion/[token]`, WhatsApp | Fichas del POS y la ubicación exacta de cada casa |
| **Ajustes** | `/configuracion` | Usuarios, roles y PIN |

Aparte: la app de los clientes (`/pedir`) y la pantalla del repartidor en su
teléfono (`/mi`).

## Cómo se le da un pedido a una moto

1. En **Repartidores**, cada repartidor en servicio tiene "Moto de hoy".
2. En **Pedidos de la app**, cada pedido tiene "Lo lleva": la lista muestra el
   repartidor y su placa.
3. El repartidor entra a `/mi` con su PIN y ve **solo sus pedidos**: dirección,
   cuánto cobrar en la puerta, y botones de Waze, mapa y llamar.
4. El local sigue moviendo el estado (cocina, despachado, entregado). El
   repartidor consulta, no escribe.

Se puede dar o quitar el pedido mientras no esté entregado ni cancelado, y cada
cambio queda en la bitácora.

## Qué se quitó

Pantallas: `/motos` (flota, gastos, reportes de taller), `/mi/gasolina`.
Servicios: mantenimiento, lectura de fotos con IA (odómetro y facturas),
evidencia fotográfica, GPS de las motos. Componentes y scripts de demo/prueba
de todo eso. Permisos `FLOTA` y `BORRAR_EVIDENCIA` (lo de las motos ahora lo
cubre `REPARTIDORES`). La marca "Control Express" pasó a "Delivery La Estación".

## Qué NO se tocó: la base de datos

Las tablas de la flota (`registros_mantenimiento`, `evidencias`,
`lecturas_foto`, y los campos de ficha técnica y GPS de `motocicletas`) siguen en
la base con sus datos. Quitar código no borra nada. Si algún día se quiere
borrar las tablas, es un cambio aparte del esquema y requiere respaldo y
autorización expresa.

`src/server/services/motos.ts` conserva el alta de motos y la asignación a un
repartidor (con los candados que impiden dos motos por repartidor). Sus funciones
de cambio de estado, moto comodín y ficha técnica quedaron sin pantalla.
