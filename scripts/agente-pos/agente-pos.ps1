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

<#
  Lee la marca del disco y se asegura de que sea una fecha que SQL Server pueda
  leer.

  EL ERROR QUE ESTO ARREGLA

  Set-Content escribe un salto de linea al final del archivo, y Get-Content
  -Raw lo devuelve junto con la fecha. Esa cadena entraba tal cual en el
  CONVERT(datetime, ..., 120) de la consulta, y el estilo 120 es estricto: con
  un salto de linea adentro, SQL Server responde "Conversion failed when
  converting date and/or time from character string" y el agente no arranca.

  No se notaba porque el proceso que ya estaba corriendo guardaba la marca en
  memoria y nunca releia el archivo. El agente funcionaba hasta que alguien lo
  reiniciaba; ahi dejaba de arrancar y nadie sabia por que.

  Si la marca esta rota o no se entiende, NO se cae: avisa y arranca con la
  ventana de los ultimos dias, que es lo mismo que hace la primera vez. Un
  agente que no manda nada es peor que uno que manda de mas.
#>
function LeerMarca($ruta, $dias) {
  $porDefecto = (Get-Date).AddDays(-$dias).ToString('yyyy-MM-dd HH:mm:ss')

  if (-not (Test-Path $ruta)) {
    Anotar "Primera corrida: se mandan los ultimos $dias dias."
    return $porDefecto
  }

  $texto = (Get-Content $ruta -Raw)
  if ($null -ne $texto) { $texto = $texto.Trim() }

  $fecha = [datetime]::MinValue
  $formato = 'yyyy-MM-dd HH:mm:ss'
  $ok = [datetime]::TryParseExact(
    $texto, $formato, [Globalization.CultureInfo]::InvariantCulture,
    [Globalization.DateTimeStyles]::None, [ref]$fecha)

  if (-not $ok) {
    Anotar "La marca del disco no se entiende ('$texto'). Se arranca con los ultimos $dias dias."
    return $porDefecto
  }
  return $fecha.ToString($formato)
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
<#
  Los segundos desde 1970, en UTC.

  NO se usa Get-Date -UFormat %s. En Windows PowerShell 5.1 ese formato cuenta
  desde la hora LOCAL y no desde UTC: en Costa Rica devuelve seis horas menos.
  Como la hora va firmada y el servidor rechaza lo que tenga mas de cinco
  minutos de desfase, el agente recibia 401 en todos los envios.

  DateTimeOffset::UtcNow no depende ni de la zona horaria ni del idioma del
  Windows donde corra.
#>
function AhoraUnix {
  return [string][long]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
}

function Firmar($secreto, $hora, $cuerpo) {
  $hmac = New-Object System.Security.Cryptography.HMACSHA256
  $hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($secreto)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes("$hora.$cuerpo")
  $firma = $hmac.ComputeHash($bytes)
  $hmac.Dispose()
  return ([System.BitConverter]::ToString($firma) -replace '-', '').ToLower()
}

<#
  Una fecha del POS, en ISO y CON LA ZONA PUESTA.

  SEIS HORAS DE DIFERENCIA

  SQL Server guarda la hora de pared de esta maquina, sin zona: las 22:36 del
  POS son las 22:36 de Costa Rica. Al leerla, .NET la entrega con Kind
  'Unspecified', y ToString('o') sobre una fecha Unspecified escribe
  "2026-10-03T22:36:30.0000000" SIN offset al final.

  Del otro lado, el servidor corre en UTC y una fecha ISO sin offset la lee
  como UTC. O sea: un pedido que entro a las 22:36 de la noche en Alajuela
  quedaba guardado como si hubiera entrado a las 16:36 de la tarde. Seis horas
  antes de lo que fue.

  En el tablero eso no es un detalle: el semaforo mide los minutos que el
  cliente lleva esperando. Con seis horas de ventaja, TODOS los pedidos
  saldrian en rojo parpadeando desde el primer minuto, y el tablero no serviria
  para nada.

  SpecifyKind le dice a .NET lo que ya sabemos -que esa hora es la local de
  esta maquina- y entonces ToString('o') si escribe el offset: el "-06:00" del
  final. Con eso las dos puntas hablan del mismo instante.
#>
function FechaConZona($v) {
  if ($null -eq $v -or $v -is [System.DBNull]) { return $null }
  $local = [datetime]::SpecifyKind([datetime]$v, [System.DateTimeKind]::Local)
  return $local.ToString('o')
}

<#
  Convierte una fila del POS en lo que entiende la aplicacion.
#>
function ComoPedido($fila) {
  $iso = {
    param($v)
    return (FechaConZona $v)
  }

  # Un campo de dinero vacio no es un error, es un cero. El POS deja en nulo lo
  # que no se uso: un pedido pagado con tarjeta tiene el efectivo vacio. Sin
  # esto, convertir a numero revienta y se pierde el pedido entero.
  $plata = {
    param($v)
    if ($null -eq $v -or $v -is [System.DBNull] -or [string]$v -eq '') { return 0 }
    return [double]$v
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
    total         = (& $plata $fila['total'])
    # El desglose de pago: es lo que durante anos salio del Excel de cada noche.
    efectivo      = (& $plata $fila['efectivo'])
    tarjeta       = (& $plata $fila['tarjeta'])
    otros         = (& $plata $fila['otros'])
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

<#
  Las columnas del cliente, tal como estan en el POS.

  No se interpreta nada aqui. Que telefono sirve, que direccion alcanza y en
  que estado queda el cliente lo decide el servidor, con la misma libreria que
  usa la pantalla. Si esa logica viviera aqui habria dos verdades, y esta no la
  probaria nadie nunca.
#>
function ComoCliente($fila) {
  $num = {
    param($v)
    if ($null -eq $v -or $v -is [System.DBNull]) { return $null }
    $d = [double]$v
    if ($d -eq 0) { return $null }
    return $d
  }
  return [ordered]@{
    clave            = [string]$fila['idcliente']
    nombre           = [string]$fila['nombre']
    correo           = [string]$fila['email']
    direccionGeneral = [string]$fila['direccion']
    telefonos        = @(
      [string]$fila['telefono1'], [string]$fila['telefono2'], [string]$fila['telefono3'],
      [string]$fila['telefono4'], [string]$fila['telefono5']
    )
    iddireccion      = [string]$fila['iddireccion']
    calle            = [string]$fila['calle']
    cruzamiento1     = [string]$fila['cruzamiento1']
    cruzamiento2     = [string]$fila['cruzamiento2']
    referencia       = [string]$fila['referencia']
    zona             = [string]$fila['zona']
    latitud          = (& $num $fila['latitude'])
    longitud         = (& $num $fila['longitude'])
  }
}

<#
  Deja una clave del POS en algo que se puede meter en una consulta.

  Las claves son codigos del catalogo, pero vienen de un campo de texto que
  alguien lleno a mano: lo que no sea letra, numero, guion o punto se descarta
  en vez de escaparse. Una clave rara no vale el riesgo de armar SQL con texto
  de afuera.
#>
function ClaveSegura($clave) {
  $limpia = ($clave -replace '[^A-Za-z0-9\-\._]', '')
  if ($limpia.Length -eq 0 -or $limpia.Length -gt 30) { return $null }
  return $limpia
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
  # La hora va firmada y el servidor rechaza lo que tenga mas de cinco minutos
  # de desfase. Con Get-Date -UFormat %s el agente mandaba seis horas menos y
  # recibia 401 en todos los envios: eso no se puede volver a colar.
  $hora = [long](AhoraUnix)
  $real = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  Comprobar 'la hora es UTC y no la local' ([math]::Abs($hora - $real) -lt 5) 'True'
  Comprobar 'y son diez digitos' ((AhoraUnix).Length) 10

  $firma = Firmar 'secreto' '1790000000' '{"pedidos":[]}'
  Comprobar 'la firma son 64 caracteres hex' $firma.Length 64
  Comprobar 'solo trae minusculas y digitos' ([bool]($firma -match '^[0-9a-f]+$')) 'True'
  Comprobar 'la misma entrada da la misma firma' (Firmar 'secreto' '1790000000' '{"pedidos":[]}') $firma
  Comprobar 'otro secreto da otra firma' ([bool]((Firmar 'otro' '1790000000' '{"pedidos":[]}') -ne $firma)) 'True'
  Comprobar 'otra hora da otra firma' ([bool]((Firmar 'secreto' '1790000001' '{"pedidos":[]}') -ne $firma)) 'True'

  # Una fila del POS, con las columnas tal como se llaman alla.
  $t = New-Object System.Data.DataTable
  foreach ($c in @('folio','seriefolio','idcliente','idclientedomicilio','iddireccion','telefonousadodomicilio','idmesero','cancelado','total','efectivo','tarjeta','otros')) {
    [void]$t.Columns.Add($c)
  }
  foreach ($c in @('fecha','empaquetado','asignacion','salidarepartidor','arriborepartidor','cierre')) {
    [void]$t.Columns.Add($c, [datetime])
  }
  $f = $t.NewRow()
  $f['folio'] = '12345'; $f['seriefolio'] = 'A'; $f['idclientedomicilio'] = '008686'
  $f['iddireccion'] = 'D1'; $f['telefonousadodomicilio'] = '87069355'; $f['idmesero'] = '12'
  $f['cancelado'] = $false; $f['total'] = '12500.50'
  $f['efectivo'] = '12500.50'; $f['tarjeta'] = '0'; $f['otros'] = '0'
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
  $f3['efectivo'] = '0'; $f3['tarjeta'] = '0'; $f3['otros'] = '0'
  $f3['fecha'] = [datetime]'2026-10-04T18:00:00'
  $t.Rows.Add($f3)
  $p3 = ComoPedido $t.Rows[$t.Rows.Count - 1]
  Comprobar 'si no hay idclientedomicilio se usa idcliente' $p3.claveCliente '003863'
  Comprobar 'y ese tambien conserva sus ceros' ($p3.claveCliente -eq '003863') 'True'
  Comprobar 'el total va con decimales' $p.total '12500.5'
  # Es lo que durante anos se saco a mano del Excel de ventas por mesero.
  Comprobar 'el efectivo viaja aparte' $p.efectivo '12500.5'
  Comprobar 'y la tarjeta tambien' $p.tarjeta '0'
  # Un pedido pagado con tarjeta deja el efectivo en nulo: es un cero, no un error.
  $fv = $t.NewRow(); $fv['folio'] = '777'; $fv['cancelado'] = $false
  $fv['fecha'] = [datetime]'2026-10-04T21:00:00'
  $t.Rows.Add($fv)
  $pv = ComoPedido $t.Rows[$t.Rows.Count - 1]
  Comprobar 'un campo de dinero vacio es cero y no revienta' $pv.efectivo '0'
  Comprobar 'y el total tambien' $pv.total '0'
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

  # Las claves que se meten en una consulta.
  Comprobar 'una clave normal pasa' (ClaveSegura '008686') '008686'
  Comprobar 'una con guion tambien' (ClaveSegura '3-101-809629') '3-101-809629'
  Comprobar 'lo que trae comillas se limpia' (ClaveSegura "006'; DROP TABLE") '006DROPTABLE'
  Comprobar 'una vacia se descarta' ($null -eq (ClaveSegura '   ')) 'True'
  Comprobar 'una absurdamente larga tambien' ($null -eq (ClaveSegura ('9' * 40))) 'True'

  # El cliente, con sus cinco telefonos y las coordenadas del POS.
  $tc = New-Object System.Data.DataTable
  foreach ($c in @('idcliente','nombre','email','direccion','telefono1','telefono2','telefono3','telefono4','telefono5','iddireccion','calle','cruzamiento1','cruzamiento2','referencia','zona')) {
    [void]$tc.Columns.Add($c)
  }
  [void]$tc.Columns.Add('latitude', [double])
  [void]$tc.Columns.Add('longitude', [double])
  $fc = $tc.NewRow()
  $fc['idcliente'] = '008686'; $fc['nombre'] = 'MARIA RODRIGUEZ'; $fc['telefono1'] = '8706-9355'
  $fc['calle'] = 'CEBADILLA LAGUITO'; $fc['referencia'] = 'PORTON VERDE'
  $fc['latitude'] = 0; $fc['longitude'] = 0
  $tc.Rows.Add($fc)
  $cl = ComoCliente $tc.Rows[0]
  Comprobar 'la clave del cliente viaja entera' $cl.clave '008686'
  Comprobar 'van los cinco campos de telefono' $cl.telefonos.Count 5
  Comprobar 'el primero es el que tiene algo' $cl.telefonos[0] '8706-9355'
  # El POS tiene las columnas pero estan en cero en las 12.833 direcciones.
  Comprobar 'una coordenada en cero no es una ubicacion' ($null -eq $cl.latitud) 'True'

  $dos = @($p, $p2)
  # Con UN solo resultado, sin el @() el .Count da la cantidad de campos.
  Comprobar 'cuenta los de a domicilio' @($dos | Where-Object { $_.esADomicilio }).Count 1
  Comprobar 'cuenta los que ya salieron' @($dos | Where-Object { $_.salioEn }).Count 1
  Comprobar 'y los que no tienen ninguno' @($dos | Where-Object { $_.llegoEn }).Count 0

  # --- La zona horaria de las fechas --------------------------------------
  #
  # Es el otro error que habria arruinado el tablero: sin el offset, el
  # servidor leia las fechas como UTC y todo aparecia seis horas mas viejo.
  $conZona = FechaConZona ([datetime]'2026-10-03T22:36:30')
  Comprobar 'la fecha lleva la hora tal cual' ([bool]($conZona -match '^2026-10-03T22:36:30')) 'True'
  Comprobar 'y termina con el offset de la zona' ([bool]($conZona -match '[+-]\d{2}:\d{2}$')) 'True'
  Comprobar 'una fecha nula sigue siendo nula' ($null -eq (FechaConZona $null)) 'True'
  Comprobar 'y un DBNull tambien' ($null -eq (FechaConZona ([System.DBNull]::Value))) 'True'

  # El instante que entiende quien la lea tiene que ser el mismo que marca el
  # reloj de la pared de la pizzeria.
  $vuelta = [datetimeoffset]::Parse($conZona)
  Comprobar 'al releerla da la misma hora local' ($vuelta.DateTime.ToString('yyyy-MM-dd HH:mm:ss')) '2026-10-03 22:36:30'

  # --- La marca del disco -------------------------------------------------
  #
  # Es la que tumbo al agente en produccion: el salto de linea que deja
  # Set-Content entraba en la consulta y SQL Server la rechazaba.
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('marca-' + [guid]::NewGuid().ToString('N') + '.txt')

  Set-Content -Path $tmp -Value '2026-10-03 16:36:30' -Encoding utf8
  Comprobar 'la marca se lee sin el salto de linea' (LeerMarca $tmp 7) '2026-10-03 16:36:30'

  Set-Content -Path $tmp -Value '   2026-10-03 16:36:30   ' -Encoding utf8
  Comprobar 'y sin los espacios de los lados' (LeerMarca $tmp 7) '2026-10-03 16:36:30'

  Set-Content -Path $tmp -Value 'cualquier cosa' -Encoding utf8
  $recuperada = LeerMarca $tmp 7
  Comprobar 'una marca rota no tumba el agente' ([bool]($recuperada -match '^\d{4}-\d{2}-\d{2} ')) 'True'

  Set-Content -Path $tmp -Value '' -Encoding utf8
  $vacia = LeerMarca $tmp 7
  Comprobar 'una marca vacia tampoco' ([bool]($vacia -match '^\d{4}-\d{2}-\d{2} ')) 'True'

  Comprobar 'sin archivo arranca con la ventana de dias' ([bool]((LeerMarca ($tmp + '.nohay') 7) -match '^\d{4}-\d{2}-\d{2} ')) 'True'

  Remove-Item $tmp -ErrorAction SilentlyContinue

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
$desde = LeerMarca $rutaMarca $diasAlArrancar

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
      idmesero, cancelado, total, efectivo, tarjeta, otros
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
  $hora = AhoraUnix
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

  # Los clientes de estos pedidos, enseguida. Es lo que hace que el que pidio
  # por primera vez hace diez minutos aparezca con nombre y no con un codigo.
  # Si falla, no se pierde nada: la sincronizacion completa lo recoge despues.
  try {
    MandarClientesDe $pedidos
  } catch {
    Anotar ("  no se pudieron mandar los clientes de estos pedidos: " + $_.Exception.Message)
  }

  # La marca solo avanza cuando el envio salio bien. Si fallo, la proxima
  # pasada vuelve a intentar desde el mismo punto y no se pierde nada.
  $ultima = ($filas.Rows | ForEach-Object { [datetime]$_['fecha'] } | Sort-Object | Select-Object -Last 1)
  $nueva = $ultima.ToString('yyyy-MM-dd HH:mm:ss')
  Set-Content -Path $rutaMarca -Value $nueva -Encoding utf8
  return $nueva
}

# --- Los clientes --------------------------------------------------------
#
# La primera carga salio de un Excel exportado a mano, y al cruzarlo con los
# pedidos reales aparecio el problema: de los 206 clientes que pidieron en una
# semana, 53 no estaban en la exportacion. Una exportacion es una foto y la
# caja crea fichas todos los dias. Asi que los clientes llegan por aqui.

$urlClientes = ($config.url -replace '/pedidos$', '/clientes')

# La ficha de CASA si existe, y si no cualquiera: es la direccion a la que se
# reparte. OUTER APPLY y no JOIN para que un cliente sin direccion entre igual.
$SQL_CLIENTE = "
  SELECT c.idcliente, c.nombre, c.email, c.direccion,
         c.telefono1, c.telefono2, c.telefono3, c.telefono4, c.telefono5,
         d.iddireccion, d.calle, d.cruzamiento1, d.cruzamiento2, d.referencia,
         d.estado AS zona, d.latitude, d.longitude
  FROM dbo.clientes c
  OUTER APPLY (
    SELECT TOP 1 dd.iddireccion, dd.calle, dd.cruzamiento1, dd.cruzamiento2,
           dd.referencia, dd.estado, dd.latitude, dd.longitude
    FROM dbo.direccionesdomicilio dd
    WHERE dd.idcliente = c.idcliente
    ORDER BY CASE WHEN dd.iddireccion LIKE 'CASA%' THEN 0 ELSE 1 END, dd.iddireccion
  ) d"

function MandarClientes($lista) {
  if ($lista.Count -eq 0) { return $null }
  $cuerpo = (@{ clientes = $lista } | ConvertTo-Json -Depth 5 -Compress)
  $hora = AhoraUnix
  $cabeceras = @{
    'x-agente-firma' = (Firmar $config.secreto $hora $cuerpo)
    'x-agente-hora'  = $hora
    'content-type'   = 'application/json'
  }
  return Invoke-RestMethod -Uri $urlClientes -Method Post -Headers $cabeceras -Body $cuerpo -TimeoutSec 120
}

<#
  Manda los clientes de unos pedidos concretos.

  Es lo que resuelve el caso del cliente que pidio por primera vez hace diez
  minutos: son unas pocas fichas y entran enseguida, sin esperar a la
  sincronizacion completa.
#>
function MandarClientesDe($pedidos) {
  $claves = @()
  foreach ($p in $pedidos) {
    $c = ClaveSegura $p.claveCliente
    if ($c -and $claves -notcontains $c) { $claves += $c }
  }
  if ($claves.Count -eq 0) { return }

  $enLista = ($claves | ForEach-Object { "'$_'" }) -join ','
  $filas = Consultar $cadena "$SQL_CLIENTE WHERE c.idcliente IN ($enLista)"
  if ($null -eq $filas -or $filas.Rows.Count -eq 0) { return }

  $lista = @()
  foreach ($f in $filas.Rows) { $lista += (ComoCliente $f) }
  $r = MandarClientes $lista
  if ($r) {
    Anotar ("  clientes de esos pedidos: {0} nuevos, {1} actualizados, {2} sin cambio" -f `
        $r.nuevos, $r.actualizados, $r.sinCambio)
  }
}

<#
  La sincronizacion completa del catalogo.

  Corre al arrancar y cada tantas horas. Es cara (doce mil fichas en tandas de
  quinientas), por eso no va en cada pasada: lo urgente ya lo cubre
  MandarClientesDe.
#>
function SincronizarTodosLosClientes {
  $total = Consultar $cadena "SELECT COUNT(*) AS n FROM dbo.clientes"
  $cuantos = [int]$total.Rows[0]['n']
  Anotar "Sincronizando el catalogo de clientes: $cuantos fichas."

  $tanda = 500
  $hechos = 0
  $nuevos = 0
  for ($desdeFila = 0; $desdeFila -lt $cuantos; $desdeFila += $tanda) {
    $filas = Consultar $cadena "$SQL_CLIENTE ORDER BY c.idcliente OFFSET $desdeFila ROWS FETCH NEXT $tanda ROWS ONLY"
    if ($null -eq $filas -or $filas.Rows.Count -eq 0) { break }
    $lista = @()
    foreach ($f in $filas.Rows) { $lista += (ComoCliente $f) }
    $r = MandarClientes $lista
    $hechos += $lista.Count
    if ($r) { $nuevos += [int]$r.nuevos }
    Anotar "  clientes $hechos de $cuantos"
  }
  Anotar "Catalogo de clientes al dia: $hechos revisados, $nuevos nuevos."
  Set-Content -Path $rutaClientes -Value (Get-Date -Format 'o') -Encoding utf8
}

$rutaClientes = Join-Path $carpeta 'agente-pos.clientes.txt'
$horasClientes = 12
if ($config.horasEntreCatalogos) { $horasClientes = [int]$config.horasEntreCatalogos }

function TocaElCatalogo {
  if (-not (Test-Path $rutaClientes)) { return $true }
  try {
    $ultima = [datetime](Get-Content $rutaClientes -Raw)
    return ((Get-Date) - $ultima).TotalHours -ge $horasClientes
  } catch { return $true }
}

if ($Probar -or $UnaVez) {
  $desde = UnaPasada $desde
  if ($Probar) { Anotar 'Prueba terminada. No se escribio nada en ningun lado.' }
  exit 0
}

Anotar "Agente arrancado. Una pasada cada $CadaSegundos segundos. Ctrl+C para parar."
while ($true) {
  try {
    # El catalogo completo va primero y de tarde en tarde: es caro y lo urgente
    # ya lo cubren los clientes de cada pedido.
    if (TocaElCatalogo) { SincronizarTodosLosClientes }
    $desde = UnaPasada $desde
  } catch {
    # Que se caiga el internet del local es normal y no es motivo para que el
    # agente muera: se anota y se reintenta en la siguiente pasada.
    Anotar ("ERROR: " + $_.Exception.Message)
  }
  Start-Sleep -Seconds $CadaSegundos
}
