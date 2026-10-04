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

#  AUTOPRUEBA
#  Correrlo con -Probar no toca ninguna base: arma tablas de mentira y
#  comprueba el armado del informe. Existe porque este script se ejecuta en
#  una computadora a la que no tenemos acceso, y una falla tonta significa
#  hacer volver a alguien al local. Correrla antes de mandar una version nueva.
# =============================================================================

param([switch]$Probar)

$ErrorActionPreference = 'Stop'
$salida = Join-Path $PSScriptRoot 'salida-softrestaurant.txt'
$lineas = New-Object System.Collections.Generic.List[string]

function Escribir($texto) {
  $lineas.Add($texto)
  if (-not $Probar) { Write-Host $texto }
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
    # La coma de adelante es obligatoria. Sin ella PowerShell desarma la tabla
    # al devolverla y quien la recibe se queda con las filas sueltas, de modo
    # que .Rows resulta nulo y revienta en la primera linea que lo use.
    return ,$tabla
  } finally { $con.Close() }
}

function ComoTexto($tabla, $columnas) {
  if ($null -eq $tabla -or $null -eq $tabla.Rows -or $tabla.Rows.Count -eq 0) {
    return @('  (ninguna)')
  }
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

if ($Probar) {
  $fallos = 0
  function Comprobar($descripcion, $real, $esperado) {
    if ("$real" -eq "$esperado") {
      Write-Host "OK    $descripcion"
    } else {
      Write-Host "FALLA $descripcion"
      Write-Host "        esperado: $esperado"
      Write-Host "        obtenido: $real"
      $script:fallos = $script:fallos + 1
    }
  }

  # Una tabla devuelta por una funcion: el error que rompio la primera version.
  function TablaDeMentira {
    $t = New-Object System.Data.DataTable
    [void]$t.Columns.Add('name')
    [void]$t.Rows.Add('softrestaurant95pro')
    [void]$t.Rows.Add('otra')
    return ,$t
  }

  $t = TablaDeMentira
  Comprobar 'la tabla vuelve entera y no en filas sueltas' $t.GetType().Name 'DataTable'
  Comprobar 'y se le puede leer .Rows' $t.Rows.Count 2

  $nombres = @()
  foreach ($f in $t.Rows) { $nombres += [string]$f['name'] }
  Comprobar 'se sacan los nombres de las bases' ($nombres -join ',') 'softrestaurant95pro,otra'

  $vacia = New-Object System.Data.DataTable
  [void]$vacia.Columns.Add('tabla')
  Comprobar 'una consulta sin filas no revienta' (ComoTexto $vacia @('tabla')) '  (ninguna)'
  Comprobar 'una tabla nula tampoco' (ComoTexto $null @('tabla')) '  (ninguna)'

  $con = New-Object System.Data.DataTable
  [void]$con.Columns.Add('tabla')
  [void]$con.Columns.Add('filas')
  [void]$con.Rows.Add('cheques', '48213')
  $texto = ComoTexto $con @('tabla', 'filas')
  Comprobar 'con filas salen encabezado, raya y el dato' $texto.Count 3
  Comprobar 'y el dato va en la ultima linea' ($texto[2].Trim() -replace '\s+', ' ') 'cheques 48213'

  Write-Host ''
  if ($fallos -eq 0) { Write-Host 'Todo bien.' } else { Write-Host "$fallos fallas"; exit 1 }
  exit 0
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

  $nombres = @()
  if ($null -ne $bases -and $null -ne $bases.Rows) {
    foreach ($f in $bases.Rows) { $nombres += [string]$f['name'] }
  }

  Escribir "SERVIDOR $servidor"
  Escribir ("  bases: " + ($nombres -join ', '))
  Escribir ""

  foreach ($nombre in $nombres) {
    # Si en el servidor hay una sola base de usuario, es esa aunque se llame
    # de otra forma: no vale la pena hacer volver a nadie por el nombre.
    $esLaBuena = ($nombre -like '*soft*') -or ($nombre -like '*restaur*') -or ($nombres.Count -eq 1)
    if (-not $esLaBuena) { continue }
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
