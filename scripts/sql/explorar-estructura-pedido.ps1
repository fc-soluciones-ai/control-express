<#
  COMO CREA EL POS UN PEDIDO, POR DENTRO

  PARA QUE SIRVE

  La app de delivery tiene que dejar el pedido DIRECTO en el POS, sin que nadie
  lo digite, y de ahi tienen que salir las comandas. Para hacerlo bien, sin
  danar la base de la caja, hay que conocer cuatro cosas:

  1. Que tablas toca un pedido y cuales campos son obligatorios.
  2. Como se numeran los pedidos (el folio), para no chocar con la caja cuando
     las dos escriban al mismo tiempo.
  3. Que disparadores y procedimientos tiene la base, que es donde viven las
     reglas del negocio que no se ven desde afuera.
  4. Si algun servicio externo ya metio pedidos alguna vez, porque las columnas
     appname, orderreference, paymentprovider e idfoliohub sugieren que este POS
     tiene un camino pensado para eso.

  NO SACA DATOS DE CLIENTES NI DE VENTAS. Solo nombres de tablas y de columnas,
  tipos, restricciones, codigo de los disparadores y CANTIDADES. De ninguna
  columna se imprime su contenido, salvo los nombres de las plataformas
  externas, que no identifican a nadie.

  NO ESCRIBE NADA. Solo consulta el catalogo de SQL Server y cuenta filas.
  Se puede correr con el negocio trabajando.
#>

param(
  [string]$Instancia = '.\NATIONALSOFT',
  [string]$Base = '',
  [switch]$Probar
)

$ErrorActionPreference = 'Stop'
$salida = Join-Path $PSScriptRoot 'salida-estructura-pedido.txt'
$lineas = @()

function Escribir($texto) {
  $script:lineas += $texto
  Write-Host $texto
}

function Consultar($cadena, $sql) {
  $con = New-Object System.Data.SqlClient.SqlConnection $cadena
  $con.Open()
  try {
    $cmd = $con.CreateCommand()
    $cmd.CommandText = $sql
    $cmd.CommandTimeout = 120
    $ad = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
    $tabla = New-Object System.Data.DataTable
    [void]$ad.Fill($tabla)
    # La coma evita que PowerShell desarme la tabla al devolverla.
    return ,$tabla
  } finally { $con.Close() }
}

<#
  Imprime una DataTable con las columnas alineadas, del ancho justo.

  Cada celda se recorta a 60 caracteres: aqui nunca hay datos de personas, y un
  valor larguisimo solo estorbaria la lectura.
#>
function MostrarTabla($dt) {
  if ($dt.Rows.Count -eq 0) { Escribir '  (nada)'; Escribir ''; return }
  $cols = @($dt.Columns | ForEach-Object { $_.ColumnName })
  $anchos = @{}
  foreach ($c in $cols) { $anchos[$c] = $c.Length }
  $filas = @()
  foreach ($r in $dt.Rows) {
    $celdas = @{}
    foreach ($c in $cols) {
      $v = $r[$c]
      $t = if ($v -is [System.DBNull]) { '' }
           elseif ($v -is [datetime]) { $v.ToString('yyyy-MM-dd HH:mm:ss') }
           else { [string]$v }
      $t = ($t -replace '\s+', ' ').Trim()
      if ($t.Length -gt 60) { $t = $t.Substring(0, 57) + '...' }
      $celdas[$c] = $t
      if ($t.Length -gt $anchos[$c]) { $anchos[$c] = $t.Length }
    }
    $filas += ,$celdas
  }
  Escribir ('  ' + (($cols | ForEach-Object { $_.PadRight($anchos[$_] + 2) }) -join ''))
  Escribir ('  ' + (($cols | ForEach-Object { ('-' * $anchos[$_]).PadRight($anchos[$_] + 2) }) -join ''))
  foreach ($celdas in $filas) {
    Escribir ('  ' + (($cols | ForEach-Object { $celdas[$_].PadRight($anchos[$_] + 2) }) -join ''))
  }
  Escribir ''
}

