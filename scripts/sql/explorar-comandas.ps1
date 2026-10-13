<#
  COMO SALE UNA COMANDA, Y COMO SE CALCULA UNA CUENTA

  PARA QUE SIRVE

  El informe anterior mostro que la base del POS es un deposito sin reglas:
  ningun disparador en las tablas del pedido, ningun campo obligatorio. Eso
  quiere decir que las reglas viven en el PROGRAMA del POS, no en la base, y que
  para escribir un pedido a mano hay que copiar lo que el programa hace.

  Faltan dos cosas por ver:

  1. COMO SALE LA COMANDA. Cada renglon de una cuenta tiene una bandera,
     comanda_impresa, que por defecto vale 1 (ya impresa). Es la pista de que el
     programa imprime los renglones que la traen en 0. Aqui se miran las tablas
     de impresion, de monitores de cocina y de areas, y como quedan los renglones
     de una cuenta real.
  2. COMO SE CALCULAN LOS TOTALES. La cuenta guarda subtotal, impuesto y total
     ya hechos, y la base tiene vistas que los calculan. Hay que ver el codigo de
     esas vistas para que un pedido escrito desde afuera cuadre al centavo con uno
     hecho en la caja.

  NO SACA DATOS DE CLIENTES. De los renglones de una cuenta se imprimen codigos
  de producto, cantidades, precios y banderas, nunca comentarios ni nombres. De
  las tablas de configuracion solo se listan los nombres de las columnas, porque
  sus valores pueden traer claves.

  NO ESCRIBE NADA. Solo lee. Se puede correr con el negocio trabajando.
#>

param(
  [string]$Instancia = '.\NATIONALSOFT',
  [string]$Base = '',
  [switch]$Probar
)

$ErrorActionPreference = 'Stop'
$salida = Join-Path $PSScriptRoot 'salida-comandas.txt'
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

<# Una DataTable con las columnas alineadas, del ancho justo. #>
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
           elseif ($v -is [byte[]]) { '(binario)' }
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

<# Una seccion: si falla, se dice y se sigue con la siguiente. #>
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

<# Imprime el codigo de una vista o procedimiento, hasta cierto largo. #>
function MostrarCodigo($cadena, $nombre) {
  $r = Consultar $cadena "SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.$nombre')) AS codigo"
  Escribir "  --- $nombre ---"
  if ($r.Rows.Count -eq 0 -or $r.Rows[0]['codigo'] -is [System.DBNull]) {
    Escribir '    (codigo no disponible: puede estar cifrado)'
    Escribir ''
    return
  }
  $cod = ([string]$r.Rows[0]['codigo']) -split "`r?`n"
  $max = [Math]::Min($cod.Count, 150)
  for ($i = 0; $i -lt $max; $i++) { Escribir ('    ' + $cod[$i]) }
  if ($cod.Count -gt $max) { Escribir ('    ... y {0} lineas mas' -f ($cod.Count - $max)) }
  Escribir ''
}

<# Las columnas de una tabla: nombre, tipo, si acepta nulo y su valor por defecto. #>
function MostrarColumnas($cadena, $tabla) {
  $t = Consultar $cadena "
    SELECT c.name AS columna, ty.name AS tipo,
           CASE WHEN c.is_nullable = 1 THEN 'si' ELSE 'NO' END AS acepta_nulo,
           CASE WHEN c.is_identity = 1 THEN 'SE NUMERA SOLA' ELSE '' END AS numeracion,
           ISNULL(LEFT(dc.definition, 30), '') AS por_defecto
    FROM sys.columns c
    JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
    WHERE c.object_id = OBJECT_ID('dbo.$tabla')
    ORDER BY c.column_id"
  MostrarTabla $t
}

if ($Probar) {
  $ok = 0
  function Comprobar($que, $real, $esperado) {
    if ("$real" -eq "$esperado") { $script:ok += 1; Write-Host "OK    $que" }
    else { Write-Host "MAL   $que  ($real != $esperado)"; exit 1 }
  }
  $dt = New-Object System.Data.DataTable
  [void]$dt.Columns.Add('a')
  [void]$dt.Columns.Add('b', [byte[]])
  $f = $dt.NewRow(); $f['a'] = 'uno'; $f['b'] = [byte[]](1, 2, 3); $dt.Rows.Add($f)
  $antes = $lineas.Count
  MostrarTabla $dt
  $nuevas = @($lineas[$antes..($lineas.Count - 1)])
  Comprobar 'una columna binaria no revienta' ([bool]($nuevas[2] -match '\(binario\)')) 'True'
  Comprobar 'el encabezado lleva los nombres' ([bool]($nuevas[0] -match 'a\s+b')) 'True'
  $antes = $lineas.Count
  Seccion 'PRUEBA' { throw 'fallo a proposito' }
  $texto = ($lineas[$antes..($lineas.Count - 1)]) -join "`n"
  Comprobar 'una seccion que falla no tumba el informe' ([bool]($texto -match 'No se pudo leer esta parte: fallo a proposito')) 'True'
  Write-Host ''
  Write-Host "Todo bien ($ok comprobaciones)."
  exit 0
}

Escribir ''
Escribir 'COMO SALE UNA COMANDA, Y COMO SE CALCULA UNA CUENTA'
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

