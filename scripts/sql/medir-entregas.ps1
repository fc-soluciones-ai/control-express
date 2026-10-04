# =============================================================================
#  POR QUE LLEGAN TARDE LOS PEDIDOS
# =============================================================================
#
#  SE CORRE EN LA COMPUTADORA DEL POS (PZLE-SVR-02). Doble clic en
#  MEDIR-ENTREGAS.bat, que esta al lado. No instala nada.
#
#  DE DONDE SALE
#  El informe anterior dejo claro que un pedido tarda 79 minutos de punta a
#  punta y que 48 de esos son en la calle. Lo que falta saber es POR QUE son
#  48, porque las dos explicaciones posibles se arreglan de forma distinta:
#
#    a) El repartidor sale con varios pedidos juntos y el ultimo espera.
#       Se arregla despachando distinto, no con mapas.
#    b) El repartidor se pierde buscando la casa.
#       Se arregla con la ubicacion exacta de cada cliente.
#
#  Este informe las separa.
#
#  ES DE SOLO LECTURA y no saca datos de nadie: cuentas, promedios y codigos
#  de repartidor. Ni un nombre de cliente, ni un telefono, ni una direccion.
# =============================================================================

param([switch]$Probar)

$ErrorActionPreference = 'Stop'
$salida = Join-Path $PSScriptRoot 'salida-entregas.txt'
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
    $cmd.CommandTimeout = 300
    $ad = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
    $tabla = New-Object System.Data.DataTable
    [void]$ad.Fill($tabla)
    # La coma es obligatoria: sin ella PowerShell desarma la tabla al
    # devolverla y .Rows queda nulo.
    return ,$tabla
  } finally { $con.Close() }
}

function ComoTexto($tabla, $ancho) {
  if ($null -eq $tabla -or $null -eq $tabla.Rows -or $tabla.Rows.Count -eq 0) {
    return @('  (sin datos)')
  }
  $columnas = @()
  foreach ($c in $tabla.Columns) { $columnas += $c.ColumnName }
  $filas = @()
  $filas += ('  ' + (($columnas | ForEach-Object { $_.PadRight($ancho) }) -join ''))
  $filas += ('  ' + ('-' * ($ancho * $columnas.Count)))
  foreach ($r in $tabla.Rows) {
    $celdas = @()
    foreach ($c in $columnas) {
      $valor = [string]$r[$c]
      if ($valor -match '^-?\d+[.,]\d+$') { $valor = [string][math]::Round([double]($valor -replace ',', '.'), 1) }
      if ($valor.Length -gt ($ancho - 1)) { $valor = $valor.Substring(0, $ancho - 1) }
      $celdas += $valor.PadRight($ancho)
    }
    $filas += ('  ' + ($celdas -join ''))
  }
  return $filas
}

# ---------------------------------------------------------------------------
if ($Probar) {
  $fallos = 0
  function Comprobar($d, $real, $esperado) {
    if ("$real" -eq "$esperado") { Write-Host "OK    $d" }
    else {
      Write-Host "FALLA $d"; Write-Host "        esperado: $esperado"; Write-Host "        obtenido: $real"
      $script:fallos = $script:fallos + 1
    }
  }
  function TablaDeMentira {
    $t = New-Object System.Data.DataTable
    [void]$t.Columns.Add('pedidos_por_viaje')
    [void]$t.Columns.Add('viajes')
    [void]$t.Rows.Add('1', '420')
    [void]$t.Rows.Add('3', '77')
    return ,$t
  }
  $t = TablaDeMentira
  Comprobar 'la tabla vuelve entera' $t.GetType().Name 'DataTable'
  $texto = ComoTexto $t 22
  Comprobar 'salen encabezado, raya y dos filas' $texto.Count 4
  Comprobar 'los encabezados salen solos de la tabla' ($texto[0].Trim() -replace '\s+', ' ') 'pedidos_por_viaje viajes'
  Comprobar 'el dato va completo' ($texto[3].Trim() -replace '\s+', ' ') '3 77'

  $dec = New-Object System.Data.DataTable
  [void]$dec.Columns.Add('minutos')
  [void]$dec.Rows.Add('47,83333')
  Comprobar 'los decimales se redondean' ((ComoTexto $dec 22)[2].Trim()) '47.8'

  Comprobar 'una tabla vacia no revienta' (ComoTexto (New-Object System.Data.DataTable) 22) '  (sin datos)'
  Comprobar 'una tabla nula tampoco' (ComoTexto $null 22) '  (sin datos)'

  Write-Host ''
  if ($fallos -eq 0) { Write-Host 'Todo bien.' } else { Write-Host "$fallos fallas"; exit 1 }
  exit 0
}
# ---------------------------------------------------------------------------

Escribir "POR QUE LLEGAN TARDE LOS PEDIDOS"
Escribir ("Generado: " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Escribir ("Equipo:   " + $env:COMPUTERNAME)
Escribir ""

# --- Encontrar el servidor y la base con las ventas -------------------------
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
  $lineas | Set-Content -Path $salida -Encoding utf8
  return
}

