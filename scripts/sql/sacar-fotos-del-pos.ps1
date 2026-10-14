<#
  SACA LAS FOTOS DE LOS PRODUCTOS DEL POS A UNA CARPETA

  PARA QUE SIRVE

  El POS guarda fotos de unos 145 productos dentro de la base (columnas de tipo
  imagen en la tabla productos). Si son buenas, sirven para el menu de la app sin
  que nadie tenga que sacar fotos nuevas. Este script las exporta a una carpeta
  para poder mirarlas, y deja un indice con a que producto pertenece cada una.

  Deja en la carpeta fotos-pos, al lado de este archivo:
    - una imagen por producto y por columna: 01012-imagen.jpg ...
    - indice.csv: producto, nombre, grupo, columna, tamano, tipo de archivo

  Y escribe un resumen en salida-fotos.txt: cuantas hay, cuanto pesan y de que
  tipo son. Ese resumen es lo que hay que mandar; la carpeta se puede comprimir y
  mandar si el resumen dice que valen la pena.

  NO SACA DATOS DE CLIENTES (solo imagenes de productos). NO ESCRIBE NADA en la base.
  Se puede correr con el negocio trabajando.
#>

param(
  [string]$Instancia = '.\NATIONALSOFT',
  [string]$Base = '',
  [switch]$Probar
)

$ErrorActionPreference = 'Stop'
$salida = Join-Path $PSScriptRoot 'salida-fotos.txt'
$carpetaFotos = Join-Path $PSScriptRoot 'fotos-pos'
$lineas = @()

# Las columnas de imagen de productos. Se miran todas; las vacias no cuentan.
$COLUMNAS = @('imagen', 'imagenmenuelectronico', 'imagenbackoffice')
# Una foto de mas de 8 MB no es una foto de menu: se anota y no se saca.
$TOPE_BYTES = 8MB

function Escribir($texto) {
  $script:lineas += $texto
  Write-Host $texto
}

<#
  Que tipo de archivo es, mirando los primeros bytes (no la extension, que aqui no hay).

  Devuelve la extension. El POS (hecho en Visual FoxPro) a veces guarda imagenes
  envueltas en otra cosa; si no se reconoce, 'bin' y se anota.
#>
function TipoDeImagen([byte[]]$b) {
  if ($null -eq $b -or $b.Length -lt 4) { return 'bin' }
  if ($b[0] -eq 0xFF -and $b[1] -eq 0xD8 -and $b[2] -eq 0xFF) { return 'jpg' }
  if ($b[0] -eq 0x89 -and $b[1] -eq 0x50 -and $b[2] -eq 0x4E -and $b[3] -eq 0x47) { return 'png' }
  if ($b[0] -eq 0x47 -and $b[1] -eq 0x49 -and $b[2] -eq 0x46 -and $b[3] -eq 0x38) { return 'gif' }
  if ($b[0] -eq 0x42 -and $b[1] -eq 0x4D) { return 'bmp' }
  if ($b[0] -eq 0x52 -and $b[1] -eq 0x49 -and $b[2] -eq 0x46 -and $b[3] -eq 0x46) { return 'webp' }
  return 'bin'
}

<# Un nombre de archivo seguro a partir de un codigo del POS. #>
function NombreSeguro([string]$s) {
  $limpio = ($s -replace '[^A-Za-z0-9\-_\.]', '_')
  if ($limpio.Length -eq 0) { return 'sin-codigo' }
  return $limpio
}

