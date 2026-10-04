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
#  Busca el SQL Server de la maquina, revisa TODAS sus bases para ver en cual
#  estan las ventas de verdad, y escribe un informe en
#  salida-softrestaurant.txt, en esta misma carpeta.
#
#  Ademas mide cuanto tarda un pedido en cada etapa: cuanto en la cocina,
#  cuanto esperando repartidor y cuanto en la calle.
#
#  ES DE SOLO LECTURA. No crea, no borra y no modifica nada. Se puede correr
#  con el negocio trabajando, en plena hora pico.
#
#  NO SACA DATOS DE CLIENTES. Nombres de tablas, nombres de columnas, cuentas
#  y promedios. Ni un nombre, ni un telefono, ni una direccion, ni un monto de
#  una venta. El archivo que se manda no lleva datos de nadie.
#
#  AUTOPRUEBA
#  Correrlo con -Probar no toca ninguna base: arma tablas de mentira y
#  comprueba el armado del informe. Existe porque esto corre en una computadora
#  a la que no tenemos acceso, y una falla tonta significa hacer volver a
#  alguien al local. Correrla antes de mandar una version nueva.
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
    $cmd.CommandTimeout = 180
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

# ---------------------------------------------------------------------------
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
    [void]$t.Rows.Add('pruebas')
    return ,$t
  }

  $t = TablaDeMentira
  Comprobar 'la tabla vuelve entera y no en filas sueltas' $t.GetType().Name 'DataTable'
  Comprobar 'y se le puede leer .Rows' $t.Rows.Count 2

  $nombres = @()
  foreach ($f in $t.Rows) { $nombres += [string]$f['name'] }
  Comprobar 'se sacan los nombres de las bases' ($nombres -join ',') 'softrestaurant95pro,pruebas'

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

  # La base con mas ventas es la que se explora, se llame como se llame.
  $candidatas = @(
    @{ base = 'softrestaurant95pro'; ventas = 0 },
    @{ base = 'pruebas';             ventas = 48213 }
  )
  $mejor = $candidatas | Sort-Object { $_.ventas } -Descending | Select-Object -First 1
  Comprobar 'gana la base que tiene las ventas' $mejor.base 'pruebas'

  Write-Host ''
  if ($fallos -eq 0) { Write-Host 'Todo bien.' } else { Write-Host "$fallos fallas"; exit 1 }
  exit 0
}
# ---------------------------------------------------------------------------

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
  Escribir "Puede estar en otra maquina de la red. Avise de esto."
  $lineas | Set-Content -Path $salida -Encoding utf8
  Write-Host "Informe escrito en: $salida"
  return
}

$servidores = @()
foreach ($i in $instancias) {
  if ($i -eq 'MSSQLSERVER') { $servidores += '.' } else { $servidores += ".\$i" }
}
Escribir ("Instancias de SQL Server: " + ($instancias -join ', '))
Escribir ""

# --- 2. En cual base estan las ventas de verdad ------------------------------
#
# No se elige por el nombre. En este negocio la base que se llama
# "softrestaurant95pro" resulto estar vacia, asi que se mide cada una y gana
# la que tenga mas pedidos. Un nombre no dice nada; las filas si.
Escribir "============================================================"
Escribir "1. EN CUAL BASE ESTAN LAS VENTAS"
Escribir "============================================================"

$candidatas = @()
foreach ($servidor in $servidores) {
  $raiz = "Server=$servidor;Integrated Security=True;Connect Timeout=15;TrustServerCertificate=True"
  try {
    $bases = Consultar "$raiz;Database=master" "SELECT name FROM sys.databases WHERE database_id > 4 AND state = 0 ORDER BY name"
  } catch {
    Escribir "No se pudo conectar a $servidor : $($_.Exception.Message)"
    continue
  }

  $nombres = @()
  if ($null -ne $bases -and $null -ne $bases.Rows) {
    foreach ($f in $bases.Rows) { $nombres += [string]$f['name'] }
  }
  Escribir ""
  Escribir "SERVIDOR $servidor"
  Escribir ("  bases de usuario: " + ($nombres -join ', '))
  Escribir ""

  foreach ($nombre in $nombres) {
    $cadena = "$raiz;Database=$nombre"
    $ventas = -1
    $ultima = ''
    try {
      $r = Consultar $cadena "
        IF OBJECT_ID('dbo.cheques','U') IS NULL
          SELECT -1 AS ventas, '' AS ultima
        ELSE
          SELECT COUNT(*) AS ventas,
                 ISNULL(CONVERT(varchar(19), MAX(fecha), 120), '') AS ultima
          FROM dbo.cheques"
      $ventas = [int]$r.Rows[0]['ventas']
      $ultima = [string]$r.Rows[0]['ultima']
    } catch {
      $ventas = -2
    }

    if ($ventas -lt 0) {
      Escribir ("  {0,-28} no tiene tabla de pedidos" -f $nombre)
    } else {
      Escribir ("  {0,-28} {1,10} pedidos    ultimo: {2}" -f $nombre, $ventas, $ultima)
      $candidatas += @{ servidor = $servidor; base = $nombre; cadena = $cadena; ventas = $ventas }
    }
  }
}

if ($candidatas.Count -eq 0) {
  Escribir ""
  Escribir "NINGUNA BASE TIENE TABLA DE PEDIDOS. Avise de esto."
  $lineas | Set-Content -Path $salida -Encoding utf8
  Write-Host "Informe escrito en: $salida"
  return
}