$elegida = $null
foreach ($i in $instancias) {
  if ($i -eq 'MSSQLSERVER') { $servidor = '.' } else { $servidor = ".\$i" }
  $raiz = "Server=$servidor;Integrated Security=True;Connect Timeout=15;TrustServerCertificate=True"
  try {
    $bases = Consultar "$raiz;Database=master" "SELECT name FROM sys.databases WHERE database_id > 4 AND state = 0"
  } catch { continue }
  foreach ($f in $bases.Rows) {
    $nombre = [string]$f['name']
    try {
      $r = Consultar "$raiz;Database=$nombre" "
        IF OBJECT_ID('dbo.cheques','U') IS NULL SELECT -1 AS n
        ELSE SELECT COUNT(*) AS n FROM dbo.cheques"
      $n = [int]$r.Rows[0]['n']
      if ($null -eq $elegida -or $n -gt $elegida.ventas) {
        $elegida = @{ base = $nombre; cadena = "$raiz;Database=$nombre"; ventas = $n }
      }
    } catch { }
  }
}
if ($null -eq $elegida -or $elegida.ventas -le 0) {
  Escribir "NINGUNA BASE TIENE PEDIDOS."
  $lineas | Set-Content -Path $salida -Encoding utf8
  return
}

$cadena = $elegida.cadena
Escribir ("Base: {0}  ({1} pedidos en total)" -f $elegida.base, $elegida.ventas)
Escribir "Todo lo que sigue es de los ultimos 90 dias, solo pedidos a domicilio"
Escribir "que tengan marcada la salida y la llegada del repartidor."
Escribir ""

# Pedidos que sirven para medir. Se descartan los absurdos: un pedido que
# quedo abierto toda la noche no dice nada del servicio.
$DONDE = "
  FROM dbo.cheques c
  WHERE c.fecha >= DATEADD(day, -90, GETDATE())
    AND c.cancelado = 0
    AND c.salidarepartidor IS NOT NULL
    AND c.arriborepartidor IS NOT NULL
    AND c.arriborepartidor > c.salidarepartidor
    AND DATEDIFF(minute, c.fecha, c.arriborepartidor) BETWEEN 1 AND 240"

# --- 1. Como se reparten los minutos ----------------------------------------
Escribir "============================================================"
Escribir "1. CUANTO TARDA UN PEDIDO, DE VERDAD"
Escribir "============================================================"
Escribir ""
Escribir "El promedio esconde lo peor. La mediana es el pedido del medio: la"
Escribir "mitad llega antes de eso. El 90 es el que deja al cliente furioso."
Escribir ""
$reparto = Consultar $cadena "
  SELECT
    COUNT(*)                                                           AS pedidos,
    AVG(DATEDIFF(minute, c.fecha, c.arriborepartidor) * 1.0)           AS total_promedio,
    MIN(DATEDIFF(minute, c.fecha, c.arriborepartidor))                 AS total_minimo,
    MAX(DATEDIFF(minute, c.fecha, c.arriborepartidor))                 AS total_maximo,
    AVG(DATEDIFF(minute, c.fecha, c.salidarepartidor) * 1.0)           AS en_el_local,
    AVG(DATEDIFF(minute, c.salidarepartidor, c.arriborepartidor) * 1.0) AS en_la_calle
  $DONDE"
ComoTexto $reparto 18 | ForEach-Object { Escribir $_ }
Escribir ""

$percentiles = Consultar $cadena "
  SELECT DISTINCT
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY DATEDIFF(minute, c.fecha, c.arriborepartidor)) OVER () AS mediana,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY DATEDIFF(minute, c.fecha, c.arriborepartidor)) OVER () AS p75,
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY DATEDIFF(minute, c.fecha, c.arriborepartidor)) OVER () AS p90,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY DATEDIFF(minute, c.salidarepartidor, c.arriborepartidor)) OVER () AS calle_mediana,
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY DATEDIFF(minute, c.salidarepartidor, c.arriborepartidor)) OVER () AS calle_p90
  $DONDE"
ComoTexto $percentiles 18 | ForEach-Object { Escribir $_ }
Escribir ""

# --- 2. Cuantos pedidos lleva el repartidor en cada salida ------------------
Escribir "============================================================"
Escribir "2. CUANTOS PEDIDOS LLEVA EN CADA VIAJE"
Escribir "============================================================"
Escribir ""
Escribir "Si sale con tres, el tercer cliente paga la espera de los otros dos."
Escribir "Se cuentan como un mismo viaje los pedidos que el mismo repartidor"
Escribir "saco en el mismo minuto."
Escribir ""
$viajes = Consultar $cadena "
  SELECT v.pedidos_por_viaje,
         COUNT(*)                     AS viajes,
         AVG(v.minutos_calle * 1.0)   AS min_en_la_calle,
         AVG(v.minutos_total * 1.0)   AS min_total
  FROM (
    SELECT c.idmesero,
           CONVERT(varchar(16), c.salidarepartidor, 120) AS salida,
           COUNT(*)                                       AS pedidos_por_viaje,
           AVG(DATEDIFF(minute, c.salidarepartidor, c.arriborepartidor) * 1.0) AS minutos_calle,
           AVG(DATEDIFF(minute, c.fecha, c.arriborepartidor) * 1.0)            AS minutos_total
    $DONDE
    GROUP BY c.idmesero, CONVERT(varchar(16), c.salidarepartidor, 120)
  ) v
  GROUP BY v.pedidos_por_viaje
  ORDER BY v.pedidos_por_viaje"
