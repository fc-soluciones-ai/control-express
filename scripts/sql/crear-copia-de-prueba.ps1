<#
  CREA UNA COPIA DE PRUEBA DE LA BASE DEL POS

  PARA QUE SIRVE

  Antes de que la app escriba un pedido en el POS hay que ensayar la escritura
  en una base que no sea la de la caja. Esto saca una copia exacta de la base
  real, con otro nombre, en el mismo servidor. Ahi se puede equivocar cuantas
  veces haga falta.

  LA BASE REAL NO SE MODIFICA

  - El respaldo es de solo lectura sobre la real y usa COPY_ONLY: no altera la
    cadena de respaldos de la pizzeria.
  - La restauracion crea una base NUEVA con otros nombres de archivo. Nunca usa
    REPLACE, asi que si por error apuntara a la real, SQL Server se negaria.
  - La copia se llama igual que la real mas "_copia". Esa terminacion es la
    marca: el agente del POS y los informes NUNCA eligen solos una base que
    termine asi. Sin esto, una copia con mas pedidos que la real haria que el
    agente, al reiniciarse, se pasara a leerla sin avisar.

  QUE HACE, EN ORDEN

  1. Elige la base real (la que tenga mas pedidos, sin contar las copias).
  2. Revisa que haya espacio en disco para tres veces su tamano.
  3. Pide confirmacion.
  4. Respalda, verifica el respaldo y restaura con otro nombre.
  5. Compara las cantidades de filas entre la real y la copia.
  6. Borra el archivo de respaldo, porque trae todos los datos de los clientes.

  EL SCRIPT NO BORRA NI SOBRESCRIBE NINGUNA BASE salvo que se pase -Reemplazar, y
  aun asi solo borra una que termine en _copia y que no sea la real.
#>

param(
  [string]$Instancia = '.\NATIONALSOFT',
  [string]$Base = '',
  [string]$NombreCopia = '',
  [switch]$Reemplazar,
  [switch]$ConservarRespaldo,
  [switch]$Probar
)

$ErrorActionPreference = 'Stop'

function Escribir($texto) { Write-Host $texto }

<#
  Un nombre de copia valido: empieza con letra, solo letras, numeros y guion
  bajo, TERMINA en _copia y no es el de la base real.

  Se valida con una lista de caracteres permitidos y no escapando, porque este
  nombre acaba dentro de una instruccion que puede borrar una base.
#>
function NombreDeCopiaValido($copia, $origen) {
  if ([string]::IsNullOrWhiteSpace($copia)) { return $false }
  if ($copia -notmatch '^[A-Za-z][A-Za-z0-9_]{0,60}_copia$') { return $false }
  if ($copia -ieq $origen) { return $false }
  return $true
}

<# Hay espacio si lo libre es al menos tres veces el tamano de la base. #>
function HayEspacio($libreMB, $baseMB) {
  return ([double]$libreMB -ge ([double]$baseMB * 3))
}

