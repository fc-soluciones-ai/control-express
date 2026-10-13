<#
  APUNTAR EL PROGRAMA DEL POS A LA COPIA, O DEVOLVERLO A LA BASE REAL

  El programa del POS lee a que base conectarse de dos archivos de texto:

    C:\NationalSoft\Softrestaurant9.5.0Pro\restaurant.ini
    C:\NationalSoft\Softrestaurant9.5.0Pro\INIS\Empresa 1.ini

  En ambos hay una linea  Catalog=pruebas . Este script la cambia a
  Catalog=pruebas_copia (modo Copia) o la devuelve a Catalog=pruebas (modo Real).

  SOLO AFECTA AL PROGRAMA DEL POS DE ESTA COMPUTADORA, y solo la proxima vez que se
  abra. Las otras cajas (PZLE-PC-01, etc.) tienen sus propios archivos y siguen
  conectadas a la base real. Cambiar estos archivos no toca ninguna base.

  ANTES DE CAMBIAR, GUARDA UNA COPIA de cada archivo, con la hora en el nombre.

  EN MODO Copia SE NIEGA si el programa del POS esta abierto en esta computadora, o
  si la base pruebas_copia no existe.

  SIEMPRE QUE TERMINE LA PRUEBA, correr el modo Real.
#>

param(
  [Parameter(Mandatory = $true)][ValidateSet('Copia', 'Real')][string]$Modo,
  [string]$Carpeta = 'C:\NationalSoft\Softrestaurant9.5.0Pro',
  [string]$Instancia = '.\NATIONALSOFT',
  [switch]$Probar
)

$ErrorActionPreference = 'Stop'

<#
  Cambia el valor de las lineas Catalog=... que valen exactamente $de.

  Devuelve el texto nuevo y cuantas lineas cambio. Conserva los saltos de linea y
  no toca ninguna otra linea (ni Catalog=softrestaurant95pro, ni nada parecido).
#>
function CambiarCatalogo([string]$texto, [string]$de, [string]$a) {
  $patron = '(?im)^([ \t]*Catalog[ \t]*=[ \t]*)' + [regex]::Escape($de) + '([ \t]*)(?=\r?$)'
  $n = ([regex]::Matches($texto, $patron)).Count
  $nuevo = [regex]::Replace($texto, $patron, ('${1}' + $a + '${2}'))
  return @{ texto = $nuevo; cambios = $n }
}

if ($Probar) {
  $ok = 0
  function Comprobar($que, $real, $esperado) {
    if ("$real" -eq "$esperado") { $script:ok += 1; Write-Host "OK    $que" }
    else { Write-Host "MAL   $que  ($real != $esperado)"; exit 1 }
  }
  $ini = "[DBSOFTRESTAURANT]`r`nDataSource=PZLE-SVR-02\NATIONALSOFT`r`nCatalog=pruebas`r`nRuta=C:\x\Empresa 1.ini`r`nCatalog=pruebas`r`n"
  $r = CambiarCatalogo $ini 'pruebas' 'pruebas_copia'
  Comprobar 'cambia las dos lineas' $r.cambios 2
  Comprobar 'quedan con la copia' ([regex]::Matches($r.texto, 'Catalog=pruebas_copia')).Count 2
  Comprobar 'no toca el DataSource' ([bool]($r.texto -match 'DataSource=PZLE-SVR-02\\NATIONALSOFT\r\n')) 'True'
  Comprobar 'conserva los saltos de linea' ($r.texto -split "`r`n").Count ($ini -split "`r`n").Count
  $vuelta = CambiarCatalogo $r.texto 'pruebas_copia' 'pruebas'
  Comprobar 'ida y vuelta deja el texto igual' ($vuelta.texto -ceq $ini) 'True'
  $otra = CambiarCatalogo "[X]`r`nCatalog=softrestaurant95pro`r`n" 'pruebas' 'pruebas_copia'
  Comprobar 'no toca otra base' $otra.cambios 0
  $dos = CambiarCatalogo "Catalog=pruebas_copia`r`n" 'pruebas' 'pruebas_copia'
  Comprobar 'pruebas no confunde con pruebas_copia' $dos.cambios 0
  $esp = CambiarCatalogo "Catalog = pruebas  `r`n" 'pruebas' 'pruebas_copia'
  Comprobar 'tolera espacios' $esp.cambios 1
  Write-Host ''
  Write-Host "Todo bien ($ok comprobaciones)."
  exit 0
}

