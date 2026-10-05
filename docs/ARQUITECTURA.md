# Control Express — Arquitectura

Tablero de entregas, flota de motocicletas y base de clientes para una
pizzería de Alajuela. Los pedidos los lee un agente de la base de Soft
Restaurant (National Soft) que corre en el servidor del local.

El problema que resuelve es uno: **los pedidos llegan tarde y nadie en el
mostrador sabe cuáles ni desde cuándo.** Todo lo demás está aquí porque hace
falta para responder eso.

> Este sistema empezó siendo el cierre de caja de la pizzería: abonos
> parciales, turnos, arqueos, tiquetes térmicos y la importación del Excel de
> ventas por mesero. Esa parte se quitó completa en octubre de 2026, por
> decisión del negocio. Lo que queda de ella son las menciones explícitas de
> qué había y por qué salió, para que nadie lo vuelva a construir sin saber
> que ya existió.

---

## 1. Decisiones de arquitectura


| Decisión | Elección | Motivo |
|---|---|---|
| Framework | Next.js 14 (App Router) + TypeScript | Un solo proceso sirve la UI táctil y la API. En una pizzería no hay quien administre dos servicios. |
| UI | Tailwind CSS, objetivos táctiles de 64 px mínimo | Se opera con el dedo, en un monitor POS, muchas veces con guantes. |
| ORM | Prisma | Migraciones versionadas y tipos generados desde el esquema. |
| Base de datos | PostgreSQL en Supabase | El mostrador, el teléfono del repartidor y el agente del local escriben en la misma base. Empezó en SQLite; el esquema no usa nada exclusivo de un motor. |
| Datos del POS | Agente de PowerShell en el servidor del local | Soft Restaurant corre en otra máquina y no hay VPN con ella. El agente lee su SQL Server con autenticación de Windows y empuja a esta API: cero contraseñas guardadas y cero puertos abiertos. |

### Por qué el servidor manda

El navegador no calcula nada que importe: lo pide. Los minutos que lleva
esperando un pedido se miden contra el reloj del **servidor**, no contra el del
equipo del mostrador, que puede estar desfasado media hora sin que nadie lo
note. El tablero mide el desfase en cada lectura y corrige.

Toda escritura queda firmada por un usuario y asentada en la bitácora. Si dos
pantallas tocan la misma moto, la base de datos decide, no el orden en que
llegaron los clics.

---

## 2. Tres invariantes que el resto del sistema da por ciertas

**1. El dinero es un entero en céntimos.** Nunca un `Float`. CRC tiene
exponente ISO 4217 de 2, así que ₡12.500 se guardan como `1250000`. El factor
sale de una tabla de exponentes, no de un `× 100` reflejo. Toda la conversión
vive en `src/lib/money/money.ts`. Hoy el dinero que queda son los gastos de
taller y el total que el repartidor tiene que cobrar; la regla sigue en pie
igual. Las coordenadas sí son `Float`: la regla es del dinero, no de todo
número.

**2. El tiempo de espera se cuenta desde que el pedido entró al POS.** No desde
que la moto salió. Es lo que el cliente vive: el que llamó hace cincuenta
minutos esperó cincuenta minutos, aunque la moto saliera hace cinco. Además es
el único dato del POS en el que se puede confiar: la marca de llegada se pone
en bloque al cerrar las cuentas, y en la medición de agosto 242 pedidos tenían
solo 88 horas distintas de llegada.

**3. Los hechos no se editan ni se borran.** La tabla `eventos_auditoria` es
append-only y es la fuente de la pantalla de historial. Una corrección es un
evento nuevo, nunca la edición de uno viejo.

---

## 3. Estructura de carpetas


```
Cierre Caja Expres/
|- prisma/
|  |- schema.prisma            # Esquema completo, comentado
|  `- seed/seed.ts             # Usuario inicial y repartidores de ejemplo
|- docs/
|  |- ARQUITECTURA.md          # Este documento
|  |- RESPALDOS.md             # Respaldo, restauracion y tarea programada
|  |- SUPABASE.md              # La base de PostgreSQL y el esquema de pruebas
|  `- VERCEL.md                # Despliegue y variables
|- scripts/
|  |- base-de-pruebas.ts       # Envoltorio: corre un script contra `pruebas`
|  |- guarda-pruebas.ts        # Se niega a borrar si no ve la base de pruebas
|  |- verificar-*.ts           # Las comprobaciones automaticas
|  |- volcar-datos.ts          # Volcado JSON de todas las tablas
|  |- cargar-volcado.ts        # Y su pareja, que lo vuelve a meter
|  |- vaciar-datos.ts          # Deja la base lista, conservando personas
|  |- respaldar.ts             # Copia verificada
|  |- restaurar.ts             # Restauracion con red de seguridad
|  |- agente-pos/              # El agente de PowerShell del local
|  `- sql/                     # Diagnostico del POS, solo lectura
`- src/
   |- app/
   |  |- page.tsx              # La raiz: manda a cada quien a su pantalla
   |  |- entregas/             # EL TABLERO. Pedidos sin entregar
   |  |- historial/            # Bitacora filtrable
   |  |- motos/                # Flota, gastos y reporteria de taller
   |  |- repartidores/         # Alta, edicion y baja
   |  |- clientes/             # Base del POS y ubicaciones por WhatsApp
   |  |- mi/                   # Lo que ve el repartidor en su telefono
   |  |- ubicacion/[token]/    # La pagina que abre el cliente desde WhatsApp
   |  `- api/
   |     |- pos/pedidos        # Lo que empuja el agente
   |     |- pos/clientes       # Idem, con las fichas
   |     `- whatsapp           # Aviso de Meta cuando llega una ubicacion
   |- components/              # Pantallas y piezas de interfaz
   |- lib/
   |  |- entregas/espera.ts    # El semaforo: cortes y colores, en un solo lugar
   |  |- money/money.ts        # Céntimos
   |  |- fechas.ts             # Dia operativo con corte a las 06:00
   |  |- clientes/             # Telefonos y direcciones de Costa Rica
   |  `- texto.ts              # Normalizacion para comparar nombres
   `- server/
      |- permisos.ts           # La matriz de roles, en un solo lugar
      |- config/modulos.ts     # Los módulos y sus pantallas
      `- services/
         |- entregas.ts        # El tablero
         |- pos.ts             # Recepcion de lo que manda el agente
         |- ubicaciones.ts     # Tandas de WhatsApp
         |- motos.ts           # Flota
         |- mantenimiento.ts   # Gastos y alertas
         `- historial.ts       # Bitacora
```

---

## 4. Modelo de datos

Dieciséis tablas, en tres grupos.

**Las personas y la flota**

