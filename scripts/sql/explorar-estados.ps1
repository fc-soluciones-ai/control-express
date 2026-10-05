<#
  COMO MARCA EL POS QUE UN PEDIDO SE DESPACHO

  LA PREGUNTA

  El tablero saca un pedido de la lista cuando se despacha. Hoy eso se decide
  por `salidarepartidor`, pero hay varias columnas mas que podrian ser la
  marca de verdad: `impreso`, `comandaimpresa`, `status_domicilio`,
  `esalestatus`, `statusSR` y alguna otra. Si el POS cambia una de esas en el
  momento en que el cajero manda el pedido, esa es la buena.

  Este informe cruza todas esas columnas contra la hora de salida y contra la
  de llegada, en las cuentas abiertas de hoy y en las cerradas de la ultima
  semana. Con eso se ve cual se mueve junto con el despacho y cual no.

  NO SACA DATOS DE CLIENTES. Solo numeros, banderas y horas.

  Se puede correr con el negocio trabajando. Solo lee.
#>

param(
  [string]$Instancia = '.\NATIONALSOFT',
  [string]$Base = '',
  [switch]$Probar
)

$ErrorActionPreference = 'Stop'
$salida = Join-Path $PSScriptRoot 'salida-estados.txt'
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

function Tabla($datos, $columnas) {
  Escribir ('  ' + (($columnas | ForEach-Object { $_.PadRight(22) }) -join ''))
  Escribir ('  ' + ('-' * (22 * $columnas.Count)))
  foreach ($fila in $datos.Rows) {
    $celdas = @()
    foreach ($c in $columnas) {
      $v = $fila[$c]
      $texto = if ($v -is [System.DBNull]) { '' }
               elseif ($v -is [datetime]) { $v.ToString('HH:mm:ss') }
               else { [string]$v }
      $celdas += $texto.PadRight(22)
    }
    Escribir ('  ' + ($celdas -join ''))
  }
  Escribir ''
}

<# Las columnas de estado que vale la pena mirar, si existen en esta version. #>
$CANDIDATAS = @(
  'impreso', 'impresiones', 'comandaimpresa', 'status_domicilio',
  'esalestatus', 'statusSR', 'foodorder', 'estatushub', 'sistema_envio',
  'enviado', 'enviopagado', 'pedidovistosrx', 'ChangeStatusSRX',
  'tipodeservicio', 'pagado', 'cancelado', 'cuentaenuso'
)

if ($Probar) {
  $ok = 0
  function Comprobar($que, $real, $esperado) {
    if ("$real" -eq "$esperado") { $script:ok += 1; Write-Host "OK    $que" }
    else { Write-Host "MAL   $que  ($real != $esperado)"; exit 1 }
  }
  Comprobar 'se mira el impreso' ($CANDIDATAS -contains 'impreso') 'True'
  Comprobar 'y el estado del domicilio' ($CANDIDATAS -contains 'status_domicilio') 'True'
  Comprobar 'y la comanda' ($CANDIDATAS -contains 'comandaimpresa') 'True'
  Comprobar 'no se mira ninguna columna de texto' ($CANDIDATAS -contains 'nombre') 'False'
  Write-Host ''
  Write-Host "Todo bien ($ok comprobaciones)."
  exit 0
}