# --- 1. Como quedan los renglones de una cuenta real -------------------------
Seccion '1. LOS RENGLONES DE LAS ULTIMAS CUENTAS ABIERTAS' {
  Escribir '  Codigos, cantidades, precios y banderas. Nunca comentarios ni nombres.'
  Escribir '  Mire sobre todo comanda, comanda_impresa, idestacion, estadomonitor.'
  Escribir ''
  $t = Consultar $cadena "
    SELECT d.foliodet AS cuenta, d.movimiento, d.comanda, d.cantidad, d.idproducto,
           d.precio, d.impuesto1, d.preciosinimpuestos, d.hora,
           d.modificador, d.mitad, d.idestacion, d.idmeseroproducto,
           d.comanda_impresa, d.estadomonitor, d.folioproduccion, d.nivel,
           d.productocompuestoprincipal, d.idproductocompuesto, d.procesadosrx
    FROM dbo.tempcheqdet d
    WHERE d.foliodet IN (SELECT TOP 4 foliodet FROM dbo.tempcheqdet
                         GROUP BY foliodet ORDER BY MAX(hora) DESC)
    ORDER BY d.foliodet DESC, d.movimiento"
  MostrarTabla $t
}

Seccion '2. LO QUE CAMBIA ENTRE UNA CUENTA ABIERTA Y UNA CERRADA (renglones)' {
  $t = Consultar $cadena "
    SELECT 'solo en tempcheqdet' AS donde, c.name AS columna
    FROM sys.columns c WHERE c.object_id = OBJECT_ID('dbo.tempcheqdet')
      AND c.name NOT IN (SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('dbo.cheqdet'))
    UNION ALL
    SELECT 'solo en cheqdet', c.name
    FROM sys.columns c WHERE c.object_id = OBJECT_ID('dbo.cheqdet')
      AND c.name NOT IN (SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('dbo.tempcheqdet'))"
  MostrarTabla $t
}

# --- 3. Impresion, cocina y areas ------------------------------------------
Seccion '3. TABLAS DE IMPRESION, COCINA Y AREAS (que contienen)' {
  foreach ($nombreTabla in @('comandosimpresion', 'monitoresproduccion', 'folios', 'tipopedido', 'zonasdomicilio', 'formasdepago')) {
    Escribir "  --- $nombreTabla ---"
    try { MostrarTabla (Consultar $cadena "SELECT * FROM dbo.$nombreTabla") }
    catch { Escribir ('    no se pudo leer: ' + $_.Exception.Message); Escribir '' }
  }
}

Seccion '4. COLUMNAS DE LAS TABLAS QUE INTERVIENEN EN LA COMANDA' {
  Escribir '  Solo los nombres de las columnas, no sus valores.'
  Escribir ''
  foreach ($nombreTabla in @('comandas', 'grupos', 'productosdetalle', 'productosmonitores',
                             'estacionesareas', 'areasrestaurant', 'estaciones',
                             'pedidos', 'pedidosdetalle', 'cheqpedidos', 'tempcheqpedidos',
                             'tempchequespagos', 'ws_cloud', 'configuracion_kds')) {
    Escribir "  --- $nombreTabla ---"
    try { MostrarColumnas $cadena $nombreTabla }
    catch { Escribir ('    no se pudo leer: ' + $_.Exception.Message); Escribir '' }
  }
}

# --- 5. El codigo que calcula los totales -----------------------------------
Seccion '5. EL CODIGO QUE CALCULA LOS TOTALES Y VERIFICA EL TURNO' {
  foreach ($objeto in @('vwcalculatempcheques', 'vwcalculacheques', 'VerificaTurno')) {
    try { MostrarCodigo $cadena $objeto }
    catch { Escribir ('  no se pudo leer ' + $objeto + ': ' + $_.Exception.Message); Escribir '' }
  }
}

# --- 6. Que registra el POS en su bitacora ----------------------------------
Seccion '6. QUE ANOTA EL POS EN SU BITACORA (tipos de evento, sin textos)' {
  Escribir '  Muestra las columnas de la bitacora y, de las que parecen un tipo de'
  Escribir '  evento, cuantas veces aparece cada valor. Dice que hace el POS cuando'
  Escribir '  imprime una comanda o recibe un pedido.'
  Escribir ''
  MostrarColumnas $cadena 'bitacorasistema'
  $cols = Consultar $cadena "
    SELECT c.name AS nombre FROM sys.columns c
    JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    WHERE c.object_id = OBJECT_ID('dbo.bitacorasistema')
      AND ty.name IN ('varchar','nvarchar','char','nchar') AND c.max_length <= 120"
  foreach ($fila in $cols.Rows) {
    $nombre = [string]$fila['nombre']
    if ($nombre -match 'evento|accion|tipo|modulo|formulario|proceso|movimiento') {
      Escribir "  Valores de $nombre :"
      MostrarTabla (Consultar $cadena "
        SELECT TOP 40 [$nombre] AS valor, COUNT(*) AS veces
        FROM dbo.bitacorasistema GROUP BY [$nombre] ORDER BY COUNT(*) DESC")
    }
  }
}

Escribir '============================================================'
Escribir 'LISTO. El informe quedo en:'
Escribir "  $salida"
Escribir 'Mande ese archivo.'
Escribir '============================================================'

$lineas | Set-Content -Path $salida -Encoding utf8