| Tabla | Rol |
|---|---|
| `cajeros` | Usuarios del sistema. Firma de toda escritura. |
| `choferes` | Repartidor. `id_mesero_softrestaurant` es la llave de cruce con el POS. |
| `fotos_chofer` | La foto, en la base y no en disco: Vercel no tiene disco persistente. |
| `sesiones` | Un token puede pertenecer a un usuario **o** a un repartidor, nunca a los dos. |
| `motocicletas` | La flota. La placa es la llave. |
| `asignaciones_moto` | Quién trae qué moto, con candados de unicidad. |
| `registros_mantenimiento` | Gasolina, taller, repuestos, RTV y seguro. |
| `evidencias` / `lecturas_foto` | La foto de la bomba y lo que la IA leyó de ella. |

**Los clientes y sus ubicaciones**

| Tabla | Rol |
|---|---|
| `clientes` | Las fichas del POS. `clave` conserva los ceros a la izquierda: 003863 no es 3863. |
| `telefonos_cliente` | Los números de una ficha, con de dónde salió cada uno. |
| `solicitudes_ubicacion` | Un pedido de ubicación por WhatsApp, con su token y su tanda. |
| `ubicaciones_cliente` | El punto que mandó el cliente. Entra como PROPUESTA. |
| `mensajes_ubicacion` | Lo que Meta avisó, para no procesar dos veces el mismo. |

**Los pedidos y la bitácora**

| Tabla | Rol |
|---|---|
| `pedidos` | Lo que el agente trae del POS. `clave_del_pos` es única: el mismo pedido no entra dos veces. |
| `eventos_auditoria` | Bitácora append-only. |

### Los candados de asignación

`asignaciones_moto.candado_chofer_activo` y `candado_moto_activa` valen su
llave mientras la asignación está vigente y `NULL` cuando termina, con índice
único. Como los `NULL` no colisionan en un índice único, la base garantiza por
sí sola que un chofer no tenga dos motos ni una moto dos choferes. Es la
diferencia entre una regla que se cumple y un `if` que alguien olvidará poner
en el segundo endpoint.

> **Lo que se quitó.** Siete tablas salieron con el cierre de caja:
> `turnos_chofer`, `abonos_efectivo`, `cargas_excel`, `ventas_chofer_excel`,
> `cierres_chofer`, `arqueos_caja` y `tiquetes`. La comprobación
> `npm run test:esquema` falla si alguna reaparece.

---

## 5. El tablero de entregas

Es la pantalla principal y la razón del proyecto. Vive encendida en el monitor
del mostrador. `/` no la copia: redirige a ella.

### El tablero mide el DESPACHO, no la entrega

Un pedido sale de la lista cuando **arranca la moto**, no cuando el cliente
abre la puerta. Lo pidió así el negocio y es lo correcto, por dos razones:

1. **Es lo que el local controla.** Que una pizza tarde cuarenta minutos en
   salir es un problema de cocina, o de que no hay repartidor libre, y eso se
   arregla desde el mostrador. Lo que pasa después, en la calle, no.
2. **Es lo único que se puede medir hoy.** Este POS no tiene hora de entrega de
   verdad: `arriborepartidor` se marca en bloque, de a diez pedidos a la vez.
   La hora de salida se pone cuando el repartidor toma el pedido, y casi
   siempre es real.

El reloj responde una sola pregunta: cuánto lleva este cliente esperando a que
su pedido **siquiera salga**.

### Qué cuenta como "sin despachar"

Un pedido **a domicilio**, del **día operativo en curso**, **sin hora de
salida** y que **no esté resuelto**. Las cuatro condiciones importan:

- **A domicilio**, porque lo que se come en el local no sale en ninguna moto y
  se quedaría en la lista para siempre, en rojo, sin que nadie pueda sacarlo.
- **Del día operativo**, por lo mismo: un cheque que quedó abierto el martes no
  es un pedido atrasado, es un cheque mal cerrado. Mezclarlos hace que el
  tablero deje de servir a los tres días.
- **Sin hora de salida**, que es la pregunta.
- **Ni resuelto ni cancelado**, para el pedido que se cerró sin que nadie le
  pusiera hora de salida: se cobró en el local, se anuló, o el cajero lo cerró
  de otra manera. Sin esto se quedarían pegados arriba toda la noche.

### El semáforo

Los cortes los pidió el dueño con números exactos. Viven en
`src/lib/entregas/espera.ts` y en ningún `.tsx`: el mismo semáforo aparece en
el tablero, en la pantalla del repartidor y, cuando exista, en el enlace de
rastreo del cliente. Si cada pantalla decidiera sus cortes, un pedido saldría
naranja en una y rojo en la otra, y nadie volvería a creerle al tablero.

| Espera | Color | Qué significa |
|---|---|---|
| 0 – 20 min | verde | a tiempo |
| 21 – 34 min | naranja | apurado |
| 35 – 55 min | rojo | tarde |
| más de 55 min | rojo relleno **parpadeando** | crítico |

**El 35 es rojo.** El dueño pidió "21 a 35 naranja" y "35 a 55 rojo": el 35
caía en los dos. Un pedido no puede estar de dos colores, y es mejor que el
empate caiga del lado que avisa.

**Los minutos redondean hacia abajo.** A los 20 minutos y 40 segundos el
tablero dice 20 y pinta verde. Redondeando al más cercano diría 21 y saltaría a
naranja antes de que el minuto 21 exista, y quien mira el reloj de la pared no
entendería por qué.

**El crítico no es el rojo con más opacidad**, es el rojo relleno con letra
clara, y es el único que parpadea. A dos metros de un monitor de mostrador un
borde más fuerte no se distingue; un bloque de color sí. Y si parpadeara más de
un tramo, el parpadeo dejaría de significar algo. El parpadeo no se apaga del
todo: un bloque que desaparece se lee como un error de la pantalla.

### Tres decisiones de la pantalla

1. **El reloj corre en el navegador**, no en el servidor. Si solo se repintara
   al llegar datos nuevos, un pedido se quedaría clavado en "19 min" quince
   segundos y saltaría a "20". Se recalcula cada segundo contra la hora del
   servidor, usando el desfase medido en la última lectura.
2. **Se vuelve a leer la base cada quince segundos, no se recarga la página.**
   Recargar perdería el desplazamiento y haría parpadear todo, que en un
   monitor encendido ocho horas es insoportable.
3. **Una lectura fallida no borra la pantalla.** Se queda lo último bueno y se
   avisa. Una pantalla vacía se lee como "no hay pedidos", que es justo la
   conclusión equivocada.

### Cuando el agente se calla

Si el último pedido sincronizado tiene más de tres minutos, el tablero lo dice
arriba, en rojo. Un tablero que miente en silencio es peor que no tener
tablero: alguien va a decidir en base a él.

### Lo que el tablero NO hace

No escribe. Ni una fila. Es una pantalla de vidrio sobre lo que el agente deja
en `pedidos`. El día que haya que marcar una entrega a mano, eso va en otra
acción y con su propio permiso, porque pasa a ser un hecho que alguien
registró y no un dato leído.

