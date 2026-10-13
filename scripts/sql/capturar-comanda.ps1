<#
  CAPTURA LO QUE EL POS MANDA A LA IMPRESORA DE COCINA, SIN IMPRIMIR NADA

  PARA QUE SIRVE

  Para que el pedido de la app salga en la cocina hay que imprimir la comanda igual
  que la imprime el POS: mismo texto, mismos codigos de la impresora, una por area.
  La forma de saberlo es mirar lo que el POS manda. Con impresoras reales saldria
  papel en la cocina, y con "Microsoft Print to PDF" no queda nada para ver.

  ESTE SCRIPT ARMA UNA COCINA FALSA DENTRO DEL SERVIDOR:

    1. Crea 4 impresoras de Windows que apuntan a la propia computadora (127.0.0.1,
       puertos 9101 a 9104), con el mismo controlador "Generic / Text Only" de las
       impresoras reales de la cocina. No hay ningun aparato: nada sale en papel.
    2. En la COPIA de la base (nunca en la real) cambia la impresora de cada area:
       pizza -> PRUEBA-COCINA3, pollo -> PRUEBA-COCINA1,
       hamburguesa -> PRUEBA-COCINA2, batidos -> PRUEBA-BATIDOS
       (el mismo reparto que las impresoras reales).
    3. Se queda escuchando esos 4 puertos. Todo lo que el POS mande, lo guarda en la
       carpeta comandas-capturadas y lo escribe en el informe, con los codigos de
       control de la impresora visibles como <1B>, <0A>...

  Se corre con el POS apuntado a la copia (APUNTAR-POS-A-LA-COPIA.bat). Hay que
  CERRAR Y VOLVER A ABRIR el POS despues de correr esto, para que lea las impresoras
  nuevas. Despues se presiona REIMPRIMIR PROD. en la cuenta de prueba.

  SOLO FUNCIONA SOBRE UNA BASE CUYO NOMBRE TERMINA EN _copia.
  Pide ejecutarse como administrador (el .bat lo pide solo).
#>

param(
  [string]$Instancia = '.\NATIONALSOFT',
  [string]$Base = 'pruebas_copia',
  [int]$Minutos = 15,
  [switch]$Probar
)

$ErrorActionPreference = 'Stop'
$salida = Join-Path $PSScriptRoot 'salida-comandas-capturadas.txt'
$carpeta = Join-Path $PSScriptRoot 'comandas-capturadas'
$lineas = @()

# area -> (nombre de la impresora falsa, puerto). Mismo reparto que las reales.
$IMPRESORAS = @(
  @{ area = '01'; nombre = 'PRUEBA-COCINA3'; puerto = 9103; real = 'Cocina 3' },
  @{ area = '02'; nombre = 'PRUEBA-COCINA1'; puerto = 9101; real = 'Cocina 1' },
  @{ area = '03'; nombre = 'PRUEBA-COCINA2'; puerto = 9102; real = 'Cocina 2' },
  @{ area = '04'; nombre = 'PRUEBA-BATIDOS'; puerto = 9104; real = 'Batidos' }
)

function Escribir($texto) {
  $script:lineas += $texto
  Write-Host $texto
}

function EsCopiaValida([string]$nombre) {
  return [bool]($nombre -cmatch '^[A-Za-z][A-Za-z0-9_]{0,60}_copia$')
}

<#
  Los bytes que recibio una impresora, legibles: el texto tal cual, el salto de linea
  como salto, y todo lo demas (ESC, GS, etc.) como <HH> con el valor en hexadecimal.
  Asi se ve exactamente que mando el POS: <1B>!<10> es "doble alto".
#>
function VerBytes([byte[]]$bytes) {
  $enc = [System.Text.Encoding]::GetEncoding(1252)
  $sb = New-Object System.Text.StringBuilder
  foreach ($b in $bytes) {
    if ($b -eq 10) { [void]$sb.Append("`n") }
    elseif ($b -eq 13) { }
    elseif ($b -ge 32 -and $b -le 126) { [void]$sb.Append([char]$b) }
    elseif ($b -ge 160) { [void]$sb.Append($enc.GetString([byte[]]@($b))) }
    else { [void]$sb.Append('<' + $b.ToString('X2') + '>') }
  }
  return $sb.ToString()
}

