<#
  LAS CUENTAS ABIERTAS DEL POS

  POR QUE HIZO FALTA ESTO

  El agente lee dbo.cheques, y durante semanas se creyo que ahi estaban todos
  los pedidos. No lo estan: en Soft Restaurant, un pedido vive en
  dbo.tempcheques mientras esta ABIERTO, y solo se pasa a dbo.cheques cuando se
  CIERRA, es decir cuando ya se cobro.

  Eso significa que el tablero de entregas, leyendo cheques, nunca puede ver un
  pedido pendiente: para cuando aparece ahi, el repartidor ya volvio. Por eso
  los 256 pedidos que llegaron estaban todos entregados o cancelados.

  Se descubrio corriendo el explorador dos veces con nueve minutos de
  diferencia: cheques se quedo clavado en 83.665 y tempcheques subio de 69 a
  70. El negocio estaba trabajando; lo que pasa es que estabamos mirando la
  tabla equivocada.

  Este informe saca lo que hace falta para arreglar el agente: como se llaman
  las columnas de tempcheques y que tan vivas estan.

  NO SACA DATOS DE CLIENTES. De las columnas de texto se imprime el NOMBRE,
  nunca el contenido: ahi viven el nombre, el telefono y la direccion de quien
  pidio, y este archivo se manda por chat. De las columnas de fecha y de numero
  si se muestran valores, porque son folios, horas y montos.

  Se puede correr con el negocio trabajando. Solo lee.
#>

param(
  [string]$Instancia = '.\NATIONALSOFT',
  [string]$Base = '',
  [switch]$Probar
)

$ErrorActionPreference = 'Stop'
$salida = Join-Path $PSScriptRoot 'salida-pendientes.txt'
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
  Los tipos cuyo contenido se puede mostrar sin riesgo.

  Fechas, numeros y banderas. Todo lo que sea texto queda fuera por defecto:
  en esta tabla las columnas de texto son el nombre del cliente, su telefono y
  su direccion.
#>
$TIPOS_SEGUROS = @(
  'datetime', 'datetime2', 'smalldatetime', 'date', 'time',
  'int', 'bigint', 'smallint', 'tinyint', 'bit',
  'money', 'smallmoney', 'decimal', 'numeric', 'float', 'real'
)

if ($Probar) {
  $ok = 0
  $mal = 0
  function Comprobar($que, $real, $esperado) {
    if ("$real" -eq "$esperado") { $script:ok += 1; Write-Host "OK    $que" }
    else { $script:mal += 1; Write-Host "MAL   $que  ($real != $esperado)" }
  }
  Comprobar 'datetime es un tipo seguro' ($TIPOS_SEGUROS -contains 'datetime') 'True'
  Comprobar 'int tambien' ($TIPOS_SEGUROS -contains 'int') 'True'
  Comprobar 'varchar NO lo es' ($TIPOS_SEGUROS -contains 'varchar') 'False'
  Comprobar 'nvarchar tampoco' ($TIPOS_SEGUROS -contains 'nvarchar') 'False'
  Comprobar 'ni text' ($TIPOS_SEGUROS -contains 'text') 'False'
  Write-Host ''
  if ($mal -eq 0) { Write-Host "Todo bien ($ok comprobaciones)." } else { Write-Host "$mal fallas"; exit 1 }
  exit 0
}

Escribir ''
Escribir 'LAS CUENTAS ABIERTAS DEL POS'
Escribir ("Generado: " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Escribir ("Equipo:   " + $env:COMPUTERNAME)
Escribir ''

$raiz = "Server=$Instancia;Integrated Security=SSPI;TrustServerCertificate=True;Connect Timeout=15"

# --- Elegir la base ---------------------------------------------------------
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

# --- 1. Cuanto hay en cada tabla, y de cuando -------------------------------
Escribir '============================================================'
Escribir '1. ABIERTAS CONTRA CERRADAS'
Escribir '============================================================'
Escribir ''

foreach ($t in @('tempcheques', 'cheques')) {
  if ((Consultar $cadena "SELECT CASE WHEN OBJECT_ID('dbo.$t','U') IS NULL THEN 0 ELSE 1 END AS hay").Rows[0]['hay'] -eq 0) {
    Escribir ("  {0,-16} no existe" -f $t)
    continue
  }
  $r = Consultar $cadena "
    SELECT COUNT(*) AS filas,
           ISNULL(CONVERT(varchar(19), MIN(fecha), 120), '') AS primera,
           ISNULL(CONVERT(varchar(19), MAX(fecha), 120), '') AS ultima
    FROM dbo.$t"
  Escribir ("  {0,-16} {1,8} filas   de {2}   a {3}" -f `
    $t, $r.Rows[0]['filas'], $r.Rows[0]['primera'], $r.Rows[0]['ultima'])
}
Escribir ''
Escribir '  Si tempcheques trae la fecha de hoy y cheques no, confirmado:'
Escribir '  los pedidos en curso viven en tempcheques.'
Escribir ''

# --- 2. Las columnas de tempcheques -----------------------------------------
Escribir '============================================================'
Escribir '2. COLUMNAS DE tempcheques'
Escribir '============================================================'
Escribir ''
Escribir '  (de las de texto se muestra el nombre, nunca el contenido)'
Escribir ''

$cols = Consultar $cadena "
  SELECT COLUMN_NAME AS nombre, DATA_TYPE AS tipo,
         ISNULL(CHARACTER_MAXIMUM_LENGTH, 0) AS largo
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'tempcheques' AND TABLE_SCHEMA = 'dbo'
  ORDER BY ORDINAL_POSITION"

foreach ($c in $cols.Rows) {
  $tipo = [string]$c['tipo']
  $marca = if ($TIPOS_SEGUROS -contains $tipo) { ' ' } else { '*' }
  Escribir ("  {0} {1,-32} {2}" -f $marca, $c['nombre'], $tipo)
}
Escribir ''
Escribir '  * = columna de texto. No se muestra su contenido.'
Escribir ''

# --- 3. Las ultimas filas, solo con lo que no identifica a nadie -------------
Escribir '============================================================'
Escribir '3. LAS 10 CUENTAS ABIERTAS MAS RECIENTES'
Escribir '============================================================'
Escribir ''

$seguras = @()
foreach ($c in $cols.Rows) {
  if ($TIPOS_SEGUROS -contains [string]$c['tipo']) { $seguras += [string]$c['nombre'] }
}

if ($seguras.Count -eq 0) {
  Escribir '  No hay ninguna columna que se pueda mostrar sin riesgo.'
} else {
  $lista = ($seguras | ForEach-Object { "[$_]" }) -join ', '
  $filas = Consultar $cadena "SELECT TOP 10 $lista FROM dbo.tempcheques ORDER BY fecha DESC"

  foreach ($fila in $filas.Rows) {
    Escribir '  ---'
    foreach ($col in $seguras) {
      $v = $fila[$col]
      if ($v -is [System.DBNull]) { continue }
      $texto = if ($v -is [datetime]) { $v.ToString('yyyy-MM-dd HH:mm:ss') } else { [string]$v }
      if ($texto.Trim() -eq '') { continue }
      Escribir ("    {0,-30} {1}" -f $col, $texto)
    }
  }
}

Escribir ''
Escribir '============================================================'
Escribir 'LISTO. El informe quedo en:'
Escribir "  $salida"
Escribir 'Mande ese archivo.'
Escribir '============================================================'

$lineas | Set-Content -Path $salida -Encoding utf8