---

## 6. Interfaz táctil


**Se entra con PIN antes de ver nada.** Toda escritura queda firmada,
y una firma que el navegador pueda elegir no vale nada. El cajero sale de la
cookie de sesión en el servidor, nunca de lo que mande el cliente.

**El teclado numérico es uno solo.** El mismo componente teclea el monto de un
gasto de taller y el PIN de entrada. Las teclas miden 80 px porque se escribe
con el dedo, a veces con guante, y una tecla de tamaño de escritorio produce
errores de digitación que después aparecen como faltantes de caja.

**Se teclean colones enteros, no céntimos.** Nadie entrega monedas de céntimo,
y obligar a teclear dos ceros por monto sería una fuente constante de errores.
La conversión ocurre en un solo lugar, al confirmar.

**La clave de idempotencia se fija al abrir el modal** y no cambia mientras
siga abierto. Ese es el detalle que evita cobrar dos veces cuando el dedo
rebota sobre Confirmar.

**Los atajos de teclado leen de referencias, no del estado.** Si dependieran
del estado de React, teclear el monto y pulsar Enter de inmediato dejaría al
oyente con el valor anterior todavía en cero. En una caja se teclea así de
rápido, y el fallo apareció en la primera prueba real.

**El zoom táctil está bloqueado.** Un pellizco accidental a media noche deja
la pantalla inservible hasta que alguien sepa deshacerlo.

**Si el tiquete no sale, la pantalla lo dice.** El abono queda registrado
igual, pero decir que el papel salió cuando no salió haría que el cajero no lo
reimprimiera. Lo mismo en el cierre, que informa cuántos de sus tiquetes
salieron de verdad.

---

## 7. Repartidores e historial

**Un repartidor no se borra, se desactiva.** Sus pedidos y sus asignaciones de
moto son historia, y las llaves foráneas están en Restrict para que un clic no
pueda romperla.

**La foto se valida por sus bytes, no por su extensión.** El nombre y el
Content-Type los controla quien sube el archivo. El nombre guardado lleva un
sufijo aleatorio para que al cambiar la foto el navegador no siga mostrando la
anterior desde su caché.

**El historial solo lee.** No hay una sola escritura en su servicio. Corregir
la bitácora tendría que ser un evento nuevo, nunca la edición de uno viejo.

**Los filtros viven en la URL.** Así una consulta como "Toño, últimos cuatro
días" sobrevive a una recarga y se puede pasar a otra persona como enlace.

> **Lo que se quitó.** El historial abría con ocho métricas de dinero
> (efectivo esperado, tarjeta, SINPE, faltantes, sobrantes) y dos botones de
> exportar. Las métricas salían de las tablas de cierre, que ya no existen. La
> columna `monto` del evento se quedó porque los gastos de taller la usan.

---

## 8. Flota de motocicletas


El módulo vive aparte del dinero: comparte los repartidores y el cajero que
registra, pero ningún cálculo de caja depende de él.

### Tres tablas

`motocicletas` se identifica por la placa, no por un identificador inventado:
la placa ya es única y es lo que la gente dice en voz alta. Se guarda
normalizada, sin espacios ni guiones, así que «mot-555 b» y «MOT555B» son la
misma moto.

`asignaciones_moto` es un historial, no un estado. La asignación vigente es la
que no tiene fecha de fin. Dos columnas únicas anulables impiden a nivel de
base de datos que un repartidor traiga dos motos o que una moto la traigan
dos personas, con dos índices únicos sobre columnas que valen `NULL` cuando la
asignación termina.

`registros_mantenimiento` es la bitácora de gastos. Cada fila lleva el
odómetro del momento, y ese número es el que gobierna las alertas.

### El odómetro solo sube

Registrar un gasto actualiza el kilometraje de la moto, y el servicio rechaza
un número menor al que ya tenía. Sin esa regla, bastaría con teclear un
kilometraje bajo para que una alerta de servicio vencido desapareciera.

### Reemplazo por comodín

Cuando una moto sale de circulación, su repartidor recibe la comodín. El
requerimiento no decía qué hacer en tres casos, y los tres están resueltos y
cubiertos por pruebas:

1. **La comodín ya está prestada.** El cambio de estado no se bloquea, pero la
   pantalla avisa con nombre y apellido que ese repartidor queda sin moto. Es
   una decisión de la persona, no del sistema.
2. **La moto vuelve del taller.** Se le devuelve a su dueño y la comodín queda
   libre, lista para el siguiente.
3. **Se avería la comodín.** No se reemplaza a sí misma; se avisa igual.

### Ficha técnica

Cada moto guarda además lo que alguien necesita saber parado frente al
mostrador del repuesto: tipo de aceite, medidas de las dos llantas, presión,
tipo de freno, paso de cadena, y los vencimientos de la revisión técnica y del
marchamo.

Toda la ficha es opcional y vive en una pestaña aparte del formulario. Si se
pidiera de entrada, nadie registraría ninguna moto: esas medidas hay que ir a
buscarlas. Se da de alta hoy con la placa y el odómetro, y la ficha se llena
el día que se va al taller.

Las medidas se guardan como texto y no como números. «2.75-18», «90/90-18» y
«428H - 120 L» son designaciones, no cantidades: no se suman ni se comparan,
se leen en voz alta.

El intervalo de cambio de aceite vive en la ficha y manda sobre el general.
Una moto vieja o de mucha carga puede pedirlo antes de los 2.000 km.

### Evidencia fotográfica

Empezó siendo solo del GPS. Después hizo falta para el cambio de llantas, para
el alta de una moto y para cada modificación. Hay **una sola tabla y un solo
servicio**: repetirlo por cada caso habría multiplicado la misma validación, la
misma ruta que la sirve y el mismo tope de tamaño, con tres oportunidades de
que uno se quedara atrás.

Se apunta a la entidad por tipo e identificador, igual que `eventos_auditoria`.
No hay llave foránea porque el destino cambia según el tipo; a cambio, el
borrado de la entidad tiene que llevarse su evidencia a mano.

| Registro | Fotos | Al llenarse |
|---|---|---|
| Moto | 7: una por ángulo y dos detalles | avisa, no bota nada |
| GPS | 6 | sale la más vieja |
| Gasto | 4 | avisa, no bota nada |

El gasto no rota a propósito. Es un hecho puntual y su foto es el comprobante
de que se hizo: borrarla porque llegaron otras sería perder justo lo que se
guardó para poder demostrarlo después.

**Las fotos de la moto son el acta de entrega**: cómo estaba cuando se le dio
al repartidor. Van por casillas: adelante, atrás, lado derecho, lado
izquierdo y arriba (una foto cada una), y hasta dos detalles de algo que ya
traía, con una nota de qué es. Tampoco rotan: si se soltaran solas, un rayón
nuevo se podría tapar tomando fotos hasta que se fuera la vieja. Para repetir
un ángulo hay que borrar la foto, y el borrado queda en la bitácora con el
nombre de quien lo hizo. Pantalla: `components/PanelEntregaMoto.tsx`.