<#
  Una seccion del informe. Si una consulta falla (otra version del POS puede no
  tener una columna), se dice y se sigue con la siguiente: un informe a medias
  sirve, uno que se cae en la mitad no.
#>
function Seccion($titulo, [scriptblock]$bloque) {
  Escribir '============================================================'
  Escribir $titulo
  Escribir '============================================================'
  Escribir ''
  try { & $bloque }
  catch {
    Escribir ('  No se pudo leer esta parte: ' + $_.Exception.Message)
    Escribir ''
  }
}

if ($Probar) {
  $ok = 0
  function Comprobar($que, $real, $esperado) {
    if ("$real" -eq "$esperado") { $script:ok += 1; Write-Host "OK    $que" }
    else { Write-Host "MAL   $que  ($real != $esperado)"; exit 1 }
  }

  $dt = New-Object System.Data.DataTable
  [void]$dt.Columns.Add('tabla')
  [void]$dt.Columns.Add('filas')
  $f = $dt.NewRow(); $f['tabla'] = 'cheques'; $f['filas'] = '83665'; $dt.Rows.Add($f)
  $g = $dt.NewRow(); $g['tabla'] = 'x'; $g['filas'] = [System.DBNull]::Value; $dt.Rows.Add($g)

  $antes = $lineas.Count
  MostrarTabla $dt
  $nuevas = @($lineas[$antes..($lineas.Count - 1)])
  Comprobar 'la tabla imprime encabezado, raya y dos filas' $nuevas.Count 5
  Comprobar 'el encabezado lleva los dos nombres' ([bool]($nuevas[0] -match 'tabla\s+filas')) 'True'
  Comprobar 'una celda nula sale vacia y no revienta' ([bool]($nuevas[3] -match '^\s+x\s*$')) 'True'

  $vacia = New-Object System.Data.DataTable
  [void]$vacia.Columns.Add('a')
  $antes = $lineas.Count
  MostrarTabla $vacia
  Comprobar 'una tabla sin filas lo dice' ($lineas[$antes]) '  (nada)'

  $antes = $lineas.Count
  Seccion 'PRUEBA' { throw 'fallo a proposito' }
  $texto = ($lineas[$antes..($lineas.Count - 1)]) -join "`n"
  Comprobar 'una seccion que falla no tumba el informe' ([bool]($texto -match 'No se pudo leer esta parte: fallo a proposito')) 'True'

  Write-Host ''
  Write-Host "Todo bien ($ok comprobaciones)."
  exit 0
}

Escribir ''
Escribir 'COMO CREA EL POS UN PEDIDO, POR DENTRO'
Escribir ('Generado: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Escribir ('Equipo:   ' + $env:COMPUTERNAME)
Escribir ''

$raiz = "Server=$Instancia;Integrated Security=SSPI;TrustServerCertificate=True;Connect Timeout=15"

if ($Base -eq '') {
  $bases = Consultar "$raiz;Database=master" `
    "SELECT name FROM sys.databases WHERE database_id > 4 AND state = 0 ORDER BY name"
  $mejor = -1
  foreach ($fila in $bases.Rows) {
    $nombre = [string]$fila['name']
    # Una copia de prueba nunca se elige sola: tendria mas pedidos que la real.
    # Para mirarla a proposito, se pasa -Base con su nombre.
    if ($nombre -match '(?i)_copia$') { continue }
    try {
      $r = Consultar "$raiz;Database=$nombre" `
        "IF OBJECT_ID('dbo.cheques','U') IS NULL SELECT -1 AS n ELSE SELECT COUNT(*) AS n FROM dbo.cheques"
      $n = [int]$r.Rows[0]['n']
      if ($n -gt $mejor) { $mejor = $n; $Base = $nombre }
    } catch { }
  }
}
if ($Base -eq '') { Escribir 'No se encontro ninguna base con pedidos.'; $lineas | Set-Content -Path $salida -Encoding utf8; exit 1 }
$cadena = "$raiz;Database=$Base"
Escribir "Base: $Base"
Escribir ''

