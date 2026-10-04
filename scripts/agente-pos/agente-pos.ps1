# =============================================================================
#  AGENTE DEL POS
# =============================================================================
#
#  CORRE EN EL SERVIDOR DEL LOCAL (PZLE-SVR-02), no en otra parte.
#
#  Lee los pedidos de Soft Restaurant y los manda a Control Express. Es la
#  unica pieza que toca las dos puntas, porque el POS esta en el local y la
#  aplicacion en la nube, sin VPN entre medio.
#
#  POR QUE UN AGENTE Y NO UNA CONEXION DIRECTA
#  Abrir el SQL Server a internet seria dejar la contabilidad del negocio al
#  alcance del primero que escanee esa direccion, y hay robots que hacen
#  exactamente eso todo el dia. Asi el SQL Server nunca se asoma: el que sale
#  es el agente, y solo de salida.
#
#  NO USA CONTRASENAS
#  Entra a SQL Server con la cuenta de Windows de esta maquina, igual que los
#  scripts que ya se corrieron aqui. No hay ninguna clave de base de datos
#  guardada en ningun archivo.
#
#  SOLO LEE
#  No escribe, no borra y no modifica nada del POS. Si manana hiciera falta
#  escribirle algo, seria otro programa y otra conversacion.
#
#  COMO SE USA
#    .\agente-pos.ps1 -Probar      lee y muestra lo que mandaria, SIN mandar
#    .\agente-pos.ps1 -UnaVez      lee y manda una vez
#    .\agente-pos.ps1              se queda corriendo y manda cada 30 segundos
#    .\agente-pos.ps1 -Autoprueba  se prueba a si mismo, sin base y sin red
#
#  CONFIGURACION
#  Al lado de este archivo tiene que haber un agente-pos.config.json asi:
#
#    {
#      "url":     "https://control-express.vercel.app/api/pos/pedidos",
#      "secreto": "el mismo que POS_AGENTE_SECRETO en la aplicacion",
#      "diasAlArrancar": 7
#    }
#
#  Ese archivo tiene el secreto, asi que no se manda por correo ni se copia a
#  ningun lado.
# =============================================================================

param(
  [switch]$Probar,
  [switch]$UnaVez,
  [switch]$Autoprueba,
  [int]$CadaSegundos = 30
)

$ErrorActionPreference = 'Stop'
$carpeta = $PSScriptRoot
$rutaConfig = Join-Path $carpeta 'agente-pos.config.json'
$rutaMarca = Join-Path $carpeta 'agente-pos.marca.txt'
$rutaRegistro = Join-Path $carpeta 'agente-pos.registro.txt'