**Las imágenes viven en la base de datos.** Antes se escribían en `public/`,
que servía cuando esto corría en un solo punto de caja con su disco. En Vercel
ese disco es de solo lectura y lo que se escriba desaparece en el siguiente
despliegue. Una evidencia que desaparece no es una evidencia.

A cambio hay que cuidarles el tamaño. El navegador las encoge a 1600 píxeles de
lado mayor antes de subirlas; una foto de 6,5 MB llega como 1 MB, y eso con
ruido puro, que es el peor caso. El servidor mantiene su propio límite como
última defensa contra lo que no pase por el navegador.

Las fotos se sirven por `/api/evidencia/[id]`, que exige sesión. Muestran dónde
va escondido el rastreador de una moto, el estado en que se recibió, o la
factura de un taller.

### Rastreo satelital

Lo que se vigila no es que la moto **tenga** un GPS instalado, sino que alguien
haya comprobado hace poco que sigue conectado y con corriente. Un rastreador
desenchufado se ve igual que uno funcionando hasta el día que se roban la
moto. Por eso cada foto que se sube mueve la fecha de última revisión.

Se guardan el proveedor, el IMEI o número de unidad (el que hay que dictar por
teléfono para reportar un robo), y notas de dónde va escondido el equipo.

Se guardan el proveedor, el **IMEI** del equipo, el **correo de la cuenta**
donde reporta (con el que se entra a la plataforma a ver dónde anda la moto) y
notas de dónde va escondido.

Quitar el GPS de una moto no borra sus fotos. Son la prueba de que en su
momento estuvo puesto, y esa historia no debería desaparecer porque alguien
desmarque una casilla.

### Dos clases de alerta

El aceite vence por kilómetros rodados; la revisión técnica vence por
calendario. No se pueden mezclar en una sola cuenta: una moto parada en el
taller no gasta aceite, pero su marchamo sí se vence. Por eso `AlertaMoto` es
una unión de dos formas, y el compilador obliga a distinguirlas en cada lugar
donde se leen.

Los papeles avisan 30 días antes. Una fecha en blanco no genera alerta, al
revés de lo que pasa con el kilometraje: ahí, no haber registrado nunca un
cambio de aceite **sí** es motivo de alarma, porque el odómetro prueba que la
moto rodó. Una fecha vacía solo significa que nadie la ha anotado, y llenar el
tablero de rojo por eso haría que dejaran de mirarlo.

### Semáforo

El tablero pinta cada moto de verde, amarillo o rojo. El estado pesa más que
el kilometraje: una moto en el taller es roja aunque le acaben de cambiar el
aceite. El texto del estado lleva su propio color, porque decir «Operativa» en
rojo se lee como si la moto no sirviera.

Los intervalos son 2.000 km para el aceite y 10.000 km para frenos y llantas,
con aviso al 85 %. Una moto sin ningún servicio registrado cuenta desde cero:
está vencida, no exenta.

### Costo por kilómetro

Sale del rango de odómetro que cubren los propios registros del período, no
del kilometraje total de la moto. Mezclarlos repartiría el gasto de un mes
entre los kilómetros de toda la vida de la moto. Con un solo registro no hay
recorrido que medir y la columna dice «sin datos», que no es lo mismo que
cero: cero significaría que rodar no cuesta nada.

---

## 9. La pantalla del repartidor


El repartidor entra con su propio PIN y ve **solo lo suyo**: cuánto lleva
entregado, sus entregas una por una, lo que el reporte de ventas dice que
trae pendiente, y su moto con sus avisos. No puede tocar la flota, ver
la caja ni ver a los demás.

### Una sola puerta, dos llaves

`Sesion` pasó a poder pertenecer a un usuario de caja **o** a un repartidor,
en vez de crear una segunda tabla de sesiones. Así el bloqueo por intentos, la
caducidad, la marca de uso y la revocación se escriben una sola vez. Una tabla
aparte habría significado volver a escribir todo eso, con la mitad de las
probabilidades de acordarse de cada detalle.

### Dónde se cierra la puerta

`cajeroPorToken` devuelve `null` para una sesión de repartidor. Todas las
pantallas de caja preguntan por esa función, así que con eso solo, el token de
un repartidor no abre ninguna. La puerta se cierra en un lugar y no en veinte.

Está comprobado de las dos formas: que el token del repartidor no sirve como
cajero, y que el del cajero no sirve como repartidor.

### El id sale de la sesión, nunca de la dirección

Todas las consultas de `services/repartidor.ts` filtran por el id que viene de
su sesión. No hay ningún número en la dirección que alguien pueda cambiar para
ver lo de otro.

### Nadie entra hasta que se le dé acceso

El PIN del repartidor es opcional y empieza vacío. Sin PIN no entra, y ni
siquiera aparece en la lista de la pantalla de entrada. La pestaña de
repartidores solo aparece cuando al menos uno tiene PIN.

El acceso lo da un **administrador** (rol `ADMIN`) desde Gestión de
repartidores, con el botón **Asignar PIN** de cada ficha; ahí mismo lo cambia
o lo quita. Asignarlo o cambiarlo desbloquea los intentos fallidos y cierra la
sesión que el teléfono tuviera abierta. En la bitácora queda quién lo hizo,
nunca el PIN. Desde la terminal sigue sirviendo
`npm run pin -- --repartidor "DAVID-R"`.

### El repartidor carga su propia gasolina

Es quien está parado en la bomba con el odómetro a la vista y la factura en la
mano. Pedirle que se lo dicte al cajero al volver es pedirle a dos personas que
recuerden un número.

Tres datos y nada más: el odómetro, lo que pagó, y de qué bomba. La moto no se
elige porque **se busca la que él trae ahora mismo**, no la que mande la
pantalla: si viniera de afuera, alguien podría cargarle la gasolina a la moto
de otro. La categoría tampoco se elige, porque solo puede cargar gasolina.

El taller, los repuestos y los seguros los sigue registrando la caja. Son
gastos que el repartidor no decide.

### Quién firma un gasto

`RegistroMantenimiento` y `Evidencia` pasaron a llevar `cajero_id` **o**
`chofer_id`, exactamente uno de los dos, como ya hacía `Sesion`. El servicio
rechaza un gasto sin firma y uno firmado por los dos.

Importa quién fue: un gasto que nadie firma no se le puede preguntar a nadie.
Y la foto de la factura, que se pide en la misma pantalla apenas se guarda, es
lo que permite revisarlo después.

La regla del odómetro es la misma venga de donde venga: no retrocede.

### Lo que todavía no hace el rol