<# Donde va cada archivo de la copia. tipo: 0 = datos, 1 = registro (log). #>
function RutaDeArchivoDeCopia($carpeta, $copia, $tipo, $indice) {
  # Con texto y no con Join-Path: Join-Path se niega si la unidad no existe en
  # la maquina donde corre, y aqui la ruta es la de otra maquina.
  $base = ([string]$carpeta).TrimEnd([char]92) + [string][char]92
  if ($tipo -eq 1) { return ($base + $copia + '_log.ldf') }
  if ($indice -eq 0) { return ($base + $copia + '.mdf') }
  return ($base + $copia + '_' + $indice + '.ndf')
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

<# Ejecuta una instruccion larga (respaldo, restauracion). Media hora de margen. #>
function Ejecutar($cadena, $sql) {
  $con = New-Object System.Data.SqlClient.SqlConnection $cadena
  $con.Open()
  try {
    $cmd = $con.CreateCommand()
    $cmd.CommandText = $sql
    $cmd.CommandTimeout = 1800
    [void]$cmd.ExecuteNonQuery()
  } finally { $con.Close() }
}

if ($Probar) {
  $ok = 0
  function Comprobar($que, $real, $esperado) {
    if ("$real" -eq "$esperado") { $script:ok += 1; Write-Host "OK    $que" }
    else { Write-Host "MAL   $que  ($real != $esperado)"; exit 1 }
  }
  Comprobar 'un nombre normal sirve' (NombreDeCopiaValido 'pruebas_copia' 'pruebas') 'True'
  Comprobar 'sin el sufijo no sirve' (NombreDeCopiaValido 'pruebas' 'pruebas') 'False'
  Comprobar 'ni con otro sufijo' (NombreDeCopiaValido 'pruebas_ensayo' 'pruebas') 'False'
  Comprobar 'no puede ser la base real' (NombreDeCopiaValido 'pruebas_copia' 'pruebas_copia') 'False'
  Comprobar 'ni en otras mayusculas' (NombreDeCopiaValido 'Pruebas_Copia' 'pruebas_copia') 'False'
  Comprobar 'vacio no sirve' (NombreDeCopiaValido '' 'pruebas') 'False'
  Comprobar 'no puede llevar un punto y coma' (NombreDeCopiaValido 'x;DROP_copia' 'pruebas') 'False'
  Comprobar 'ni un corchete' (NombreDeCopiaValido 'x]_copia' 'pruebas') 'False'
  Comprobar 'ni espacios' (NombreDeCopiaValido 'mi base_copia' 'pruebas') 'False'
  Comprobar 'no puede empezar con numero' (NombreDeCopiaValido '1pruebas_copia' 'pruebas') 'False'
  Comprobar 'con 948 libres para 316 alcanza' (HayEspacio 948 316) 'True'
  Comprobar 'con 900 libres para 316 no' (HayEspacio 900 316) 'False'
  Comprobar 'el primer archivo de datos es .mdf' (RutaDeArchivoDeCopia 'D:\datos' 'x_copia' 0 0) 'D:\datos\x_copia.mdf'
  Comprobar 'el segundo lleva numero' (RutaDeArchivoDeCopia 'D:\datos' 'x_copia' 0 1) 'D:\datos\x_copia_1.ndf'
  Comprobar 'el registro es .ldf' (RutaDeArchivoDeCopia 'D:\datos' 'x_copia' 1 0) 'D:\datos\x_copia_log.ldf'
  Write-Host ''
  Write-Host "Todo bien ($ok comprobaciones)."
  exit 0
}

Escribir ''
Escribir 'COPIA DE PRUEBA DE LA BASE DEL POS'
Escribir ('Generado: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Escribir ('Equipo:   ' + $env:COMPUTERNAME)
Escribir ''

$raiz = "Server=$Instancia;Integrated Security=SSPI;TrustServerCertificate=True;Connect Timeout=15"
$master = "$raiz;Database=master"

# --- 1. La base real ---------------------------------------------------------
if ($Base -eq '') {
  $bases = Consultar $master "SELECT name FROM sys.databases WHERE database_id > 4 AND state = 0 ORDER BY name"
  $mejor = -1
  foreach ($fila in $bases.Rows) {
    $nombre = [string]$fila['name']
    # Una copia nunca es la base real, aunque tenga mas pedidos.
    if ($nombre -match '(?i)_copia$') { continue }
    try {
      $r = Consultar "$raiz;Database=$nombre" `
        "IF OBJECT_ID('dbo.cheques','U') IS NULL SELECT -1 AS n ELSE SELECT COUNT(*) AS n FROM dbo.cheques"
      $n = [int]$r.Rows[0]['n']
      if ($n -gt $mejor) { $mejor = $n; $Base = $nombre }
    } catch { }
  }
}
if ($Base -eq '') { Escribir 'No se encontro la base del POS.'; exit 1 }
if ($Base -notmatch '^[A-Za-z][A-Za-z0-9_]*$') { Escribir "El nombre de la base ($Base) trae caracteres raros. No se sigue."; exit 1 }

if ($NombreCopia -eq '') { $NombreCopia = $Base + '_copia' }
if (-not (NombreDeCopiaValido $NombreCopia $Base)) {
  Escribir "El nombre de la copia ($NombreCopia) no sirve."
  Escribir 'Tiene que empezar con letra, llevar solo letras, numeros y guion bajo,'
  Escribir 'terminar en _copia y ser distinto al de la base real.'
  exit 1
}

# --- 2. Cuanto pesa y donde caben los archivos -------------------------------
$tam = Consultar $master "SELECT CAST(SUM(size) * 8.0 / 1024 AS decimal(12,1)) AS mb FROM sys.master_files WHERE database_id = DB_ID(N'$Base')"
$baseMB = [double]$tam.Rows[0]['mb']

$archivos = Consultar $master "SELECT name, type, physical_name FROM sys.master_files WHERE database_id = DB_ID(N'$Base') ORDER BY file_id"
$carpetaDatos = Split-Path -Parent ([string]$archivos.Rows[0]['physical_name'])

# El respaldo va a la carpeta de respaldos que SQL Server tiene configurada, que
# es una donde su servicio seguro puede escribir. Si no se encuentra, a la de
# los datos de la propia base.
$carpetaRespaldo = $carpetaDatos
try {
  $rr = Consultar $master "
    DECLARE @d nvarchar(4000);
    EXEC master.dbo.xp_instance_regread N'HKEY_LOCAL_MACHINE', N'Software\Microsoft\MSSQLServer\MSSQLServer', N'BackupDirectory', @d OUTPUT;
    SELECT @d AS ruta"
  if ($rr.Rows.Count -gt 0 -and -not ($rr.Rows[0]['ruta'] -is [System.DBNull]) -and ([string]$rr.Rows[0]['ruta']).Trim() -ne '') {
    $carpetaRespaldo = [string]$rr.Rows[0]['ruta']
  }
} catch { }

$libreMB = $null
try {
  $letra = $carpetaDatos.Substring(0, 1)
  $d1 = New-Object System.IO.DriveInfo ($letra)
  $libreMB = [math]::Round($d1.AvailableFreeSpace / 1MB, 0)
  $letraR = $carpetaRespaldo.Substring(0, 1)
  if ($letraR -ine $letra) {
    $d2 = New-Object System.IO.DriveInfo ($letraR)
    $libreMB = [math]::Min($libreMB, [math]::Round($d2.AvailableFreeSpace / 1MB, 0))
  }
} catch { }

Escribir "  Base real:         $Base ($baseMB MB)"
Escribir "  Copia que se crea: $NombreCopia"
Escribir "  Archivos de datos: $carpetaDatos"
Escribir "  Respaldo temporal: $carpetaRespaldo"
if ($null -ne $libreMB) { Escribir "  Espacio libre:     $libreMB MB" }
Escribir ''

if ($null -ne $libreMB -and -not (HayEspacio $libreMB $baseMB)) {
  Escribir 'NO HAY ESPACIO SUFICIENTE. Hace falta el triple del tamano de la base.'
  Escribir 'No se hizo nada.'
  exit 1
}

# --- 3. Si ya existe ---------------------------------------------------------
$existe = Consultar $master "SELECT DB_ID(N'$NombreCopia') AS id"
$yaHay = -not ($existe.Rows[0]['id'] -is [System.DBNull])
if ($yaHay -and -not $Reemplazar) {
  Escribir "YA EXISTE una base llamada $NombreCopia. No se toca."
  Escribir 'Para rehacerla desde cero, corra el archivo con -Reemplazar.'
  exit 1
}

# --- 4. Confirmacion ---------------------------------------------------------
Escribir 'LA BASE REAL NO SE MODIFICA. Se lee para sacar un respaldo y con el se'
Escribir 'arma una base nueva con otro nombre.'
if ($yaHay) { Escribir "SE BORRA la copia anterior ($NombreCopia) y se arma otra." }
Escribir 'Puede hacerse con el local trabajando: dura uno o dos minutos y la caja'
Escribir 'puede ir un poco mas lenta mientras tanto.'
Escribir ''
$resp = Read-Host 'Escriba SI para continuar'
if ($resp.Trim().ToUpper() -ne 'SI') { Escribir 'No se hizo nada.'; exit 0 }
Escribir ''

# --- 5. Respaldo, verificacion y restauracion --------------------------------
$sello = Get-Date -Format 'yyyyMMdd-HHmmss'
$archivoRespaldo = $carpetaRespaldo.TrimEnd([char]92) + [string][char]92 + $NombreCopia + '-' + $sello + '.bak'

if ($yaHay) {
  Escribir '  Quitando la copia anterior...'
  Ejecutar $master "ALTER DATABASE [$NombreCopia] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$NombreCopia];"
}

Escribir '  1/3  Sacando el respaldo (COPY_ONLY, no altera los respaldos de la pizzeria)...'
Ejecutar $master "BACKUP DATABASE [$Base] TO DISK = N'$archivoRespaldo' WITH COPY_ONLY, INIT, CHECKSUM"

Escribir '  2/3  Verificando que el respaldo se pueda leer...'
Ejecutar $master "RESTORE VERIFYONLY FROM DISK = N'$archivoRespaldo' WITH CHECKSUM"

Escribir '  3/3  Armando la copia con otro nombre...'
$mueve = @()
$nDatos = 0
foreach ($f in $archivos.Rows) {
  $tipo = [int]$f['type']
  $destino = RutaDeArchivoDeCopia $carpetaDatos $NombreCopia $tipo $nDatos
  if ($tipo -ne 1) { $nDatos += 1 }
  $mueve += ("MOVE N'{0}' TO N'{1}'" -f ([string]$f['name']), $destino)
}
Ejecutar $master ("RESTORE DATABASE [$NombreCopia] FROM DISK = N'$archivoRespaldo' WITH " + ($mueve -join ', '))

# Sin copias de seguridad del registro la copia no necesita el modo completo, y
# asi su archivo de registro no crece sin parar con las pruebas.
Ejecutar $master "ALTER DATABASE [$NombreCopia] SET RECOVERY SIMPLE"

# --- 6. Comprobar ------------------------------------------------------------
Escribir ''
Escribir '  Comprobando que la copia quedo completa:'
Escribir ''
Escribir ('  {0,-14} {1,10} {2,10}' -f 'tabla', 'real', 'copia')
Escribir ('  {0,-14} {1,10} {2,10}' -f '--------------', '----------', '----------')
$todoIgual = $true
foreach ($t in @('cheques', 'cheqdet', 'clientes', 'productos', 'direccionesdomicilio', 'chequespagos')) {
  $a = [int](Consultar "$raiz;Database=$Base" "SELECT COUNT(*) AS n FROM dbo.$t").Rows[0]['n']
  $b = [int](Consultar "$raiz;Database=$NombreCopia" "SELECT COUNT(*) AS n FROM dbo.$t").Rows[0]['n']
  $marca = if ($a -eq $b) { '' } else { '  <-- cambio durante la copia' ; $todoIgual = $false }
  Escribir ('  {0,-14} {1,10} {2,10}{3}' -f $t, $a, $b, $marca)
}
Escribir ''
if (-not $todoIgual) {
  Escribir '  Una diferencia de unas pocas filas es normal si el local estaba facturando'
  Escribir '  mientras se sacaba el respaldo. Una diferencia grande no lo es: avise.'
  Escribir ''
}

# --- 7. Limpiar --------------------------------------------------------------
if ($ConservarRespaldo) {
  Escribir "  El respaldo se conserva en: $archivoRespaldo"
} else {
  try {
    Remove-Item -Path $archivoRespaldo -Force
    Escribir '  Se borro el archivo de respaldo temporal (traia los datos de los clientes).'
  } catch {
    Escribir "  NO se pudo borrar el respaldo temporal. Borrelo a mano: $archivoRespaldo"
  }
}

Escribir ''
Escribir '============================================================'
Escribir "LISTO. Ahora existe la base $NombreCopia."
Escribir 'La base real no se toco.'
Escribir '============================================================'