if ($Probar) {
  $ok = 0
  function Comprobar($que, $real, $esperado) {
    if ("$real" -eq "$esperado") { $script:ok += 1; Write-Host "OK    $que" }
    else { Write-Host "MAL   $que  ($real != $esperado)"; exit 1 }
  }
  Comprobar 'reconoce un jpeg' (TipoDeImagen ([byte[]](0xFF, 0xD8, 0xFF, 0xE0, 0))) 'jpg'
  Comprobar 'reconoce un png' (TipoDeImagen ([byte[]](0x89, 0x50, 0x4E, 0x47, 0x0D))) 'png'
  Comprobar 'reconoce un gif' (TipoDeImagen ([byte[]](0x47, 0x49, 0x46, 0x38, 0x39))) 'gif'
  Comprobar 'reconoce un bmp' (TipoDeImagen ([byte[]](0x42, 0x4D, 0, 0, 0))) 'bmp'
  Comprobar 'reconoce un webp' (TipoDeImagen ([byte[]](0x52, 0x49, 0x46, 0x46, 0))) 'webp'
  Comprobar 'algo desconocido es bin' (TipoDeImagen ([byte[]](1, 2, 3, 4, 5))) 'bin'
  Comprobar 'muy corto es bin' (TipoDeImagen ([byte[]](0xFF, 0xD8))) 'bin'
  Comprobar 'nulo es bin' (TipoDeImagen $null) 'bin'
  Comprobar 'un codigo normal no cambia' (NombreSeguro '01012') '01012'
  Comprobar 'un codigo raro se limpia' (NombreSeguro 'A/B\C:D') 'A_B_C_D'
  Comprobar 'un codigo vacio no da un nombre vacio' (NombreSeguro '') 'sin-codigo'
  Write-Host ''
  Write-Host "Todo bien ($ok comprobaciones)."
  exit 0
}