# Las tablas por las que pasa un pedido, de la cuenta abierta al pago.
$TABLAS = "'tempcheques','tempcheqdet','cheques','cheqdet','chequespagos','clientes','direccionesdomicilio','productos','productosdelivery','modificadores','comentarios','turnos'"

# --- 1 ---------------------------------------------------------------------
Seccion '1. TODAS LAS TABLAS DE LA BASE (nombre y cantidad de filas)' {
  $t = Consultar $cadena "
    SELECT t.name AS tabla, SUM(p.rows) AS filas
    FROM sys.tables t
    JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
    GROUP BY t.name
    ORDER BY t.name"
  Escribir ("  {0} tablas." -f $t.Rows.Count)
  Escribir ''
  MostrarTabla $t
}

# --- 2 ---------------------------------------------------------------------
Seccion '2. LO QUE HAY QUE LLENAR AL CREAR UNA CUENTA ABIERTA (tempcheques)' {
  Escribir '  Columnas que NO aceptan nulo, no tienen valor por defecto y no se'
  Escribir '  numeran solas. Un INSERT tiene que darles valor si o si.'
  Escribir ''
  $t = Consultar $cadena "
    SELECT c.name AS columna, ty.name AS tipo
    FROM sys.columns c
    JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    WHERE c.object_id = OBJECT_ID('dbo.tempcheques')
      AND c.is_nullable = 0 AND c.default_object_id = 0
      AND c.is_identity = 0 AND c.is_computed = 0
    ORDER BY c.column_id"
  MostrarTabla $t
}

# --- 3 ---------------------------------------------------------------------
foreach ($nombreTabla in @('tempcheqdet', 'direccionesdomicilio', 'clientes', 'productos', 'productosdelivery', 'chequespagos')) {
  $titulo = "3. COLUMNAS DE $nombreTabla"
  Seccion $titulo {
    $t = Consultar $cadena "
      SELECT c.name AS columna, ty.name AS tipo,
             CASE WHEN ty.name IN ('varchar','char') THEN CASE WHEN c.max_length = -1 THEN 'max' ELSE CAST(c.max_length AS varchar(10)) END
                  WHEN ty.name IN ('nvarchar','nchar') THEN CASE WHEN c.max_length = -1 THEN 'max' ELSE CAST(c.max_length / 2 AS varchar(10)) END
                  ELSE '' END AS largo,
             CASE WHEN c.is_nullable = 1 THEN 'si' ELSE 'NO' END AS acepta_nulo,
             CASE WHEN c.is_identity = 1 THEN 'SE NUMERA SOLA' ELSE '' END AS numeracion,
             ISNULL(LEFT(dc.definition, 30), '') AS por_defecto
      FROM sys.columns c
      JOIN sys.types ty ON ty.user_type_id = c.user_type_id
      LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
      WHERE c.object_id = OBJECT_ID('dbo.$nombreTabla')
      ORDER BY c.column_id"
    MostrarTabla $t
  }
}

# --- 4 ---------------------------------------------------------------------
Seccion '4. LLAVES PRIMARIAS E INDICES UNICOS' {
  Escribir '  Dicen que combinacion de campos no se puede repetir. Un folio'
  Escribir '  repetido, por ejemplo, haria fallar la caja o el INSERT.'
  Escribir ''
  $t = Consultar $cadena "
    SELECT OBJECT_NAME(i.object_id) AS tabla, i.name AS indice,
           CASE WHEN i.is_primary_key = 1 THEN 'PK' ELSE 'UNICO' END AS clase,
           STUFF((SELECT ', ' + c.name
                  FROM sys.index_columns ic
                  JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                  WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
                  ORDER BY ic.key_ordinal FOR XML PATH('')), 1, 2, '') AS columnas
    FROM sys.indexes i
    WHERE OBJECT_NAME(i.object_id) IN ($TABLAS)
      AND i.name IS NOT NULL AND (i.is_primary_key = 1 OR i.is_unique = 1)
    ORDER BY 1, 3, 2"
  MostrarTabla $t
}

