# =============================================================================
#  EXPLORAR LA BASE DE SOFT RESTAURANT
# =============================================================================
#
#  SE CORRE EN LA COMPUTADORA DEL POS, la que tiene instalado Soft Restaurant.
#  No hace falta instalar nada: usa lo que Windows ya trae.
#
#  La forma facil es hacer doble clic en EXPLORAR-POS.bat, que esta al lado.
#
#  QUE HACE
#  Busca el SQL Server de la maquina, encuentra la base de Soft Restaurant y
#  escribe un informe en salida-softrestaurant.txt, en esta misma carpeta.
#
#  ES DE SOLO LECTURA. No crea, no borra y no modifica nada: solo consulta los
#  catalogos del propio SQL Server. Se puede correr con el negocio trabajando.
#
#  NO SACA DATOS DE CLIENTES. Solo nombres de tablas y columnas, y cuantas
#  filas tiene cada una. Ni un nombre, ni un telefono, ni una direccion, ni un
#  monto. El archivo que se manda no lleva datos de nadie.
# =============================================================================

$ErrorActionPreference = 'Stop'
$salida = Join-Path $PSScriptRoot 'salida-softrestaurant.txt'
$lineas = New-Object System.Collections.Generic.List[string]

function Escribir($texto) {
  $lineas.Add($texto)
  Write-Host $texto
}

Escribir "INFORME DE LA BASE DE SOFT RESTAURANT"
Escribir ("Generado: " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Escribir ("Equipo:   " + $env:COMPUTERNAME)
Escribir ""

# --- 1. Encontrar las instancias de SQL Server de esta maquina ---------------
$instancias = @()
foreach ($llave in @(
    'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Microsoft SQL Server')) {
  try {
    $v = (Get-ItemProperty -Path $llave -Name 'InstalledInstances' -ErrorAction Stop).InstalledInstances
    foreach ($i in $v) { if ($instancias -notcontains $i) { $instancias += $i } }
  } catch { }
}

if ($instancias.Count -eq 0) {
  Escribir "NO SE ENCONTRO SQL SERVER EN ESTA COMPUTADORA."
  Escribir ""
  Escribir "Puede ser que este en otra maquina de la red (un servidor), o que"
  Escribir "Soft Restaurant guarde sus datos en otro lado. Avise de esto."
  $lineas | Set-Content -Path $salida -Encoding utf8
  Write-Host ""
  Write-Host "Informe escrito en: $salida"
  return
}

$servidores = @()
foreach ($i in $instancias) {
  if ($i -eq 'MSSQLSERVER') { $servidores += '.' } else { $servidores += ".\$i" }
}
Escribir ("Instancias de SQL Server encontradas: " + ($instancias -join ', '))
Escribir ""

# --- 2. Buscar la base de Soft Restaurant en cada instancia -----------------
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
    return $tabla
  } finally { $con.Close() }
}

function ComoTexto($tabla, $columnas) {
  if ($tabla.Rows.Count -eq 0) { return @('  (ninguna)') }
  $filas = @()
  $filas += ('  ' + (($columnas | ForEach-Object { $_.PadRight(26) }) -join ''))
  $filas += ('  ' + ('-' * (26 * $columnas.Count)))
  foreach ($r in $tabla.Rows) {
    $celdas = @()
    foreach ($c in $columnas) {
      $valor = [string]$r[$c]
      if ($valor.Length -gt 25) { $valor = $valor.Substring(0, 25) }
      $celdas += $valor.PadRight(26)
    }
    $filas += ('  ' + ($celdas -join ''))
  }
  return $filas
}