Escribir ''
Escribir 'LAS FOTOS DE LOS PRODUCTOS DEL POS'
Escribir ('Generado: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Escribir ('Equipo:   ' + $env:COMPUTERNAME)
Escribir ''

$raiz = "Server=$Instancia;Integrated Security=SSPI;TrustServerCertificate=True;Connect Timeout=15"

function Consultar($cadena, $sql) {
  $con = New-Object System.Data.SqlClient.SqlConnection $cadena
  $con.Open()
  try {
    $cmd = $con.CreateCommand(); $cmd.CommandText = $sql; $cmd.CommandTimeout = 120
    $ad = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
    $t = New-Object System.Data.DataTable; [void]$ad.Fill($t); return ,$t
  } finally { $con.Close() }
}

if ($Base -eq '') {
  $bases = Consultar "$raiz;Database=master" "SELECT name FROM sys.databases WHERE database_id > 4 AND state = 0 ORDER BY name"
  $mejor = -1
  foreach ($fila in $bases.Rows) {
    $nombre = [string]$fila['name']
    # Una copia de prueba nunca se elige sola: tendria mas pedidos que la real.
    if ($nombre -match '(?i)_copia$') { continue }
    try {
      $r = Consultar "$raiz;Database=$nombre" "IF OBJECT_ID('dbo.cheques','U') IS NULL SELECT -1 AS n ELSE SELECT COUNT(*) AS n FROM dbo.cheques"
      $n = [int]$r.Rows[0]['n']
      if ($n -gt $mejor) { $mejor = $n; $Base = $nombre }
    } catch { }
  }
}
if ($Base -eq '') { Escribir 'No se encontro ninguna base con pedidos.'; $lineas | Set-Content -Path $salida -Encoding utf8; exit 1 }
$cadena = "$raiz;Database=$Base"
Escribir "Base: $Base"
Escribir ''

# --- 1. Resumen -------------------------------------------------------------
Escribir '============================================================'
Escribir '1. CUANTAS FOTOS HAY Y CUANTO PESAN'
Escribir '============================================================'
Escribir ''
foreach ($c in $COLUMNAS) {
  try {
    $r = Consultar $cadena "
      SELECT COUNT(*) AS productos_con_foto,
             ISNULL(SUM(DATALENGTH([$c])), 0) AS bytes_total,
             ISNULL(AVG(DATALENGTH([$c])), 0) AS bytes_promedio,
             ISNULL(MAX(DATALENGTH([$c])), 0) AS bytes_maximo
      FROM dbo.productos WHERE [$c] IS NOT NULL AND DATALENGTH([$c]) > 0"
    $fila = $r.Rows[0]
    Escribir ('  {0,-24} {1,4} productos   {2,7:N1} MB en total   {3,6:N0} KB promedio   {4,6:N0} KB la mas grande' -f `
        $c, $fila['productos_con_foto'], ([double]$fila['bytes_total'] / 1MB), ([double]$fila['bytes_promedio'] / 1KB), ([double]$fila['bytes_maximo'] / 1KB))
  } catch {
    Escribir ("  {0,-24} no se pudo leer: {1}" -f $c, $_.Exception.Message)
  }
}
Escribir ''

# --- 2. Sacarlas a la carpeta -------------------------------------------------
Escribir '============================================================'
Escribir '2. SACARLAS A LA CARPETA fotos-pos'
Escribir '============================================================'
Escribir ''
if (-not (Test-Path $carpetaFotos)) { [void](New-Item -ItemType Directory -Path $carpetaFotos) }

$indice = @('producto;nombre;grupo;columna;kb;tipo;archivo')
$sacadas = 0
$porTipo = @{}
$grandes = 0

foreach ($c in $COLUMNAS) {
  try {
    $ids = Consultar $cadena "
      SELECT p.idproducto, p.descripcion, p.idgrupo
      FROM dbo.productos p WHERE p.[$c] IS NOT NULL AND DATALENGTH(p.[$c]) > 0 ORDER BY p.idproducto"
  } catch { continue }

  foreach ($f in $ids.Rows) {
    $id = [string]$f['idproducto']
    $idq = $id.Replace("'", "''")
    try {
      $d = Consultar $cadena "SELECT [$c] AS foto, DATALENGTH([$c]) AS largo FROM dbo.productos WHERE idproducto = '$idq'"
      $largo = [long]$d.Rows[0]['largo']
      if ($largo -gt $TOPE_BYTES) { $grandes += 1; Escribir ("  (se salta {0}: pesa {1:N1} MB)" -f $id, ($largo / 1MB)); continue }
      $bytes = [byte[]]$d.Rows[0]['foto']
      $tipo = TipoDeImagen $bytes
      $archivo = '{0}-{1}.{2}' -f (NombreSeguro $id), $c, $tipo
      [System.IO.File]::WriteAllBytes((Join-Path $carpetaFotos $archivo), $bytes)
      $nombre = ([string]$f['descripcion']) -replace ';', ','
      $indice += ('{0};{1};{2};{3};{4};{5};{6}' -f $id, $nombre, [string]$f['idgrupo'], $c, [math]::Round($largo / 1KB), $tipo, $archivo)
      $sacadas += 1
      if (-not $porTipo.ContainsKey($tipo)) { $porTipo[$tipo] = 0 }
      $porTipo[$tipo] += 1
    } catch {
      Escribir ("  No se pudo sacar {0} ({1}): {2}" -f $id, $c, $_.Exception.Message)
    }
  }
}

[System.IO.File]::WriteAllLines((Join-Path $carpetaFotos 'indice.csv'), $indice, (New-Object System.Text.UTF8Encoding($true)))
Escribir ("  Fotos sacadas: {0}" -f $sacadas)
foreach ($k in ($porTipo.Keys | Sort-Object)) { Escribir ("    tipo {0}: {1}" -f $k, $porTipo[$k]) }
if ($grandes -gt 0) { Escribir ("  Saltadas por pesar demasiado: {0}" -f $grandes) }
if ($porTipo.ContainsKey('bin')) { Escribir '  Las de tipo bin no se reconocieron como imagen: mandelas igual, hay que ver como estan guardadas.' }
Escribir ''
Escribir '============================================================'
Escribir 'LISTO.'
Escribir "  Resumen:  $salida"
Escribir "  Fotos:    $carpetaFotos"
Escribir 'Mande el resumen. Si hay fotos, comprima la carpeta fotos-pos y mandela tambien.'
Escribir '============================================================'

$lineas | Set-Content -Path $salida -Encoding utf8