El rol del usuario de caja (`CAJERO`, `SUPERVISOR`, `ADMIN`) se guarda y viaja
en la sesión, pero **ninguna pantalla lo consulta todavía**. Quien entra por la
puerta de caja ve y puede todo. Separar esos tres niveles es trabajo pendiente;
lo que ya está separado es la caja del repartidor, que era el límite que de
verdad importaba.

---

## 10. Estado actual

Verificado con 446 comprobaciones automáticas (`npm test`) más pruebas en el
navegador:

- Esquema y garantías de integridad de la base.
- Moneda en céntimos, día operativo que cruza la medianoche.
- **El tablero de entregas**: semáforo, conteo por color, refresco en vivo y
  aviso cuando el agente se calla.
- **El agente del POS** corriendo en el servidor del local: 256 pedidos leídos
  en producción, 100 % ligados a su cliente. Firma HMAC sobre el cuerpo crudo
  con la hora dentro de la firma y ventana de 300 s.
- **Clientes**: las fichas llegan del POS por el agente, con teléfonos
  reconstruidos y calidad de dirección medida.
- **Ubicaciones por WhatsApp**: tandas de 150, enlace con token, página que
  abre el cliente y revisión de cada punto antes de aceptarlo.
- **Flota de motos**: tablero con semáforo, préstamo automático de la comodín,
  registro táctil de gastos y reportería con costo por kilómetro.
- Gasolina leída de la foto de la bomba por IA, con revisión humana.
- Entrada por PIN, roles, y la puerta del repartidor separada de la del
  mostrador.
- Respaldo verificado, restauración con red de seguridad, volcado y carga JSON.

### Cómo probar sin tocar los datos del negocio

`npm run demo` levanta la aplicación en el puerto 3100 contra el esquema de
pruebas, con su propia carpeta de compilación para poder correr a la vez que el
servidor de trabajo. `npm run demo:flota` y `npm run demo:clientes` le ponen
datos de ejemplo.

Las comprobaciones destructivas no confían en el envoltorio: cada una llama a
`exigirBaseDePruebas()` y se niega a correr si no ve explícitamente el esquema
`pruebas`. Esa guarda existe porque ya se perdió una base por no tenerla.

### Lo que falta

1. **La hora de entrega de verdad.** El POS marca las llegadas en bloque al
   cerrar las cuentas, así que no sirve para medir. La única forma de tenerla
   es que el repartidor marque "entregado" en su teléfono. Esa pantalla está
   por hacer, y sin ella no se puede saber si el tablero está mejorando algo.
2. **El enlace de rastreo para el cliente.** Un enlace por pedido que muestre
   en qué va y, cuando haya GPS, por dónde viene la moto.
3. **Cuatro códigos de mesero sin repartidor.** Los códigos 1, 2, 27 y 34
   llevan 142 pedidos (55 %) y no calzan con nadie del padrón. Hay que
   preguntar en el local quiénes son.
4. **Destino de los respaldos.** Supabase hace los suyos; los nuestros van a
   una carpeta del mismo disco. Ver [RESPALDOS.md](RESPALDOS.md).

---

## 11. Las palabras que usa el negocio


La pantalla dice **repartidor** y **usuario**. El código y la base de datos
dicen `Chofer` y `Cajero`.

No es descuido. Cambiar el nombre de las tablas obligaría a migrar todas las
que las referencian, y a reescribir cada servicio, sin que el encargado de la
caja notara ninguna diferencia. El nombre interno es un detalle de
construcción; el que importa es el que se lee en la pantalla.

Dos aclaraciones del negocio que conviene no olvidar:

- **El repartidor y el chofer son la misma persona.** Maneja la moto y entrega
  el pedido. No son dos puestos.
- **En Soft Restaurant el repartidor está dado de alta como mesero**, y por eso
  el cruce con el Excel se hace por `id_mesero_softrestaurant`.

La carpeta `public/choferes/` conservaba el nombre viejo, pero ya no existe:
las fotos pasaron a la base de datos y esa carpeta quedó sin uso.

---

## 12. La gasolina leída de las fotos


El repartidor ya no teclea el kilometraje ni el monto. Toma dos fotos, la del
odómetro y la de la factura, y el servidor se las pasa a la IA: Gemini
(Google) si está su clave, y si no Claude (Anthropic). La IA devuelve el kilometraje, el total, la fecha, la gasolinera,
el número de factura y los litros. La pantalla los muestra y no deja cambiarlos.

Código: `src/server/services/lectura-ia.ts`. Prueba: `npm run test:lectura`,
con un lector falso que no llama a la IA.

**Cómo se evita que se manipulen los números**

1. Cada foto leída queda en la tabla `lecturas_foto` con lo que se leyó. Para
   registrar, la pantalla manda solo los ids de dos lecturas; los números se
   toman de la base.
2. Cada lectura sirve una sola vez, es del repartidor que la tomó y de la moto
   que traía. Se reserva antes de crear el gasto, así dos envíos simultáneos
   no pueden usarla dos veces.
3. La misma foto (huella SHA-256) o la misma factura (por número, o por bomba,
   fecha y monto) no se acepta dos veces.
4. La factura tiene que ser de los últimos 3 días. El odómetro no retrocede ni
   salta más de 2.500 km. Una lectura de hace más de 2 horas ya no sirve.
5. Las dos fotos pasan a la evidencia del gasto, y el gasto queda con
   `origen = 'IA'`. Si la IA notó algo raro (una foto tomada a una pantalla,
   por ejemplo), queda en `observacion`.

Lo que no se puede detectar desde aquí es una factura ajena que nunca se
registró. Para eso la foto queda a la vista de la caja.

Si una foto no se lee, se toma otra. Si no hay manera, la gasolina la registra
la caja desde la flota, como antes.

**Configuración**

```
npm run ia:clave                        # la clave (Gemini o Claude), oculta, a .env
npm run vercel:variables -- --aplicar   # la sube a Vercel; luego volver a desplegar
```

Sin `GEMINI_API_KEY` ni `ANTHROPIC_API_KEY`, la pantalla del repartidor avisa
que la lectura no está configurada y no deja registrar. Los modelos son
`gemini-flash-latest` y `claude-sonnet-5`; se cambian con `IA_MODELO`.

La clave de Gemini se saca gratis en aistudio.google.com. En la capa gratuita
Google puede usar lo que se le manda para mejorar sus productos, y aquí van
facturas del negocio: conviene activar la facturación del proyecto en Google
Cloud, que además quita los límites de uso gratuitos. Hay un tope de 30 fotos por hora por
repartidor, porque cada lectura cuesta.

---

## 13. Roles, usuarios y bitácora


Los tres roles existían en la base desde el principio, pero no gobernaban
nada: cualquier usuario podía editar la flota o borrar una evidencia. El rol
solo se consultaba para el PIN de los repartidores.