$archivos = @(
  (Join-Path $Carpeta 'restaurant.ini'),
  (Join-Path (Join-Path $Carpeta 'INIS') 'Empresa 1.ini')
)
# Test-Path se equivoca con algunos archivos (ocultos, de sistema): se usa .NET directo.
$existentes = @()
foreach ($a in $archivos) {
  if ([System.IO.File]::Exists($a)) { $existentes += $a }
  else { Write-Host "  (no se encontro, se omite: $a)" }
}
if ($existentes.Count -eq 0) {
  Write-Host ''
  Write-Host "No se encontro ningun archivo de configuracion en: $Carpeta"
  Write-Host 'Esto es lo que hay en esa carpeta:'
  if ([System.IO.Directory]::Exists($Carpeta)) {
    Get-ChildItem -LiteralPath $Carpeta -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '(?i)ini|inis' } | ForEach-Object { Write-Host ('  ' + $_.Name) }
  } else { Write-Host '  (la carpeta no existe)' }
  Write-Host 'No se cambio nada.'
  exit 1
}
$archivos = $existentes

if ($Modo -eq 'Copia') {
  # El programa abierto ya leyo su configuracion: cambiar los archivos ahora no
  # serviria y dejaria dudas sobre a que base esta conectado.
  $abiertos = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
      $ruta = $null
      try { $ruta = $_.Path } catch { }
      ($ruta -and $ruta -like '*Softrestaurant9.5.0Pro*') -or ($_.ProcessName -match '(?i)softrestaurant')
    })
  if ($abiertos.Count -gt 0) {
    Write-Host 'El programa del POS esta ABIERTO en esta computadora:'
    $abiertos | ForEach-Object { Write-Host ('  ' + $_.ProcessName) }
    Write-Host 'Cierrelo y vuelva a correr esto. No se cambio nada.'
    exit 1
  }
  $raiz = "Server=$Instancia;Integrated Security=SSPI;TrustServerCertificate=True;Connect Timeout=15"
  $con = New-Object System.Data.SqlClient.SqlConnection "$raiz;Database=master"
  $con.Open()
  try {
    $cmd = $con.CreateCommand()
    $cmd.CommandText = "SELECT COUNT(*) FROM sys.databases WHERE name = 'pruebas_copia' AND state = 0"
    if ([int]$cmd.ExecuteScalar() -eq 0) { Write-Host 'No existe la base pruebas_copia. No se cambio nada.'; exit 1 }
  } finally { $con.Close() }
  $de = 'pruebas'; $a = 'pruebas_copia'
} else {
  $de = 'pruebas_copia'; $a = 'pruebas'
}

$sello = Get-Date -Format 'yyyyMMdd-HHmmss'
$total = 0
foreach ($arch in $archivos) {
  # Default = la pagina de codigos de Windows, que es como el programa escribe estos archivos.
  $texto = [System.IO.File]::ReadAllText($arch, [System.Text.Encoding]::Default)
  $r = CambiarCatalogo $texto $de $a
  if ($r.cambios -eq 0) {
    Write-Host ("  {0}: no tiene ninguna linea Catalog={1}. No se cambia." -f (Split-Path $arch -Leaf), $de)
    continue
  }
  Copy-Item -LiteralPath $arch -Destination ($arch + '.antes-' + $sello) -Force
  [System.IO.File]::WriteAllText($arch, $r.texto, [System.Text.Encoding]::Default)
  $total += $r.cambios
  Write-Host ("  {0}: {1} linea(s) cambiada(s) de Catalog={2} a Catalog={3}. Respaldo: {4}" -f (Split-Path $arch -Leaf), $r.cambios, $de, $a, ((Split-Path $arch -Leaf) + '.antes-' + $sello))
}

Write-Host ''
Write-Host 'Como quedo ahora:'
foreach ($arch in $archivos) {
  Write-Host ('  ' + (Split-Path $arch -Leaf))
  Get-Content -LiteralPath $arch | Where-Object { $_ -match '(?i)^\s*(Catalog|DataSource)\s*=' } | ForEach-Object { Write-Host ('      ' + $_.Trim()) }
}
Write-Host ''
if ($Modo -eq 'Copia') {
  Write-Host 'LISTO. Al abrir el programa del POS en ESTA computadora se conecta a pruebas_copia.'
  Write-Host 'Al terminar la prueba, corra DEVOLVER-POS-A-LA-REAL.bat.'
} else {
  Write-Host 'LISTO. Al abrir el programa del POS en esta computadora se conecta a la base real (pruebas).'
}