if ($Probar) {
  $ok = 0
  function Comprobar($que, $real, $esperado) {
    if ("$real" -eq "$esperado") { $script:ok += 1; Write-Host "OK    $que" }
    else { Write-Host "MAL   $que  ($real != $esperado)"; exit 1 }
  }
  Comprobar 'acepta pruebas_copia' (EsCopiaValida 'pruebas_copia') 'True'
  Comprobar 'rechaza la base real' (EsCopiaValida 'pruebas') 'False'
  Comprobar 'rechaza inyeccion' (EsCopiaValida "x'; DROP TABLE y;--_copia") 'False'
  Comprobar 'texto simple' (VerBytes ([byte[]](72, 111, 108, 97))) 'Hola'
  Comprobar 'salto de linea' (VerBytes ([byte[]](65, 13, 10, 66))) "A`nB"
  Comprobar 'doble alto' (VerBytes ([byte[]](27, 33, 16, 80))) '<1B>!<10>P'
  Comprobar 'corte de papel' (VerBytes ([byte[]](29, 86, 0))) '<1D>V<00>'
  Comprobar 'tilde latina' (VerBytes ([byte[]](0xF1))) ([string][char]0xF1)
  Comprobar 'las 4 areas tienen impresora' $IMPRESORAS.Count 4
  Comprobar 'puertos distintos' (($IMPRESORAS | ForEach-Object { $_.puerto } | Select-Object -Unique).Count) 4
  Write-Host ''
  Write-Host "Todo bien ($ok comprobaciones)."
  exit 0
}

Escribir ''
Escribir 'CAPTURA DE LAS COMANDAS DEL POS (cocina falsa)'
Escribir ('Generado: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Escribir ('Equipo:   ' + $env:COMPUTERNAME)
Escribir ''

if (-not (EsCopiaValida $Base)) {
  Escribir "SE NIEGA: la base '$Base' no termina en _copia. Este script solo toca copias."
  $lineas | Set-Content -Path $salida -Encoding utf8
  exit 1
}
$yo = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $yo.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Escribir 'Hay que ejecutarlo como administrador (para crear las impresoras). Use el archivo .bat.'
  exit 1
}

$raiz = "Server=$Instancia;Integrated Security=SSPI;TrustServerCertificate=True;Connect Timeout=15"
function Consultar($db, $sql) {
  $con = New-Object System.Data.SqlClient.SqlConnection "$raiz;Database=$db"
  $con.Open()
  try {
    $cmd = $con.CreateCommand(); $cmd.CommandText = $sql; $cmd.CommandTimeout = 60
    $ad = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
    $t = New-Object System.Data.DataTable; [void]$ad.Fill($t); return ,$t
  } finally { $con.Close() }
}
function Ejecutar($db, $sql) {
  $con = New-Object System.Data.SqlClient.SqlConnection "$raiz;Database=$db"
  $con.Open()
  try { $cmd = $con.CreateCommand(); $cmd.CommandText = $sql; $cmd.CommandTimeout = 60; return $cmd.ExecuteNonQuery() }
  finally { $con.Close() }
}

if ([int](Consultar 'master' "SELECT COUNT(*) AS n FROM sys.databases WHERE name = '$Base' AND state = 0").Rows[0]['n'] -eq 0) {
  Escribir "No existe la base '$Base'."
  exit 1
}

# --- 1. Las impresoras falsas ------------------------------------------------
Escribir '1. IMPRESORAS FALSAS (apuntan a esta misma computadora, no hay aparato)'
$driver = $null
foreach ($p in @('Cocina 1', 'Cocina 2', 'Cocina 3', 'Batidos')) {
  $x = Get-Printer -Name $p -ErrorAction SilentlyContinue
  if ($x) { $driver = $x.DriverName; break }
}
if (-not $driver) { $driver = 'Generic / Text Only' }
Escribir "  Controlador: $driver"
foreach ($i in $IMPRESORAS) {
  $puerto = 'PRUEBA-' + $i.puerto
  if (-not (Get-PrinterPort -Name $puerto -ErrorAction SilentlyContinue)) {
    Add-PrinterPort -Name $puerto -PrinterHostAddress '127.0.0.1' -PortNumber $i.puerto
  }
  if (-not (Get-Printer -Name $i.nombre -ErrorAction SilentlyContinue)) {
    Add-Printer -Name $i.nombre -DriverName $driver -PortName $puerto
    Escribir ("  Creada:  {0}  ->  127.0.0.1:{1}   (en lugar de {2})" -f $i.nombre, $i.puerto, $i.real)
  } else {
    Escribir ("  Ya existe: {0}  ->  127.0.0.1:{1}" -f $i.nombre, $i.puerto)
  }
}
Escribir ''