La matriz está en `server/permisos.ts`, en un solo lugar y no repartida por las
acciones, para poder discutirla con el negocio sin leer código:

| Permiso | CAJERO | SUPERVISOR | ADMIN |
|---|:--:|:--:|:--:|
| `OPERACION` — el tablero de entregas y el historial | ✅ | ✅ | ✅ |
| `FLOTA` — motos, gastos, GPS, asignaciones | | ✅ | ✅ |
| `REPARTIDORES` — alta, edición, baja y su PIN | | ✅ | ✅ |
| `BORRAR_EVIDENCIA` — quitar una foto ya subida | | ✅ | ✅ |
| `CLIENTES` — la base del POS y las tandas de WhatsApp | | ✅ | ✅ |
| `USUARIOS` — usuarios del sistema, roles y PIN | | | ✅ |

Se aplica en **dos capas**: la acción del servidor llama a `exigirCajeroCon()`
y la página se niega a abrir con `tienePermiso()`. Esconder el botón no es una
defensa; solo evita el error honesto de intentar algo que va a rebotar.

### Usuarios del sistema

`/configuracion/usuarios` (solo ADMIN) crea usuarios, cambia su rol, los saca
de servicio y resetea el PIN. Antes esto solo existía como comando de terminal,
lo que dejaba al negocio sin poder dar de alta a alguien fuera de horario y
empujaba a que todos entraran con el mismo usuario, que es justo lo que rompe
la firma de cada movimiento.

Un usuario **nunca se borra**: se desactiva, porque lo que registró queda
firmado por él en la bitácora. Dos reglas impiden quedarse afuera de la propia
aplicación: nadie se desactiva ni se degrada a sí mismo, y siempre queda al
menos un ADMIN activo. Desactivar o cambiarle el PIN a alguien cierra sus
sesiones abiertas; cambiarse el PIN propio no cierra la sesión desde la que se
hizo.

### Qué cambió y desde dónde

`eventos_auditoria` guarda ahora `valores_anteriores`, `valores_nuevos` e `ip`.
Solo se guardan **los campos que cambiaron**: la fila entera esconde el cambio
entre veinte campos iguales, y es el cambio lo que alguien va a buscar dentro
de seis meses. `soloLoQueCambio()` en `services/auditoria.ts` hace esa resta, y
`server/peticion.ts` saca la IP de las cabeceras, devolviendo null cuando el
código corre desde un script y no desde el servidor web.

El PIN nunca aparece en la bitácora, ni en el detalle ni en los valores.

---

## 14. Navegación: cabecera, migas y pantallas de sistema


Cada pantalla ponía su propio enlace **Volver** a mano y el botón de salir solo
existía en el tablero: para cerrar sesión había que volver al inicio primero.
Las pantallas hondas (flota → gastos → reportes) no decían de dónde venían.

`components/Cabecera.tsx` resuelve las tres cosas a la vez y va **pegada
arriba**: en una tableta de mostrador el dedo entra por el borde superior, y en
una pantalla larga el camino de vuelta no puede quedar fuera de la vista.

- **← Atrás** lleva a la última miga con enlace, o a donde diga `volverA`.
- **Migas** en pantallas grandes; en el teléfono se muestra el título actual,
  porque tres niveles no caben en 360 píxeles.
- **Menú de usuario** con Mi cuenta y Cerrar sesión, y el rol debajo del
  nombre, que es lo que explica por qué un botón no aparece.

Las pantallas del repartidor (`/mi` y `/mi/gasolina`) quedaron como estaban: son
de un solo nivel, ya traen su salida, y unas migas de un solo escalón solo
roban espacio en un teléfono.

### Mi cuenta

`/mi-cuenta` entra cualquier usuario de caja, sin importar el rol: cambiar el
PIN propio no es administración, es higiene, y tener que pedírselo a otro es lo
que hace que los PIN no se cambien nunca. Pide el PIN actual antes del nuevo;
sin eso, quien encuentre una pantalla abierta se queda con el usuario de otro.

### 404, 403 y 500

| Ruta | Cuándo | Qué hace |
|---|---|---|
| `app/not-found.tsx` | dirección que no existe | Ofrece el camino al inicio |
| `app/sin-permiso/page.tsx` | el rol no alcanza | Dice a quién pedírselo |
| `app/error.tsx` | falla una pantalla | Muestra el código del fallo y deja reintentar |
| `app/global-error.tsx` | falla antes del layout | Trae su propio HTML y estilos en línea |

El 403 es una pantalla y no un redirect callado al inicio: quedarse sin
explicación frente a una pantalla que "no hace nada" es peor que leer que hace
falta otro rol. El 500 muestra el `digest`, que es lo único que sirve para
encontrar el fallo en los registros, y nunca el detalle técnico.

### Cambios sin guardar

`lib/sinGuardar.ts` cubre las dos salidas: cerrar la pestaña (solo el navegador
puede frenarlo, con su propio diálogo) y cerrar el formulario desde la pantalla,
que se pregunta en el idioma del negocio. Se aplica a la ficha de moto y a la
del repartidor, que son las largas: veinte campos y una foto, con la equis a un
centímetro del último campo.

---

## 15. Listas: buscar, filtrar y paginar

Ninguna lista tenía buscador. Con seis repartidores no se notaba; con la flota
real y los gastos creciendo cada día, sí.

Tres piezas, una sola vez cada una:

| Componente | Qué hace |
|---|---|
| `BarraDeTabla` | Buscador con 400 ms de espera, botón de filtros y **chips** de lo que está puesto |
| `FiltroEnlace` | Un filtro de pocas opciones, como botones en vez de lista desplegable |
| `Paginacion` | Total, selector de 10/25/50 y paso de página |

Todo vive en la dirección (`lib/consulta.ts`), así que una búsqueda útil se
recarga, se comparte como enlace y el botón Atrás del navegador deshace el
último filtro en vez de sacar de la pantalla. Cambiar un filtro vuelve a la
página 1: quedarse en la cuatro con un filtro nuevo muestra una tabla vacía que
parece un error.

**Los chips no son decoración.** Un filtro que no se ve es la causa más común
de "me falta un movimiento": alguien dejó puesto un rango de fechas la semana
pasada y hoy la lista miente sin decirlo.

### Dónde se filtra

- **Flota y repartidores**: en memoria. Son decenas de filas, no miles, y una
  consulta por tecla no se justifica. La comparación ignora tildes y mayúsculas
  (`paraBuscar`), porque nadie escribe "Fredón" con tilde con una mano ocupada.
- **Gastos de flota** y **clientes**: contra la base, con `skip`/`take` y su
  propio conteo. Esas listas crecen para siempre; traer mil filas para mirar
  diez se siente en la tableta.
- **Historial**: con cursor ("ver más"), que es lo correcto para una bitácora
  que se recorre hacia atrás y donde llegan filas nuevas mientras se mira.
