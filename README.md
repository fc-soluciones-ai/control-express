# Control Express

Tablero de entregas para una pizzería: qué pedidos están sin entregar, cuánto
lleva esperando cada cliente y quién los lleva. Más la flota de motocicletas y
la base de clientes con su ubicación exacta.

Pensado para un monitor táctil de mostrador, encendido toda la noche, y para el
teléfono del repartidor.

---

## Para qué sirve

El negocio tiene un problema concreto: **los pedidos llegan tarde**. Soft
Restaurant, el punto de venta, sabe a qué hora entró cada pedido, pero no tiene
ninguna pantalla que diga cuáles están atrasados ahora mismo. En el mostrador
eso se descubría cuando el cliente llamaba a reclamar.

Un agente lee la base del punto de venta cada treinta segundos y empuja los
pedidos aquí. El tablero los pinta con un semáforo:

| Espera hasta el despacho | Color |
|---|---|
| 0 – 12 min | verde |
| 13 – 20 min | naranja |
| 21 – 30 min | rojo |
| más de 30 min | rojo relleno, parpadeando |

El reloj arranca **cuando entra el pedido** y se detiene **cuando sale la
moto**. Mide el despacho, que es lo que el local controla y lo único que este
POS registra de forma confiable: la hora de llegada se marca en bloque.

Hoy el promedio hasta el despacho es de **25 minutos**. Ese es el número que el
tablero existe para bajar.

---

## Stack

| Pieza | Elección |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Interfaz | Tailwind CSS, objetivos táctiles de 64 px |
| Base de datos | PostgreSQL en Supabase, con Prisma |
| Datos del punto de venta | Agente de PowerShell en el servidor del local, solo lectura |
| Ubicaciones | WhatsApp Cloud API de Meta |

---

## Puesta en marcha

```bash
npm install
cp .env.example .env
npm run db:push
npm run db:seed
npm run dev
```

Abra `http://localhost:3000`. El seed genera un PIN aleatorio para el
administrador y lo imprime una sola vez: anótelo. Para cambiarlo después:

```bash
npm run pin
```

El PIN se teclea en la terminal sin mostrarse y nunca se pasa como argumento
del comando, porque los argumentos quedan en el historial del shell.

Para servir a una tablet en la misma red, `npm run dev:red`.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm test` | Las 446 comprobaciones automáticas |
| `npm run test:entregas` | Solo el semáforo y el tablero |
| `npm run demo` | Levanta una copia de práctica en el puerto 3100 |
| `npm run db:respaldar` | Copia verificada de la base |
| `npm run db:restaurar -- --listar` | Ver y restaurar respaldos |
| `npm run db:volcar` | Volcado JSON de todas las tablas |
| `npm run db:vaciar` | Deja la base lista, conservando a las personas |
| `npm run pin` | Cambiar el PIN de un usuario |
| `npm run agente:preparar` | Arma el agente para copiarlo al servidor del local |

---

## Decisiones que conviene conocer antes de tocar el código

**El semáforo vive en un solo archivo.** Los cortes de minutos están en
`src/lib/entregas/espera.ts` y en ningún componente. El mismo semáforo aparece
en el tablero y en la pantalla del repartidor; si cada pantalla decidiera sus
cortes, un pedido saldría naranja en una y rojo en la otra.

**El tiempo se mide contra el reloj del servidor.** El equipo del mostrador
puede estar desfasado media hora sin que nadie lo note. El tablero mide el
desfase en cada lectura y corrige.

**El dinero es un entero en céntimos, nunca un decimal.** El factor sale del
exponente ISO 4217 de la moneda, no de un `× 100` reflejo. Las coordenadas sí
son decimales: la regla es del dinero, no de todo número.

**El día operativo corta a las 06:00.** La pizzería cierra de madrugada, así
que un pedido de la una de la mañana pertenece a la noche anterior.

**No hay exportación de nada.** Ni Excel, ni CSV, ni PDF. Los datos están en la
base y la base se consulta. Un archivo exportado nace desactualizado y queda en
el disco del mostrador con los teléfonos de los clientes.

**Los hechos no se editan ni se borran.** La bitácora es append-only; una
corrección es un evento nuevo.

> Este sistema empezó siendo el cierre de caja de la pizzería. Esa parte se
> quitó completa en octubre de 2026, por decisión del negocio.

La documentación completa está en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md),
el procedimiento de respaldo en [docs/RESPALDOS.md](docs/RESPALDOS.md), la base
de datos en [docs/SUPABASE.md](docs/SUPABASE.md) y el despliegue en
[docs/VERCEL.md](docs/VERCEL.md).

---

## Qué no está en el repositorio

El archivo `.env`, los respaldos, los volcados y las fotos de los repartidores
quedan fuera por el `.gitignore`. Son datos del negocio, no código.