$elegida = $candidatas | Sort-Object { $_.ventas } -Descending | Select-Object -First 1
$cadena = $elegida.cadena
Escribir ""
Escribir ("SE EXPLORA: {0}  ({1} pedidos)" -f $elegida.base, $elegida.ventas)
Escribir ""

# --- 3. Donde se va el tiempo de una entrega --------------------------------
#
# Esta es la seccion que contesta por que los pedidos llegan tarde. Son
# promedios, no datos de nadie.
Escribir "============================================================"
Escribir "2. DONDE SE VA EL TIEMPO (ultimos 90 dias)"
Escribir "============================================================"
Escribir ""

if ($elegida.ventas -gt 0) {
  try {
    $marcas = Consultar $cadena "
      SELECT
        COUNT(*)                                                               AS pedidos,
        SUM(CASE WHEN iddireccion    IS NOT NULL AND iddireccion <> '' THEN 1 ELSE 0 END) AS a_domicilio,
        SUM(CASE WHEN empaquetado    IS NOT NULL THEN 1 ELSE 0 END)            AS con_empaquetado,
        SUM(CASE WHEN asignacion     IS NOT NULL THEN 1 ELSE 0 END)            AS con_asignacion,
        SUM(CASE WHEN salidarepartidor IS NOT NULL THEN 1 ELSE 0 END)          AS con_salida,
        SUM(CASE WHEN arriborepartidor IS NOT NULL THEN 1 ELSE 0 END)          AS con_arribo,
        SUM(CASE WHEN cierre         IS NOT NULL THEN 1 ELSE 0 END)            AS con_cierre
      FROM dbo.cheques
      WHERE fecha >= DATEADD(day, -90, GETDATE())"
    Escribir "Cuantos pedidos traen cada marca puesta:"
    ComoTexto $marcas @('pedidos','a_domicilio','con_empaquetado','con_asignacion','con_salida','con_arribo','con_cierre') |
      ForEach-Object { Escribir $_ }
    Escribir ""

    # Los topes de 240 minutos descartan los absurdos: un pedido que quedo
    # abierto toda la noche ensucia el promedio y no dice nada del servicio.
    $minutos = Consultar $cadena "
      SELECT
        AVG(CASE WHEN empaquetado > fecha AND DATEDIFF(minute, fecha, empaquetado) < 240
                 THEN DATEDIFF(minute, fecha, empaquetado) END)                           AS min_cocina,
        AVG(CASE WHEN salidarepartidor > empaquetado AND DATEDIFF(minute, empaquetado, salidarepartidor) < 240
                 THEN DATEDIFF(minute, empaquetado, salidarepartidor) END)                AS min_esperando_repartidor,
        AVG(CASE WHEN arriborepartidor > salidarepartidor AND DATEDIFF(minute, salidarepartidor, arriborepartidor) < 240
                 THEN DATEDIFF(minute, salidarepartidor, arriborepartidor) END)           AS min_en_la_calle,
        AVG(CASE WHEN arriborepartidor > fecha AND DATEDIFF(minute, fecha, arriborepartidor) < 240
                 THEN DATEDIFF(minute, fecha, arriborepartidor) END)                      AS min_total
      FROM dbo.cheques
      WHERE fecha >= DATEADD(day, -90, GETDATE())"
    Escribir "Minutos promedio por etapa (vacio = esa marca no se usa):"
    ComoTexto $minutos @('min_cocina','min_esperando_repartidor','min_en_la_calle','min_total') |
      ForEach-Object { Escribir $_ }
    Escribir ""

    $direcciones = Consultar $cadena "
      SELECT
        COUNT(*)                                                        AS direcciones,
        SUM(CASE WHEN latitude IS NOT NULL AND latitude <> 0 THEN 1 ELSE 0 END) AS con_coordenadas
      FROM dbo.direccionesdomicilio"
    Escribir "Direcciones de domicilio y cuantas tienen el punto en el mapa:"
    ComoTexto $direcciones @('direcciones','con_coordenadas') | ForEach-Object { Escribir $_ }
    Escribir ""
  } catch {
    Escribir ("No se pudo medir: " + $_.Exception.Message)
    Escribir ""
  }
} else {
  Escribir "La base elegida no tiene pedidos, asi que no hay nada que medir."
  Escribir ""
}

# --- 4. El esquema ----------------------------------------------------------
Escribir "============================================================"
Escribir "3. TABLAS, DE LA MAS GRANDE A LA MAS CHICA"
Escribir "============================================================"
$tablas = Consultar $cadena "
  SELECT TOP 40 t.name AS tabla,
         SUM(CASE WHEN p.index_id < 2 THEN p.row_count ELSE 0 END) AS filas
  FROM sys.tables t
  LEFT JOIN sys.dm_db_partition_stats p ON p.object_id = t.object_id
  GROUP BY t.name ORDER BY filas DESC"
ComoTexto $tablas @('tabla', 'filas') | ForEach-Object { Escribir $_ }
Escribir ""

$lineas | Set-Content -Path $salida -Encoding utf8
Write-Host ""
Write-Host "============================================================"
Write-Host "LISTO. El informe quedo en:"
Write-Host "  $salida"
Write-Host "Mande ese archivo."
Write-Host "============================================================"