ComoTexto $viajes 18 | ForEach-Object { Escribir $_ }
Escribir ""

# --- 3. Cuesta minutos una direccion mal escrita? ---------------------------
Escribir "============================================================"
Escribir "3. CUANTO CUESTA UNA DIRECCION MAL ESCRITA"
Escribir "============================================================"
Escribir ""
Escribir "Esta es la pregunta del proyecto de ubicaciones. Si el repartidor"
Escribir "tarda lo mismo con una direccion de dos palabras que con una"
Escribir "detallada, el problema no es el mapa y hay que mirar otra cosa."
Escribir ""
# Esta no puede usar el fragmento comun porque necesita unir la direccion.
$direcciones = Consultar $cadena "
  SELECT x.direccion,
         COUNT(*)                     AS pedidos,
         AVG(x.minutos_calle * 1.0)   AS min_en_la_calle,
         AVG(x.minutos_total * 1.0)   AS min_total
  FROM (
    SELECT
      CASE
        WHEN LEN(LTRIM(RTRIM(ISNULL(d.calle,'') + ' ' + ISNULL(d.referencia,'')))) < 12 THEN '1. casi vacia'
        WHEN LEN(LTRIM(RTRIM(ISNULL(d.calle,'') + ' ' + ISNULL(d.referencia,'')))) < 25 THEN '2. pobre'
        WHEN LEN(LTRIM(RTRIM(ISNULL(d.calle,'') + ' ' + ISNULL(d.referencia,'')))) < 45 THEN '3. pasable'
        ELSE '4. detallada'
      END                                                            AS direccion,
      DATEDIFF(minute, c.salidarepartidor, c.arriborepartidor)       AS minutos_calle,
      DATEDIFF(minute, c.fecha, c.arriborepartidor)                  AS minutos_total
    FROM dbo.cheques c
    INNER JOIN dbo.direccionesdomicilio d
            ON d.iddireccion = c.iddireccion
           AND d.idcliente   = c.idclientedomicilio
    WHERE c.fecha >= DATEADD(day, -90, GETDATE())
      AND c.cancelado = 0
      AND c.salidarepartidor IS NOT NULL
      AND c.arriborepartidor IS NOT NULL
      AND c.arriborepartidor > c.salidarepartidor
      AND DATEDIFF(minute, c.fecha, c.arriborepartidor) BETWEEN 1 AND 240
  ) x
  GROUP BY x.direccion
  ORDER BY x.direccion"
ComoTexto $direcciones 18 | ForEach-Object { Escribir $_ }
Escribir ""

# --- 4. A que hora se atrasa -------------------------------------------------
Escribir "============================================================"
Escribir "4. A QUE HORA SE ATRASA"
Escribir "============================================================"
Escribir ""
$horas = Consultar $cadena "
  SELECT DATEPART(hour, c.fecha)                                        AS hora,
         COUNT(*)                                                       AS pedidos,
         AVG(DATEDIFF(minute, c.fecha, c.salidarepartidor) * 1.0)       AS en_el_local,
         AVG(DATEDIFF(minute, c.salidarepartidor, c.arriborepartidor) * 1.0) AS en_la_calle,
         AVG(DATEDIFF(minute, c.fecha, c.arriborepartidor) * 1.0)       AS total
  $DONDE
  GROUP BY DATEPART(hour, c.fecha)
  ORDER BY hora"
ComoTexto $horas 14 | ForEach-Object { Escribir $_ }
Escribir ""

# --- 5. Por repartidor -------------------------------------------------------
Escribir "============================================================"
Escribir "5. POR REPARTIDOR (codigo del POS, sin nombres)"
Escribir "============================================================"
Escribir ""
$repartidores = Consultar $cadena "
  SELECT c.idmesero                                                     AS codigo,
         COUNT(*)                                                       AS pedidos,
         AVG(DATEDIFF(minute, c.salidarepartidor, c.arriborepartidor) * 1.0) AS min_en_la_calle,
         AVG(DATEDIFF(minute, c.fecha, c.arriborepartidor) * 1.0)       AS min_total
  $DONDE
  GROUP BY c.idmesero
  HAVING COUNT(*) >= 20
  ORDER BY min_en_la_calle DESC"
ComoTexto $repartidores 18 | ForEach-Object { Escribir $_ }
Escribir ""

$lineas | Set-Content -Path $salida -Encoding utf8
Write-Host ""
Write-Host "============================================================"
Write-Host "LISTO. El informe quedo en:"
Write-Host "  $salida"
Write-Host "Mande ese archivo."
Write-Host "============================================================"