Escribir ''
Escribir 'COMO MARCA EL POS QUE UN PEDIDO SE DESPACHO'
Escribir ("Generado: " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Escribir ("Equipo:   " + $env:COMPUTERNAME)
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
$cadena = "$raiz;Database=$Base"
Escribir "Base: $Base"
Escribir ''

<# Cuales de las candidatas existen de verdad en una tabla. #>
function ColumnasQueHay($tabla) {
  $hay = Consultar $cadena "
    SELECT COLUMN_NAME AS nombre FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = '$tabla' AND TABLE_SCHEMA = 'dbo'"
  $nombres = @()
  foreach ($f in $hay.Rows) { $nombres += [string]$f['nombre'] }
  $buenas = @()
  foreach ($c in $CANDIDATAS) { if ($nombres -contains $c) { $buenas += $c } }
  return ,$buenas
}

# --- 1. Las cuentas abiertas de hoy, una por una ----------------------------
Escribir '============================================================'
Escribir '1. LAS CUENTAS ABIERTAS DE HOY, UNA POR UNA'
Escribir '============================================================'
Escribir ''
Escribir '  Mire que columna cambia justo cuando aparece la hora de salida.'
Escribir ''

$cols = ColumnasQueHay 'tempcheques'
$lista = (($cols | ForEach-Object { "[$_]" }) -join ', ')
$abiertas = Consultar $cadena "
  SELECT TOP 25 folio, fecha, salidarepartidor AS salio, arriborepartidor AS llego,
         cierre, $lista
  FROM dbo.tempcheques
  WHERE fecha >= CAST(CAST(GETDATE() AS date) AS datetime)
  ORDER BY fecha DESC"

if ($abiertas.Rows.Count -eq 0) {
  Escribir '  No hay ninguna cuenta abierta de hoy en este momento.'
  Escribir ''
} else {
  Tabla $abiertas (@('folio', 'fecha', 'salio', 'llego', 'cierre') + $cols)
}

# --- 2. Que valores toma cada columna, y si acompañan a la salida -----------
Escribir '============================================================'
Escribir '2. CADA COLUMNA CONTRA LA HORA DE SALIDA (ultimos 7 dias)'
Escribir '============================================================'
Escribir ''
Escribir '  Si una columna es la marca del despacho, todos los de un valor'
Escribir '  tienen salida y todos los del otro no.'
Escribir ''

$colsCheques = ColumnasQueHay 'cheques'
foreach ($c in $colsCheques) {
  $r = Consultar $cadena "
    SELECT [$c] AS valor,
           COUNT(*) AS pedidos,
           SUM(CASE WHEN salidarepartidor IS NOT NULL THEN 1 ELSE 0 END) AS con_salida,
           SUM(CASE WHEN arriborepartidor IS NOT NULL THEN 1 ELSE 0 END) AS con_llegada
    FROM dbo.cheques
    WHERE fecha >= DATEADD(day, -7, GETDATE())
    GROUP BY [$c]
    ORDER BY [$c]"
  if ($r.Rows.Count -le 1) {
    $unico = if ($r.Rows.Count -eq 1) { [string]$r.Rows[0]['valor'] } else { '(nada)' }
    Escribir ("  {0,-24} siempre vale {1}: no sirve para distinguir" -f $c, $unico)
    continue
  }
  Escribir ("  --- $c ---")
  Tabla $r @('valor', 'pedidos', 'con_salida', 'con_llegada')
}

# --- 3. Cuanto tardan en salir ----------------------------------------------
Escribir '============================================================'
Escribir '3. CUANTO TARDA UN PEDIDO EN SALIR (ultimos 7 dias)'
Escribir '============================================================'
Escribir ''

$tiempos = Consultar $cadena "
  SELECT COUNT(*) AS pedidos,
         SUM(CASE WHEN salidarepartidor IS NULL THEN 1 ELSE 0 END) AS sin_salida,
         MIN(DATEDIFF(minute, fecha, salidarepartidor)) AS minimo,
         AVG(CASE WHEN DATEDIFF(minute, fecha, salidarepartidor) BETWEEN 0 AND 240
                  THEN DATEDIFF(minute, fecha, salidarepartidor) END) AS promedio,
         MAX(CASE WHEN DATEDIFF(minute, fecha, salidarepartidor) < 240
                  THEN DATEDIFF(minute, fecha, salidarepartidor) END) AS maximo
  FROM dbo.cheques
  WHERE fecha >= DATEADD(day, -7, GETDATE()) AND iddireccion IS NOT NULL"
Tabla $tiempos @('pedidos', 'sin_salida', 'minimo', 'promedio', 'maximo')

Escribir '  Ese promedio es el numero que el tablero tiene que bajar.'
Escribir ''
Escribir '============================================================'
Escribir 'LISTO. El informe quedo en:'
Escribir "  $salida"
Escribir 'Mande ese archivo.'
Escribir '============================================================'

$lineas | Set-Content -Path $salida -Encoding utf8