- **El tablero de entregas** no se filtra ni se pagina. Son los pedidos
  pendientes de esta noche, que caben en una pantalla. Hay un tope de 200 filas
  para que un error del agente no traiga diez mil al navegador del mostrador.

### No hay exportación

Ni Excel, ni CSV, ni PDF, en ninguna pantalla. Se quitó toda por decisión del
negocio, y la razón es buena: los datos están en la base y la base se consulta.
Un archivo exportado es una copia que nace desactualizada, queda en el disco de
la computadora del mostrador con los teléfonos de medio Alajuela, y nadie la
borra.

La lista de envío de una tanda de WhatsApp, que era el único archivo que de
verdad se usaba, ahora es una pantalla (`/clientes/tanda/[numero]`) con los
enlaces en vivo. Es mejor: se abre con un toque, siempre dice el estado de hoy
y no deja nada guardado.

---

## 16. La aplicación madre y sus módulos

Esto empezó siendo el cierre de caja de la pizzería. Después entraron la flota
de motos y los repartidores, después la base de clientes, y al final salió el
cierre. Doce botones en una fila ya no decían nada: el de los gastos de taller
y el de pedirle la ubicación a diez mil clientes no son el mismo trabajo ni los
hace la misma persona.

Por eso hay **módulos**, declarados en un solo archivo
(`src/server/config/modulos.ts`), que leen la barra de pestañas y el tablero.
Antes la lista de accesos vivía dentro del componente de la barra, y agregar
una pantalla era acordarse de dos lugares.

| Módulo | Qué es | Pantallas |
|---|---|---|
| **Entregas** | Los pedidos sin entregar, en vivo desde el POS | tablero, historial |
| **Flota** | Las motos, sus repartidores, el mantenimiento y los gastos | motos, repartidores, configuración |
| **Clientes** | Las fichas del POS limpias y la ubicación de cada casa | base y ubicaciones |

### Por qué Clientes no habla con Entregas

Son dos problemas de tamaños distintos. Entregas lee la base del POS cada
treinta segundos y no se puede romper. Clientes arranca con diez mil fichas
sucias que hay que limpiar durante semanas.

Se tocan en un solo punto, que ya existe: el pedido trae la clave del cliente
y, cuando esa clave calza con una ficha nuestra, el tablero muestra el nombre y
la dirección. Nada más. Ese punto está en `services/entregas.ts` y es un
`include` de Prisma, no un acoplamiento.

---

## 17. Clientes y sus ubicaciones


### El problema

En Costa Rica no hay número de casa. La dirección de un cliente en el POS es
una cadena de referencias escrita por quien contestó el teléfono, y en la base
real la mitad no sirve para salir a repartir: 1.342 están vacías y 1.744 dicen
cosas como «ALAJUELA». El repartidor sale y llama.

Lo que se sacó de los dos archivos del POS (9.839 clientes):

| | |
|---|---|
| Con teléfono válido de 8 dígitos | 6.689 |
| En el formato viejo de 7 dígitos, de antes de marzo de 2008 | 1.252 |
| Sin ningún teléfono | 1.930 |
| Celular (6, 7, 8) — lo único que recibe WhatsApp | 5.522 |
| Solo fijo (2, 4) | 1.167 |
| **Listos: nombre, celular propio y dirección usable** | **3.535** |

### Tres reglas que gobiernan estas tablas

**El texto original no se toca.** `direccionTexto` es lo que escribió el cajero,
con sus abreviaturas y sus dedazos. Lo que se corrige vive al lado, nunca
encima: el día que una corrección resulte mala hay que poder volver a lo que el
cliente dijo de verdad.

**La ubicación es historial, no un campo.** Un cliente se muda, manda el punto
desde el trabajo, o el GPS miente por cien metros. Cada punto es una fila nueva
con quién lo mandó y cuándo; la que se usa para repartir es la última
**aceptada**, no la última recibida.

**Los repetidos se marcan, no se fusionan solos.** 337 teléfonos están
repartidos entre varios clientes y 593 nombres se repiten. Unir dos fichas que
parecían la misma persona no se deshace; marcarlas y que alguien decida, sí.

### La clave del POS lleva ceros y son parte de la clave

En la base real **`003863` y `3863` son dos clientes distintos**, y hay 1.484
pares así. Ninguno comparte el nombre: son dos secuencias de numeración
independientes conviviendo. Si alguna vez alguien normaliza la clave a número,
fusiona 1.484 pares de gente que no tiene nada que ver. La prueba
`verificar-ubicaciones.ts` lo vigila.

### Los teléfonos de 7 dígitos

Hasta marzo de 2008 los números de Costa Rica tenían siete dígitos. En la
migración los fijos ganaron un `2` adelante y los celulares un `8`:
`441-2345` pasó a `2441-2345`. En esta base quedaron 1.252 sin migrar, 1.100 de
ellos fijos de Alajuela que empiezan con 4.

Se reconstruyen, pero el cliente queda en `TELEFONO_POR_CONFIRMAR` y **no entra
en ninguna tanda**: un número reconstruido puede ser el de otra casa, y el
mensaje no se puede recoger. Lo mismo vale para los rescatados del texto de la
dirección.

### Cómo se le pide la ubicación a un cliente

1. Se **arma una tanda** (`armarTanda`). Solo entran los clientes en estado
   `LISTO`. Se crea una solicitud por cliente con un token aleatorio de 22
   caracteres y se baja un Excel con el mensaje y el enlace de WhatsApp de cada
   uno.
2. Una **persona** manda los mensajes desde WhatsApp y después marca la tanda
   como enviada. El sistema no manda nada: ver abajo.
3. El cliente abre el enlace, su teléfono le pide permiso, y manda el punto con
   una nota escrita por él («portón verde, el perro ladra»). Esa nota es lo
   mejor de todo el proyecto: la escribe quien vive ahí.
4. El punto entra como **propuesta**. Alguien de la pizzería lo acepta o lo
   rechaza.

### Cuatro decisiones que parecen detalles

**Nada se manda solo.** Mandar miles de mensajes no solicitados desde el número
de la pizzería lo hace bloquear por Meta, y con el número bloqueado se pierden
también los pedidos. El módulo arma la lista; quien aprieta enviar es una
persona. La tanda está limitada a 500 y el servicio lo rechaza por encima.

**La primera tanda va a los clientes de los que más seguros estamos**, no a los
que más falta hacen. Suena al revés: lo urgente son los de dirección mala. Pero
los primeros mensajes de una cuenta deciden si Meta la marca como spam, así que
los de dirección pobre entran después, cuando el número ya tiene historia de
conversaciones contestadas.

**El token viaja en claro**, al contrario del de sesión. El de sesión se guarda
hasheado porque abre la caja; este solo permite proponer una ubicación para un
cliente, no muestra más que su nombre, y caduca a los 30 días. Guardarlo
hasheado impediría reenviar el mismo enlace cuando el cliente dice que no le
llegó, que es lo que pasa todos los días.