Seccion '5. RELACIONES ENTRE TABLAS (llaves foraneas)' {
  $t = Consultar $cadena "
    SELECT OBJECT_NAME(fk.parent_object_id) AS tabla, fk.name AS restriccion,
           OBJECT_NAME(fk.referenced_object_id) AS apunta_a
    FROM sys.foreign_keys fk
    WHERE OBJECT_NAME(fk.parent_object_id) IN ($TABLAS)
       OR OBJECT_NAME(fk.referenced_object_id) IN ($TABLAS)
    ORDER BY 1, 2"
  MostrarTabla $t
}

# --- 6 ---------------------------------------------------------------------
Seccion '6. DISPARADORES (codigo que la base ejecuta sola al escribir)' {
  Escribir '  Primero todos, y despues el codigo de los que estan en las tablas'
  Escribir '  del pedido. Es donde viven las reglas que no se ven desde afuera.'
  Escribir ''
  $todos = Consultar $cadena "
    SELECT OBJECT_NAME(t.parent_id) AS tabla, t.name AS disparador,
           CASE WHEN t.is_disabled = 1 THEN 'APAGADO' ELSE 'activo' END AS estado
    FROM sys.triggers t WHERE t.parent_class = 1 ORDER BY 1, 2"
  Escribir ("  {0} disparadores en toda la base." -f $todos.Rows.Count)
  Escribir ''
  MostrarTabla $todos

  $claves = Consultar $cadena "
    SELECT OBJECT_NAME(t.parent_id) AS tabla, t.name AS disparador,
           OBJECT_DEFINITION(t.object_id) AS codigo
    FROM sys.triggers t
    WHERE t.parent_class = 1 AND OBJECT_NAME(t.parent_id) IN ($TABLAS)
    ORDER BY 1, 2"
  foreach ($r in $claves.Rows) {
    Escribir ('  --- ' + $r['tabla'] + ' / ' + $r['disparador'] + ' ---')
    if ($r['codigo'] -is [System.DBNull]) {
      Escribir '    (codigo no disponible: puede estar cifrado)'
    } else {
      $cod = ([string]$r['codigo']) -split "`r?`n"
      $max = [Math]::Min($cod.Count, 80)
      for ($i = 0; $i -lt $max; $i++) { Escribir ('    ' + $cod[$i]) }
      if ($cod.Count -gt $max) { Escribir ('    ... y {0} lineas mas' -f ($cod.Count - $max)) }
    }
    Escribir ''
  }
}

# --- 7 ---------------------------------------------------------------------
Seccion '7. PROCEDIMIENTOS, FUNCIONES Y VISTAS RELACIONADOS' {
  Escribir '  Solo los nombres, y el tamano del codigo (0 = esta cifrado o vacio).'
  Escribir ''
  $t = Consultar $cadena "
    SELECT o.name AS nombre,
           CASE o.type WHEN 'P' THEN 'procedimiento' WHEN 'V' THEN 'vista' ELSE 'funcion' END AS clase,
           ISNULL(LEN(OBJECT_DEFINITION(o.object_id)), 0) AS tamano_codigo
    FROM sys.objects o
    WHERE o.type IN ('P','FN','IF','TF','V') AND o.is_ms_shipped = 0
      AND (o.name LIKE '%cheq%' OR o.name LIKE '%orden%' OR o.name LIKE '%pedido%'
        OR o.name LIKE '%comanda%' OR o.name LIKE '%domicilio%' OR o.name LIKE '%folio%'
        OR o.name LIKE '%delivery%' OR o.name LIKE '%hub%' OR o.name LIKE '%esale%'
        OR o.name LIKE '%venta%' OR o.name LIKE '%cuenta%' OR o.name LIKE '%turno%')
    ORDER BY 2, 1"
  MostrarTabla $t
}