$encontrada = $false
foreach ($servidor in $servidores) {
  $base = "Server=$servidor;Integrated Security=True;Connect Timeout=10;TrustServerCertificate=True"
  try {
    $bases = Consultar "$base;Database=master" "
      SELECT name FROM sys.databases
      WHERE database_id > 4
      ORDER BY CASE WHEN name LIKE '%soft%' THEN 0 ELSE 1 END, name"
  } catch {
    Escribir "No se pudo conectar a $servidor : $($_.Exception.Message)"
    continue
  }

  Escribir "SERVIDOR $servidor"
  Escribir ("  bases: " + (($bases.Rows | ForEach-Object { $_['name'] }) -join ', '))
  Escribir ""

  foreach ($fila in $bases.Rows) {
    $nombre = [string]$fila['name']
    if ($nombre -notlike '*soft*' -and $nombre -notlike '*restaur*') { continue }
    $encontrada = $true
    $cadena = "$base;Database=$nombre"

    Escribir "============================================================"
    Escribir "BASE: $nombre"
    Escribir "============================================================"
    Escribir ""

    $version = Consultar $cadena "
      SELECT CONVERT(varchar(128), SERVERPROPERTY('ProductVersion')) AS version,
             CONVERT(varchar(128), SERVERPROPERTY('Edition'))        AS edicion"
    Escribir ("Version de SQL Server: " + $version.Rows[0]['version'] + '  ' + $version.Rows[0]['edicion'])
    Escribir ""

    Escribir "1. TABLAS, DE LA MAS GRANDE A LA MAS CHICA"
    $tablas = Consultar $cadena "
      SELECT TOP 60 t.name AS tabla,
             SUM(CASE WHEN p.index_id < 2 THEN p.row_count ELSE 0 END) AS filas
      FROM sys.tables t
      LEFT JOIN sys.dm_db_partition_stats p ON p.object_id = t.object_id
      GROUP BY t.name ORDER BY filas DESC"
    ComoTexto $tablas @('tabla', 'filas') | ForEach-Object { Escribir $_ }
    Escribir ""

    Escribir "2. COLUMNAS DE FECHA Y HORA  (aqui esta la hora del pedido)"
    $fechas = Consultar $cadena "
      SELECT t.name AS tabla, c.name AS columna, ty.name AS tipo
      FROM sys.columns c
      JOIN sys.tables t  ON t.object_id = c.object_id
      JOIN sys.types ty  ON ty.user_type_id = c.user_type_id
      WHERE ty.name IN ('datetime','datetime2','smalldatetime','date','time','datetimeoffset')
      ORDER BY t.name, c.column_id"
    ComoTexto $fechas @('tabla', 'columna', 'tipo') | ForEach-Object { Escribir $_ }
    Escribir ""

    Escribir "3. COLUMNAS DE LAS TABLAS DE PEDIDOS, CUENTAS Y CLIENTES"
    $pedidos = Consultar $cadena "
      SELECT t.name AS tabla, c.name AS columna, ty.name AS tipo
      FROM sys.columns c
      JOIN sys.tables t  ON t.object_id = c.object_id
      JOIN sys.types ty  ON ty.user_type_id = c.user_type_id
      WHERE t.name LIKE '%cheq%' OR t.name LIKE '%orden%' OR t.name LIKE '%pedido%'
         OR t.name LIKE '%client%' OR t.name LIKE '%domicil%' OR t.name LIKE '%repart%'
         OR t.name LIKE '%mesero%' OR t.name LIKE '%folio%'
      ORDER BY t.name, c.column_id"
    ComoTexto $pedidos @('tabla', 'columna', 'tipo') | ForEach-Object { Escribir $_ }
    Escribir ""

    Escribir "4. LLAVES PRIMARIAS  (como se identifica un pedido sin repetirlo)"
    $llaves = Consultar $cadena "
      SELECT t.name AS tabla, c.name AS columna
      FROM sys.indexes i
      JOIN sys.tables t         ON t.object_id = i.object_id
      JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      JOIN sys.columns c        ON c.object_id = ic.object_id AND c.column_id = ic.column_id
      WHERE i.is_primary_key = 1
      ORDER BY t.name, ic.key_ordinal"
    ComoTexto $llaves @('tabla', 'columna') | ForEach-Object { Escribir $_ }
    Escribir ""
  }
}

if (-not $encontrada) {
  Escribir "NO SE ENCONTRO NINGUNA BASE QUE SE LLAME COMO SOFT RESTAURANT."
  Escribir "Arriba esta la lista de las bases que si hay. Avise cual es la buena."
}

$lineas | Set-Content -Path $salida -Encoding utf8
Write-Host ""
Write-Host "============================================================"
Write-Host "LISTO. El informe quedo en:"
Write-Host "  $salida"
Write-Host "Mande ese archivo."
Write-Host "============================================================"