# --- 2. La copia apunta a las falsas -----------------------------------------
Escribir "2. LA COPIA ($Base) APUNTA A LAS IMPRESORAS FALSAS"
foreach ($i in $IMPRESORAS) {
  $n = Ejecutar $Base ("UPDATE dbo.estacionesareas SET impresora = '{0}' WHERE idarea = '{1}' AND ISNULL(impresora,'') <> ''" -f $i.nombre, $i.area)
  Escribir ("  Area {0}: {1} configuraciones -> {2}" -f $i.area, $n, $i.nombre)
}
Escribir ''
Escribir '  AHORA: CIERRE y VUELVA A ABRIR el POS (si estaba abierto), busque la cuenta de'
Escribir '  prueba y presione REIMPRIMIR PROD. Esta ventana espera hasta '
Escribir ("  $Minutos minutos y se va a ir llenando.")
Escribir ''

# --- 3. Escuchar -------------------------------------------------------------
if (-not (Test-Path $carpeta)) { [void](New-Item -ItemType Directory -Path $carpeta) }
$oyentes = @{}
foreach ($i in $IMPRESORAS) {
  $l = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Parse('127.0.0.1')), $i.puerto
  $l.Start()
  $oyentes[$i.puerto] = $l
}
$capturas = @()
$fin = (Get-Date).AddMinutes($Minutos)
$ultima = $null
try {
  while ((Get-Date) -lt $fin) {
    foreach ($i in $IMPRESORAS) {
      $l = $oyentes[$i.puerto]
      if (-not $l.Pending()) { continue }
      $cli = $l.AcceptTcpClient()
      $cli.ReceiveTimeout = 5000
      $ms = New-Object System.IO.MemoryStream
      $buf = New-Object byte[] 4096
      $s = $cli.GetStream()
      try {
        while (($n = $s.Read($buf, 0, $buf.Length)) -gt 0) { $ms.Write($buf, 0, $n) }
      } catch { }
      $cli.Close()
      $bytes = $ms.ToArray()
      $nombre = '{0}-{1}' -f (Get-Date -Format 'HHmmss'), $i.nombre
      [System.IO.File]::WriteAllBytes((Join-Path $carpeta ($nombre + '.bin')), $bytes)
      $capturas += ,@{ impresora = $i.nombre; area = $i.area; real = $i.real; bytes = $bytes; archivo = $nombre }
      $ultima = Get-Date
      Write-Host ("  Recibido: {0} ({1} bytes)" -f $i.nombre, $bytes.Length)
    }
    # Con al menos una captura y 30 segundos de calma, se da por terminado.
    if ($capturas.Count -gt 0 -and $ultima -and ((Get-Date) - $ultima).TotalSeconds -gt 30) { break }
    Start-Sleep -Milliseconds 300
  }
} finally {
  foreach ($l in $oyentes.Values) { $l.Stop() }
}

# --- 4. Informe --------------------------------------------------------------
Escribir '============================================================'
Escribir ('3. LO QUE EL POS MANDO: {0} comandas' -f $capturas.Count)
Escribir '============================================================'
Escribir ''
Escribir '  <HH> = un codigo de control de la impresora, en hexadecimal.'
Escribir ''
foreach ($c in $capturas) {
  Escribir ("--- {0}  (area {1}, equivale a {2})  {3} bytes ---" -f $c.impresora, $c.area, $c.real, $c.bytes.Length)
  foreach ($l in ((VerBytes $c.bytes) -split "`n")) { Escribir ('  | ' + $l) }
  Escribir ''
}
if ($capturas.Count -eq 0) {
  Escribir '  No llego nada. Revise que el POS se cerro y se volvio a abrir despues de correr esto.'
  Escribir ''
}
Escribir '============================================================'
Escribir 'LISTO. El informe quedo en:'
Escribir "  $salida"
Escribir "Los bytes crudos quedaron en la carpeta: $carpeta"
Escribir '============================================================'
$lineas | Set-Content -Path $salida -Encoding utf8