**La pantalla del cliente no dibuja un mapa.** Un mapa ayudaría a confirmar,
pero cargar sus imágenes manda la ubicación del cliente a un tercero antes de
que haya aceptado compartirla con nosotros, que es lo contrario de lo que dice
el permiso que está leyendo. Se muestra qué tan exacta quedó y un enlace que él
abre si quiere.

### Lo que se rechaza al recibir un punto

| Caso | Por qué |
|---|---|
| Fuera de Costa Rica | una VPN o la antena pueden dar un punto en otro país |
| Precisión peor que 100 m | en un barrio, 100 metros es cualquier cuadra |
| Enlace vencido o ya rechazado | no se insiste después de un no |

### El permiso del cliente

`TEXTO_CONSENTIMIENTO` vive en una constante del servidor y se guarda en la
solicitud **palabra por palabra**, con la fecha y la IP. Si el texto viniera
del navegador, cualquiera podría mandar un permiso distinto del que leyó y el
registro no probaría nada. Cambiar esa redacción es cambiar lo que se les
prometió a los que ya respondieron.

### Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Leer teléfonos, direcciones y estados del POS | `src/lib/clientes/normalizar.ts` |
| El permiso que acepta el cliente | `src/lib/clientes/consentimiento.ts` |
| Tandas, enlaces y puntos recibidos | `src/server/services/ubicaciones.ts` |
| Consulta de la base de clientes | `src/server/services/clientes.ts` |
| La pantalla que abre el cliente | `src/app/ubicacion/[token]/` |
| La pantalla de la pizzería | `src/app/clientes/` |
| Comprobaciones | `npm run test:ubicaciones` |

## 18. El POS y el agente del local


### Dónde está cada cosa

Soft Restaurant 9.5 Pro corre en **PZLE-SVR-02**, en el local, sobre SQL
Server 2014 Express, instancia `.\NATIONALSOFT`. Control Express corre en
Vercel, en la nube. **No hay VPN entre los dos.**

La base de producción del POS **se llama `pruebas`**. La que se llama
`softrestaurant95pro` está vacía. Esto no es una curiosidad: cualquier técnico
que entre a ese servidor puede borrar `pruebas` creyendo que hace limpieza, y
ahí viven los 83.665 pedidos del negocio. Todo script de este proyecto elige la
base **por cantidad de pedidos, nunca por el nombre**.

### Por qué un agente y no una conexión directa

Abrir el puerto 1433 a internet sería dejar la contabilidad del negocio al
alcance del primero que escanee esa dirección, y hay robots que hacen
exactamente eso todo el día. Más todavía con un SQL Server 2014 que ya no
recibe parches y un `sa` con la contraseña de fábrica del fabricante — que,
confirmado por el dueño, es la misma en todas las instalaciones de National
Soft.

Así que el que viaja es el agente: corre allá, lee, y sale. El SQL Server nunca
se asoma.

| | |
|---|---|
| Lenguaje | PowerShell, sin instalar nada |
| Autenticación | cuenta de Windows del servidor; **ninguna contraseña en ningún archivo** |
| Permisos | solo lectura |
| Frecuencia | cada 30 segundos |
| Dirección | una sola: del POS hacia la nube |

### Lo que el POS ya mide

La tabla `cheques` trae la línea de tiempo completa de una entrega: `fecha`,
`timemarktoconfirmed`, `empaquetado`, `asignacion`, `salidarepartidor`,
`arriborepartidor` y `cierre`. `tempcheques` es la misma tabla para los pedidos
abiertos en este momento.

**Pero sólo se llenan `salidarepartidor` y `arriborepartidor`** (97% de los
pedidos). `empaquetado` y `asignacion` están en cero siempre, porque nadie usa
esas marcas en el POS. Por eso los minutos dentro del local no se pueden partir
entre cocina y espera.

El número al 4 de octubre de 2026, sobre 3.719 pedidos de 90 días (99% a
domicilio): **31 minutos dentro del local + 48 en la calle = 79 minutos**.

### Las llaves compartidas

Es lo que hace que todo esto encaje sin adivinar nada:

| En el POS | En Control Express |
|---|---|
| `cheques.idclientedomicilio` | `Cliente.clave` |
| `cheques.iddireccion` | `direccionesdomicilio` del POS |
| `cheques.idmesero` | `Chofer.idMeseroSoftRestaurant` |

**Nunca se cruza por nombre.** O la clave calza o el pedido queda sin ligar,
con su clave guardada para el día que ese cliente se importe. Cruzar nombres
parecidos es como se terminan mezclando dos clientes distintos, y en esta base
hay 593 nombres repetidos.

### El pedido que llega es una copia

`Pedido` es un reflejo. El pedido nace y muere en el POS; si las dos versiones
difieren, **manda el POS**, y por eso cada envío reemplaza lo que hubiera.
Nada de lo que se escriba en Control Express vuelve al POS por su cuenta.

### Cómo se protege el envío

Igual que el webhook de WhatsApp, y por la misma razón: la dirección es pública.

- Se firma el cuerpo **crudo** con HMAC-SHA256 y un secreto compartido.
- **La hora va dentro de la firma**, y el servidor rechaza lo que tenga más de
  cinco minutos: así un envío grabado no se puede repetir mañana.
- Comparación en tiempo constante.
- Un pedido malo **no tumba el lote**: el agente reintenta lo que no se
  confirma, y si uno solo hiciera fallar la llamada los buenos entrarían una y
  otra vez.

Comprobado que la firma que calcula PowerShell y la que espera Node dan el
mismo hash. Es lo único que fallaría en silencio a veinte kilómetros de aquí.

### Instalarlo

```
npm run agente:preparar              arma storage/agente-pos con el secreto
npm run vercel:variables -- --aplicar sube el secreto a la nube
```

Después se copia esa carpeta a `C:\nationalsoft\agente` en el servidor del
local y se corre `PROBAR-AGENTE.bat`, que lee y muestra **sin mandar nada**,
con el cliente y el teléfono tapados para que la salida se pueda compartir.
Sólo cuando eso sale bien se corre `ARRANCAR-AGENTE.bat`.

El secreto no se imprime ni se teclea: lo necesitan dos programas, no una
persona. La carpeta vive en `storage/`, que git ignora, porque lo lleva dentro.

### Lo que falta y por qué no está

Una aplicación para que el cliente pida tendría que **escribir** en el POS, y
todo lo de arriba sólo lee. La versión instalada está descontinuada, así que no
hay integración oficial que comprar; la ventaja es que el esquema está
congelado y no va a cambiar nunca. Si alguna vez se escribe, se prueba primero
contra una copia restaurada en otra base de ese mismo servidor, nunca contra
`pruebas`.
