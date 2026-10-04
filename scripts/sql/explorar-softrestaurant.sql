/* =============================================================================
   EXPLORAR LA BASE DE SOFT RESTAURANT
   =============================================================================

   PARA QUE SIRVE
   Dice que tablas tiene la base del POS y que columnas de fecha trae cada una,
   para saber de donde sacar la hora en que entra cada pedido. Es el paso
   previo a conectar Control Express con el POS.

   ES DE SOLO LECTURA
   No crea, no borra y no modifica nada. Solo consulta los catalogos del propio
   SQL Server. Se puede correr con el POS trabajando, en plena hora pico, sin
   que nadie lo note.

   NO SACA DATOS DE CLIENTES
   A proposito: no trae nombres, ni telefonos, ni direcciones, ni montos. Solo
   los NOMBRES de las tablas y columnas, y cuantas filas tiene cada una. Lo que
   se manda por correo no lleva datos de nadie.

   COMO SE CORRE
   1. En la computadora donde esta el POS, abrir SQL Server Management Studio.
      (Si no esta instalado: se baja gratis de Microsoft como "SSMS".)
   2. Conectarse al servidor que aparece por defecto.
   3. Arriba a la izquierda, elegir la base de Soft Restaurant en la lista
      desplegable (se llama algo como softrestaurant95pro).
   4. Abrir este archivo, apretar F5.
   5. En los resultados, boton derecho sobre la primera fila ->
      "Select All", despues boton derecho -> "Copy with Headers".
      Pegar en un archivo de texto y mandarlo.

      O mas facil: menu Query -> "Results To" -> "Results to File", y apretar
      F5. Pide donde guardar y escribe todo en un archivo.

   ============================================================================= */

SET NOCOUNT ON;

-- -----------------------------------------------------------------------------
-- 1. Que base es y que version de SQL Server
-- -----------------------------------------------------------------------------
SELECT
    '1. LA BASE'                      AS seccion,
    DB_NAME()                         AS base,
    CONVERT(varchar(128), SERVERPROPERTY('ProductVersion'))  AS version_sql,
    CONVERT(varchar(128), SERVERPROPERTY('Edition'))         AS edicion,
    CONVERT(varchar(128), SERVERPROPERTY('ProductLevel'))    AS nivel;

-- -----------------------------------------------------------------------------
-- 2. Las tablas, de la mas grande a la mas chica
--
--    El tamano importa: las tablas de pedidos son siempre las que mas filas
--    tienen, porque crecen con cada venta. Las de catalogo (productos, mesas)
--    se quedan en decenas o cientos.
-- -----------------------------------------------------------------------------
SELECT TOP 80
    '2. TABLAS'                       AS seccion,
    s.name                            AS esquema,
    t.name                            AS tabla,
    SUM(CASE WHEN p.index_id < 2 THEN p.row_count ELSE 0 END) AS filas
FROM sys.tables AS t
INNER JOIN sys.schemas AS s
        ON s.schema_id = t.schema_id
LEFT JOIN sys.dm_db_partition_stats AS p
        ON p.object_id = t.object_id
GROUP BY s.name, t.name
ORDER BY filas DESC;

-- -----------------------------------------------------------------------------
-- 3. Todas las columnas de fecha y hora de la base
--
--    Esta es la seccion que mas falta hace. De aqui sale la respuesta a:
--    donde quedo anotada la hora en que entro el pedido, la hora en que la
--    cocina lo marco listo, y la hora en que se cerro la cuenta.
-- -----------------------------------------------------------------------------
SELECT
    '3. COLUMNAS DE FECHA'            AS seccion,
    t.name                            AS tabla,
    c.name                            AS columna,
    ty.name                           AS tipo,
    c.is_nullable                     AS acepta_vacio
FROM sys.columns AS c
INNER JOIN sys.tables AS t   ON t.object_id = c.object_id
INNER JOIN sys.types  AS ty  ON ty.user_type_id = c.user_type_id
WHERE ty.name IN ('datetime', 'datetime2', 'smalldatetime', 'date', 'time', 'datetimeoffset')
ORDER BY t.name, c.column_id;

-- -----------------------------------------------------------------------------
-- 4. Las columnas de las tablas que suenan a pedido, cuenta o cliente
--
--    Soft Restaurant llama "cheque" a lo que el negocio llama pedido o cuenta.
--    Se buscan por nombre para no traer las trescientas tablas enteras.
-- -----------------------------------------------------------------------------
SELECT
    '4. COLUMNAS DE PEDIDOS'          AS seccion,
    t.name                            AS tabla,
    c.column_id                       AS orden,
    c.name                            AS columna,
    ty.name                           AS tipo,
    c.max_length                      AS largo,
    c.is_nullable                     AS acepta_vacio
FROM sys.columns AS c
INNER JOIN sys.tables AS t   ON t.object_id = c.object_id
INNER JOIN sys.types  AS ty  ON ty.user_type_id = c.user_type_id
WHERE t.name LIKE '%cheq%'
   OR t.name LIKE '%orden%'
   OR t.name LIKE '%pedido%'
   OR t.name LIKE '%client%'
   OR t.name LIKE '%domicil%'
   OR t.name LIKE '%repart%'
   OR t.name LIKE '%mesero%'
   OR t.name LIKE '%folio%'
ORDER BY t.name, c.column_id;

-- -----------------------------------------------------------------------------
-- 5. Las llaves primarias
--
--    Para saber como identificar un pedido sin ambiguedad cuando Control
--    Express lo lea una segunda vez y tenga que reconocer que es el mismo.
-- -----------------------------------------------------------------------------
SELECT
    '5. LLAVES'                       AS seccion,
    t.name                            AS tabla,
    i.name                            AS llave,
    c.name                            AS columna,
    ic.key_ordinal                    AS posicion
FROM sys.indexes AS i
INNER JOIN sys.tables AS t          ON t.object_id = i.object_id
INNER JOIN sys.index_columns AS ic  ON ic.object_id = i.object_id
                                   AND ic.index_id  = i.index_id
INNER JOIN sys.columns AS c         ON c.object_id = ic.object_id
                                   AND c.column_id = ic.column_id
WHERE i.is_primary_key = 1
ORDER BY t.name, ic.key_ordinal;

-- -----------------------------------------------------------------------------
-- 6. Movimiento de los ultimos siete dias
--
--    Para confirmar cual tabla es la que se escribe en vivo cuando entra un
--    pedido. Si esta vacia, es que esa tabla no es la que se usa.
--    Si alguna consulta de esta seccion falla porque la tabla no existe en
--    esta version, no importa: las de arriba son las que valen.
-- -----------------------------------------------------------------------------
IF OBJECT_ID('dbo.cheques', 'U') IS NOT NULL
    SELECT '6. MOVIMIENTO' AS seccion, 'cheques' AS tabla, COUNT(*) AS filas_7_dias
    FROM dbo.cheques
    WHERE fecha >= DATEADD(day, -7, GETDATE());
