<#
  LAS IMPRESORAS DE ESTA COMPUTADORA

  PARA QUE SIRVE

  Para que la app de delivery imprima la comanda en la cocina y un tiquete en
  el mostrador, hay que saber QUE impresoras hay y COMO estan conectadas:

  - por red, con una direccion IP: se les puede mandar el trabajo directo;
  - por USB o por cable: solo se les puede imprimir desde la computadora a la
    que estan enchufadas;
  - compartidas desde otra computadora: se imprime pasando por esa.

  De eso depende todo el diseno, y desde afuera no se puede adivinar.

  NO SACA DATOS DE CLIENTES NI DE VENTAS. Solo los nombres de las impresoras y
  de sus puertos. Es la lista que ya muestra el Panel de control de Windows.

  No imprime nada, no cambia nada, no instala nada. Solo lee.
#>

param([switch]$Probar)

$ErrorActionPreference = 'Stop'
$salida = Join-Path $PSScriptRoot 'salida-impresoras.txt'
$lineas = @()

function Escribir($texto) {
  $script:lineas += $texto
  Write-Host $texto
}

<# El codigo de estado de Windows, en palabras. #>
function EstadoEnPalabras($codigo) {
  switch ([int]$codigo) {
    3 { return 'lista' }
    4 { return 'imprimiendo' }
    5 { return 'calentando' }
    6 { return 'detenida' }
    7 { return 'FUERA DE LINEA' }
    default { return "estado $codigo" }
  }
}

<#
  Como esta conectada una impresora, segun el nombre de su puerto.

  $tcp es un diccionario de puerto -> direccion IP y numero de puerto, sacado
  de los puertos de red que Windows tiene dados de alta.
#>
function ComoSeConecta($puerto, $tcp) {
  $p = [string]$puerto
  if ($tcp.ContainsKey($p)) {
    return ('POR RED, direccion {0}, puerto {1}' -f $tcp[$p].ip, $tcp[$p].puerto)
  }
  if ($p -like 'USB*') { return 'USB (solo se imprime desde esta computadora)' }
  if ($p -like 'LPT*' -or $p -like 'COM*') { return 'cable paralelo o serie' }
  if ($p.StartsWith('\\')) { return 'compartida desde otra computadora' }
  if ($p -in @('PORTPROMPT:', 'FILE:', 'nul:', 'XPSPort:')) { return 'no imprime en un aparato (PDF, archivo o similar)' }
  return 'otro tipo de puerto'
}

if ($Probar) {
  $ok = 0
  function Comprobar($que, $real, $esperado) {
    if ("$real" -eq "$esperado") { $script:ok += 1; Write-Host "OK    $que" }
    else { Write-Host "MAL   $que  ($real != $esperado)"; exit 1 }
  }
  $tcp = @{ 'IP_192.168.1.87' = @{ ip = '192.168.1.87'; puerto = 9100 } }
  Comprobar 'un puerto de red dice su direccion' (ComoSeConecta 'IP_192.168.1.87' $tcp) 'POR RED, direccion 192.168.1.87, puerto 9100'
  Comprobar 'un USB se reconoce' (ComoSeConecta 'USB001' $tcp) 'USB (solo se imprime desde esta computadora)'
  Comprobar 'un puerto paralelo tambien' (ComoSeConecta 'LPT1:' $tcp) 'cable paralelo o serie'
  Comprobar 'una compartida de otra PC' (ComoSeConecta '\\CAJA\EPSON' $tcp) 'compartida desde otra computadora'
  Comprobar 'el PDF no es un aparato' (ComoSeConecta 'PORTPROMPT:' $tcp) 'no imprime en un aparato (PDF, archivo o similar)'
  Comprobar 'lo desconocido se dice' (ComoSeConecta 'ALGO_RARO' $tcp) 'otro tipo de puerto'
  Comprobar 'el estado 3 es lista' (EstadoEnPalabras 3) 'lista'
  Comprobar 'el estado 7 avisa' (EstadoEnPalabras 7) 'FUERA DE LINEA'
  Write-Host ''
  Write-Host "Todo bien ($ok comprobaciones)."
  exit 0
}

Escribir ''
Escribir 'LAS IMPRESORAS DE ESTA COMPUTADORA'
Escribir ('Generado: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Escribir ('Equipo:   ' + $env:COMPUTERNAME)
Escribir ''

# Se usa WMI y no Get-Printer porque funciona igual en Windows viejos, y el
# servidor del local no sabemos de que ano es.
$puertosRed = @{}
try {
  foreach ($pt in (Get-WmiObject -Class Win32_TCPIPPrinterPort)) {
    $puertosRed[[string]$pt.Name] = @{ ip = [string]$pt.HostAddress; puerto = [int]$pt.PortNumber }
  }
} catch {
  Escribir '  (No se pudieron leer los puertos de red de esta computadora.)'
}

$impresoras = @()
try {
  $impresoras = @(Get-WmiObject -Class Win32_Printer)
} catch {
  Escribir 'No se pudo leer la lista de impresoras de esta computadora.'
  Escribir ('Motivo: ' + $_.Exception.Message)
  $lineas | Set-Content -Path $salida -Encoding utf8
  exit 1
}

Escribir '============================================================'
Escribir ("IMPRESORAS INSTALADAS: {0}" -f $impresoras.Count)
Escribir '============================================================'
Escribir ''

foreach ($i in ($impresoras | Sort-Object Name)) {
  Escribir ('  ' + $i.Name + $(if ($i.Default) { '   <-- la predeterminada' } else { '' }))
  Escribir ('      Marca y modelo:  ' + $i.DriverName)
  Escribir ('      Como se conecta: ' + (ComoSeConecta $i.PortName $puertosRed))
  Escribir ('      Puerto:          ' + $i.PortName)
  Escribir ('      Estado:          ' + $(if ($i.WorkOffline) { 'FUERA DE LINEA' } else { EstadoEnPalabras $i.PrinterStatus }))
  if ($i.Shared) {
    Escribir ('      Compartida como: ' + $i.ShareName)
  }
  Escribir ''
}

Escribir '============================================================'
Escribir 'LISTO. El informe quedo en:'
Escribir ('  ' + $salida)
Escribir 'Mande ese archivo.'
Escribir '============================================================'

$lineas | Set-Content -Path $salida -Encoding utf8