# --- 8 ---------------------------------------------------------------------
Seccion '8. COMO SE NUMERAN LOS PEDIDOS' {
  foreach ($nombreTabla in @('tempcheques', 'cheques')) {
    $r = Consultar $cadena "
      SELECT COUNT(*) AS filas,
             MIN(folio) AS folio_minimo, MAX(folio) AS folio_maximo,
             MIN(numcheque) AS numcheque_minimo, MAX(numcheque) AS numcheque_maximo
      FROM dbo.$nombreTabla"
    Escribir "  $nombreTabla"
    MostrarTabla $r
  }
  $id = Consultar $cadena "
    SELECT OBJECT_NAME(c.object_id) AS tabla, c.name AS columna_que_se_numera_sola
    FROM sys.columns c
    WHERE c.is_identity = 1 AND OBJECT_NAME(c.object_id) IN ($TABLAS)"
  Escribir '  Columnas que SE NUMERAN SOLAS en las tablas del pedido:'
  MostrarTabla $id
  $sec = Consultar $cadena "SELECT name AS secuencia FROM sys.sequences"
  Escribir '  Secuencias de SQL Server en la base:'
  MostrarTabla $sec
}

# --- 9 ---------------------------------------------------------------------
Seccion '9. HA METIDO PEDIDOS ALGUN SERVICIO EXTERNO ALGUNA VEZ?' {
  Escribir '  Cuenta cuantas cuentas traen valor en las columnas pensadas para'
  Escribir '  plataformas externas. Si salen numeros mayores que cero, este POS'
  Escribir '  ya ha recibido pedidos de afuera y se puede ver como se veian.'
  Escribir ''
  foreach ($nombreTabla in @('tempcheques', 'cheques')) {
    $r = Consultar $cadena "
      SELECT COUNT(*) AS cuentas,
             SUM(CASE WHEN ISNULL(appname, '') <> '' THEN 1 ELSE 0 END) AS con_appname,
             SUM(CASE WHEN ISNULL(orderreference, '') <> '' THEN 1 ELSE 0 END) AS con_orderreference,
             SUM(CASE WHEN ISNULL(paymentprovider, '') <> '' THEN 1 ELSE 0 END) AS con_paymentprovider,
             SUM(CASE WHEN ISNULL(salerestaurantid, '') <> '' THEN 1 ELSE 0 END) AS con_salerestaurantid,
             SUM(CASE WHEN ISNULL(idfoliohub, 0) <> 0 THEN 1 ELSE 0 END) AS con_idfoliohub,
             SUM(CASE WHEN ISNULL(estatushub, 0) <> 0 THEN 1 ELSE 0 END) AS con_estatushub,
             SUM(CASE WHEN ISNULL(callcenter, 0) <> 0 THEN 1 ELSE 0 END) AS con_callcenter
      FROM dbo.$nombreTabla"
    Escribir "  $nombreTabla"
    MostrarTabla $r
  }
  Escribir '  Nombres de plataforma, si los hay (no identifican a nadie):'
  $a = Consultar $cadena "
    SELECT TOP 10 appname AS plataforma, COUNT(*) AS cuentas
    FROM dbo.cheques WHERE ISNULL(appname, '') <> ''
    GROUP BY appname ORDER BY COUNT(*) DESC"
  MostrarTabla $a
}

# --- 10 --------------------------------------------------------------------
Seccion '10. QUIEN SOY PARA LA BASE, Y CUANTO PESA' {
  $p = Consultar $cadena "
    SELECT SUSER_SNAME() AS cuenta,
           IS_SRVROLEMEMBER('sysadmin') AS es_sysadmin,
           IS_MEMBER('db_owner') AS es_db_owner,
           IS_MEMBER('db_datawriter') AS puede_escribir_en_general,
           HAS_PERMS_BY_NAME('dbo.tempcheques', 'OBJECT', 'INSERT') AS insert_en_tempcheques"
  MostrarTabla $p
  $s = Consultar $cadena "
    SELECT CAST(SUM(size) * 8.0 / 1024 AS decimal(12,1)) AS megabytes_de_la_base
    FROM sys.database_files"
  Escribir '  Tamano de la base (para saber si cabe una copia de prueba):'
  MostrarTabla $s
}

Escribir '============================================================'
Escribir 'LISTO. El informe quedo en:'
Escribir "  $salida"
Escribir 'Mande ese archivo.'
Escribir '============================================================'

$lineas | Set-Content -Path $salida -Encoding utf8