function Anotar($texto) {
  $linea = ('{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $texto)
  Write-Host $linea
  if (-not $Autoprueba) { Add-Content -Path $rutaRegistro -Value $linea -Encoding utf8 }
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
  La firma del envio.

  Se firma la hora junto con el cuerpo, con HMAC-SHA256 y el secreto
  compartido. La hora va dentro de la firma para que un envio grabado no se
  pueda repetir manana: el servidor rechaza lo que tenga mas de cinco minutos.
#>
function Firmar($secreto, $hora, $cuerpo) {
  $hmac = New-Object System.Security.Cryptography.HMACSHA256
  $hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($secreto)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes("$hora.$cuerpo")
  $firma = $hmac.ComputeHash($bytes)
  $hmac.Dispose()
  return ([System.BitConverter]::ToString($firma) -replace '-', '').ToLower()
}

<#
  Convierte una fila del POS en lo que entiende la aplicacion.

  Las fechas salen en ISO con zona, porque el servidor del local corre en hora
  de Costa Rica y la aplicacion en UTC: mandar "14:30" a secas haria que un
  pedido de la noche apareciera al dia siguiente.
#>
function ComoPedido($fila) {
  $iso = {
    param($v)
    if ($null -eq $v -or $v -is [System.DBNull]) { return $null }
    return ([datetime]$v).ToString('o')
  }

  # El POS tiene DOS columnas de cliente y usa una u otra segun como se tomo
  # el pedido. En esta instalacion idclientedomicilio viene vacio y el cliente
  # real esta en idcliente. Se toma la que tenga algo, empezando por la de
  # domicilio, que es la mas especifica cuando existe.
  $cliente = ([string]$fila['idclientedomicilio']).Trim()
  if ($cliente -eq '') { $cliente = ([string]$fila['idcliente']).Trim() }

  return [ordered]@{
    folio         = [string]$fila['folio']
    serieFolio    = [string]$fila['seriefolio']
    claveCliente  = $cliente
    idDireccion   = [string]$fila['iddireccion']
    telefonoUsado = [string]$fila['telefonousadodomicilio']
    idMesero      = [string]$fila['idmesero']
    entroEn       = (& $iso $fila['fecha'])
    empaquetadoEn = (& $iso $fila['empaquetado'])
    asignadoEn    = (& $iso $fila['asignacion'])
    salioEn       = (& $iso $fila['salidarepartidor'])
    llegoEn       = (& $iso $fila['arriborepartidor'])
    cerradoEn     = (& $iso $fila['cierre'])
    esADomicilio  = ([string]$fila['iddireccion']).Trim() -ne ''
    cancelado     = [bool]$fila['cancelado']
    total         = [double]$fila['total']
  }
}

<#
  Una copia del pedido con el cliente y el telefono tapados.

  Se usa solo en el modo de prueba, para que la salida se pueda mandar por
  WhatsApp sin que viajen datos de nadie.

  Se copia campo por campo y no con .Clone() porque el diccionario ordenado de
  PowerShell 5.1 NO tiene ese metodo, aunque la documentacion de .NET diga que
  si. Tapar sobre el original tampoco sirve: dejaria el pedido sin cliente
  justo antes de mandarlo.
#>
function Tapado($pedido) {
  $copia = [ordered]@{}
  foreach ($clave in $pedido.Keys) { $copia[$clave] = $pedido[$clave] }
  if ($copia['claveCliente']) { $copia['claveCliente'] = '***' }
  if ($copia['telefonoUsado']) { $copia['telefonoUsado'] = '***' }
  return $copia
}

# ---------------------------------------------------------------------------
if ($Autoprueba) {
  $fallos = 0
  function Comprobar($d, $real, $esperado) {
    if ("$real" -eq "$esperado") { Write-Host "OK    $d" }
    else {
      Write-Host "FALLA $d"; Write-Host "        esperado: $esperado"; Write-Host "        obtenido: $real"
      $script:fallos = $script:fallos + 1
    }
  }

  # La firma tiene que dar lo mismo que calcula el servidor en Node.
  $firma = Firmar 'secreto' '1790000000' '{"pedidos":[]}'
  Comprobar 'la firma son 64 caracteres hex' $firma.Length 64
  Comprobar 'solo trae minusculas y digitos' ([bool]($firma -match '^[0-9a-f]+$')) 'True'
  Comprobar 'la misma entrada da la misma firma' (Firmar 'secreto' '1790000000' '{"pedidos":[]}') $firma
  Comprobar 'otro secreto da otra firma' ([bool]((Firmar 'otro' '1790000000' '{"pedidos":[]}') -ne $firma)) 'True'
  Comprobar 'otra hora da otra firma' ([bool]((Firmar 'secreto' '1790000001' '{"pedidos":[]}') -ne $firma)) 'True'

  # Una fila del POS, con las columnas tal como se llaman alla.
  $t = New-Object System.Data.DataTable
  foreach ($c in @('folio','seriefolio','idcliente','idclientedomicilio','iddireccion','telefonousadodomicilio','idmesero','cancelado','total')) {
    [void]$t.Columns.Add($c)
  }
  foreach ($c in @('fecha','empaquetado','asignacion','salidarepartidor','arriborepartidor','cierre')) {
    [void]$t.Columns.Add($c, [datetime])
  }
  $f = $t.NewRow()
  $f['folio'] = '12345'; $f['seriefolio'] = 'A'; $f['idclientedomicilio'] = '008686'
  $f['iddireccion'] = 'D1'; $f['telefonousadodomicilio'] = '87069355'; $f['idmesero'] = '12'
  $f['cancelado'] = $false; $f['total'] = '12500.50'
  $f['fecha'] = [datetime]'2026-10-04T19:05:00'
  $f['salidarepartidor'] = [datetime]'2026-10-04T19:36:00'
  $t.Rows.Add($f)

  $p = ComoPedido $t.Rows[0]
  Comprobar 'el folio viaja como texto' $p.folio '12345'
  Comprobar 'la clave del cliente conserva sus ceros' $p.claveCliente '008686'

  # En esta instalacion idclientedomicilio viene vacio y el cliente esta en
  # idcliente. Sin esto, ningun pedido se puede ligar a su ficha.
  $f3 = $t.NewRow()
  $f3['folio'] = '555'; $f3['idclientedomicilio'] = ''; $f3['idcliente'] = '003863'
  $f3['iddireccion'] = 'CASA'; $f3['cancelado'] = $false; $f3['total'] = '0'
  $f3['fecha'] = [datetime]'2026-10-04T18:00:00'
  $t.Rows.Add($f3)
  $p3 = ComoPedido $t.Rows[$t.Rows.Count - 1]
  Comprobar 'si no hay idclientedomicilio se usa idcliente' $p3.claveCliente '003863'
  Comprobar 'y ese tambien conserva sus ceros' ($p3.claveCliente -eq '003863') 'True'
  Comprobar 'el total va con decimales' $p.total '12500.5'
  Comprobar 'un pedido con direccion es a domicilio' $p.esADomicilio 'True'
  Comprobar 'las marcas vacias van nulas' ($null -eq $p.empaquetadoEn) 'True'
  Comprobar 'la fecha sale en ISO' ([bool]($p.entroEn -match '^2026-10-04T19:05')) 'True'

  $f2 = $t.NewRow(); $f2['folio'] = '999'; $f2['seriefolio'] = ''
  $f2['iddireccion'] = ''; $f2['cancelado'] = $true; $f2['total'] = '0'
  $f2['fecha'] = [datetime]'2026-10-04T20:00:00'
  $t.Rows.Add($f2)
  # Siempre la ultima: con un indice fijo, agregar una fila mas arriba rompe
  # todas las comprobaciones de abajo sin que se note por que.
  $p2 = ComoPedido $t.Rows[$t.Rows.Count - 1]
  Comprobar 'sin direccion no es a domicilio' $p2.esADomicilio 'False'
  Comprobar 'un cancelado llega marcado' $p2.cancelado 'True'

  # El modo de prueba: tapar los datos y contar. Los dos fallaban y los dos
  # corren SOLO alla, en una maquina a la que no llegamos.
  $tapado = Tapado $p
  Comprobar 'el cliente sale tapado' $tapado.claveCliente '***'
  Comprobar 'el telefono tambien' $tapado.telefonoUsado '***'
  Comprobar 'el folio se deja ver' $tapado.folio '12345'
  Comprobar 'y el original queda intacto' $p.claveCliente '008686'

  $dos = @($p, $p2)
  # Con UN solo resultado, sin el @() el .Count da la cantidad de campos.
  Comprobar 'cuenta los de a domicilio' @($dos | Where-Object { $_.esADomicilio }).Count 1
  Comprobar 'cuenta los que ya salieron' @($dos | Where-Object { $_.salioEn }).Count 1
  Comprobar 'y los que no tienen ninguno' @($dos | Where-Object { $_.llegoEn }).Count 0

  Write-Host ''
  if ($fallos -eq 0) { Write-Host 'Todo bien.' } else { Write-Host "$fallos fallas"; exit 1 }
  exit 0
}
# ---------------------------------------------------------------------------

# --- Configuracion -----------------------------------------------------------
if (-not (Test-Path $rutaConfig)) {
  Anotar "FALTA el archivo agente-pos.config.json al lado de este script."
  exit 1
}
$config = Get-Content $rutaConfig -Raw | ConvertFrom-Json
if (-not $config.url -or -not $config.secreto) {
  Anotar "El archivo de configuracion necesita 'url' y 'secreto'."
  exit 1
}
$diasAlArrancar = 7
if ($config.diasAlArrancar) { $diasAlArrancar = [int]$config.diasAlArrancar }

# --- Encontrar la base con las ventas ---------------------------------------
$instancias = @()
foreach ($llave in @(
    'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Microsoft SQL Server')) {
  try {
    $v = (Get-ItemProperty -Path $llave -Name 'InstalledInstances' -ErrorAction Stop).InstalledInstances
    foreach ($i in $v) { if ($instancias -notcontains $i) { $instancias += $i } }
  } catch { }
}
if ($instancias.Count -eq 0) { Anotar 'NO SE ENCONTRO SQL SERVER EN ESTA MAQUINA.'; exit 1 }

$cadena = $null
foreach ($i in $instancias) {
  if ($i -eq 'MSSQLSERVER') { $servidor = '.' } else { $servidor = ".\$i" }
  $raiz = "Server=$servidor;Integrated Security=True;Connect Timeout=15;TrustServerCertificate=True"
  try { $bases = Consultar "$raiz;Database=master" "SELECT name FROM sys.databases WHERE database_id > 4 AND state = 0" }
  catch { continue }
  foreach ($b in $bases.Rows) {
    $nombre = [string]$b['name']
    try {
      $r = Consultar "$raiz;Database=$nombre" "IF OBJECT_ID('dbo.cheques','U') IS NULL SELECT -1 AS n ELSE SELECT COUNT(*) AS n FROM dbo.cheques"
      $n = [int]$r.Rows[0]['n']
      # Gana la base con mas pedidos, no la que tenga mejor nombre: aqui la de
      # produccion se llama "pruebas" y la que se llama "softrestaurant95pro"
      # esta vacia.
      if ($n -gt 0 -and ($null -eq $cadena -or $n -gt $mejor)) {
        $cadena = "$raiz;Database=$nombre"; $mejor = $n; $baseElegida = $nombre
      }
    } catch { }
  }
}
if ($null -eq $cadena) { Anotar 'NINGUNA BASE TIENE PEDIDOS.'; exit 1 }
Anotar "Base: $baseElegida ($mejor pedidos). Solo lectura, con la cuenta de Windows."

# --- Desde cuando leer -------------------------------------------------------
# La marca es la fecha del ultimo pedido que se mando bien. Se guarda en disco
# para que reiniciar la maquina no vuelva a mandar la historia entera.
if (Test-Path $rutaMarca) {
  $desde = Get-Content $rutaMarca -Raw
} else {
  $desde = (Get-Date).AddDays(-$diasAlArrancar).ToString('yyyy-MM-dd HH:mm:ss')
  Anotar "Primera corrida: se mandan los ultimos $diasAlArrancar dias."
}

function UnaPasada {
  param($desde)

  # Se relee una ventana hacia atras a proposito: un pedido que entro hace
  # media hora pudo cambiar de estado despues (salio, llego, se cancelo), y si
  # solo miraramos lo nuevo esos cambios no llegarian nunca.
  $sql = "
    SELECT TOP 500
      folio, seriefolio, fecha, empaquetado, asignacion,
      salidarepartidor, arriborepartidor, cierre,
      idcliente, idclientedomicilio, iddireccion, telefonousadodomicilio,
      idmesero, cancelado, total
    FROM dbo.cheques
    WHERE fecha >= DATEADD(hour, -6, CONVERT(datetime, '$desde', 120))
    ORDER BY fecha ASC"

  $filas = Consultar $cadena $sql
  if ($null -eq $filas -or $filas.Rows.Count -eq 0) { return $desde }

  $pedidos = @()
  foreach ($f in $filas.Rows) { $pedidos += (ComoPedido $f) }

  if ($Probar) {
    Anotar "MODO PRUEBA: se leyeron $($pedidos.Count) pedidos. No se manda nada."
    Anotar "Los tres primeros, con el cliente y el telefono tapados:"
    foreach ($p in $pedidos | Select-Object -First 3) {
      Anotar ('  ' + ((Tapado $p) | ConvertTo-Json -Compress))
    }
    # Los @() son obligatorios. Sin ellos, cuando el filtro deja pasar UN solo
    # pedido, PowerShell devuelve el diccionario en vez de una lista de uno, y
    # .Count pasa a ser la cantidad de CAMPOS del pedido: catorce.
    $conSalida = @($pedidos | Where-Object { $_.salioEn }).Count
    $conLlegada = @($pedidos | Where-Object { $_.llegoEn }).Count
    $aDomicilio = @($pedidos | Where-Object { $_.esADomicilio }).Count
    Anotar "  a domicilio: $aDomicilio   con salida: $conSalida   con llegada: $conLlegada"

    # De cual de las dos columnas sale el cliente. Sin esto no se puede ligar
    # el pedido a su ficha, que es de lo que depende todo el proyecto.
    $conDomicilio = @($filas.Rows | Where-Object { ([string]$_['idclientedomicilio']).Trim() -ne '' }).Count
    $conCliente = @($filas.Rows | Where-Object { ([string]$_['idcliente']).Trim() -ne '' }).Count
    $conAlguno = @($pedidos | Where-Object { $_.claveCliente -ne '' }).Count
    Anotar "  con idclientedomicilio: $conDomicilio   con idcliente: $conCliente   con alguno: $conAlguno"

    # Si muchas llegadas caen en el mismo instante, es que nadie las marca al
    # entregar: alguien las cierra todas juntas al final del turno. En ese caso
    # los minutos "en la calle" no miden nada.
    $llegadas = @($pedidos | Where-Object { $_.llegoEn } | ForEach-Object { $_.llegoEn.Substring(0, 16) })
    $distintas = @($llegadas | Sort-Object -Unique).Count
    Anotar "  llegadas en $distintas minutos distintos, de $($llegadas.Count) pedidos"
    if ($llegadas.Count -gt 0 -and $distintas -lt ($llegadas.Count / 2)) {
      Anotar "  OJO: las llegadas se marcan en bloque, no al entregar."
    }
    return $desde
  }

  $cuerpo = (@{ pedidos = $pedidos } | ConvertTo-Json -Depth 5 -Compress)
  $hora = [string][int][double]::Parse((Get-Date -UFormat %s))
  $cabeceras = @{
    'x-agente-firma' = (Firmar $config.secreto $hora $cuerpo)
    'x-agente-hora'  = $hora
    'content-type'   = 'application/json'
  }

  $respuesta = Invoke-RestMethod -Uri $config.url -Method Post -Headers $cabeceras -Body $cuerpo -TimeoutSec 60
  Anotar ("Mandados {0}: {1} nuevos, {2} actualizados, {3} ligados a cliente, {4} a repartidor" -f `
      $respuesta.recibidos, $respuesta.nuevos, $respuesta.actualizados, `
      $respuesta.ligadosACliente, $respuesta.ligadosARepartidor)
  if ($respuesta.rechazados -and $respuesta.rechazados.Count -gt 0) {
    Anotar ("  rechazados: " + ($respuesta.rechazados | ConvertTo-Json -Compress))
  }

  # La marca solo avanza cuando el envio salio bien. Si fallo, la proxima
  # pasada vuelve a intentar desde el mismo punto y no se pierde nada.
  $ultima = ($filas.Rows | ForEach-Object { [datetime]$_['fecha'] } | Sort-Object | Select-Object -Last 1)
  $nueva = $ultima.ToString('yyyy-MM-dd HH:mm:ss')
  Set-Content -Path $rutaMarca -Value $nueva -Encoding utf8
  return $nueva
}

if ($Probar -or $UnaVez) {
  $desde = UnaPasada $desde
  if ($Probar) { Anotar 'Prueba terminada. No se escribio nada en ningun lado.' }
  exit 0
}

Anotar "Agente arrancado. Una pasada cada $CadaSegundos segundos. Ctrl+C para parar."
while ($true) {
  try {
    $desde = UnaPasada $desde
  } catch {
    # Que se caiga el internet del local es normal y no es motivo para que el
    # agente muera: se anota y se reintenta en la siguiente pasada.
    Anotar ("ERROR: " + $_.Exception.Message)
  }
  Start-Sleep -Seconds $CadaSegundos
}
