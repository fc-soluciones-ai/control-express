<#
  A QUE IMPRESORA VA CADA COSA, Y COMO SABE EL PROGRAMA DEL POS A QUE BASE CONECTARSE

  PARA QUE SIRVE

  El informe de comandas mostro que el POS NO tiene reglas dentro de la base: los
  renglones de las cuentas traen comanda_impresa = 1 (ya impresa) incluso los de
  hoy, y no hay productos asignados a monitores de cocina. Eso apunta a que la
  comanda la saca el PROGRAMA de la caja en el momento en que alguien manda la
  cuenta a cocina, y no un proceso que vigile la base.

  Para saber si un pedido escrito desde afuera sale solo, hay dos caminos y este
  informe mira los dos:

  1. SI EL POS NO LA SACA SOLO, la tiene que imprimir nuestro agente, igual que
     la caja: a la impresora correcta de cada area. Para eso hay que saber que
     area tiene cada producto, que impresora tiene cada area en cada estacion y
     cuantas copias saca. Todo eso vive en estaciones, estacionesareas,
     areas y productosdetalle.
  2. PARA PROBAR EN LA COPIA, hay que apuntar el programa del POS a la copia, y
     para eso hay que saber donde guarda a que base conectarse. Aqui se buscan,
     en las carpetas de NationalSoft y en el registro, solo las lineas que
     hablan de servidor o de base de datos.

  Tambien se cuentan, sin mostrar a nadie, los codigos que las cuentas de
  domicilio traen en sus columnas de texto (estacion, area, serie...), para copiar
  los valores que el programa pone.

  NO SACA DATOS DE CLIENTES. NO ESCRIBE NADA. Las contrasenas que aparezcan en
  archivos de configuracion se tapan con *** antes de escribirlas.

  Se puede correr con el negocio trabajando.
#>

param(
  [string]$Instancia = '.\NATIONALSOFT',
  [string]$Base = '',
  [switch]$Probar
)

$ErrorActionPreference = 'Stop'
$salida = Join-Path $PSScriptRoot 'salida-cocina.txt'
$lineas = @()

function Escribir($texto) {
  $script:lineas += $texto
  Write-Host $texto
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

<# Una DataTable con las columnas alineadas, del ancho justo. #>
function MostrarTabla($dt) {
  if ($dt.Rows.Count -eq 0) { Escribir '  (nada)'; Escribir ''; return }
  $cols = @($dt.Columns | ForEach-Object { $_.ColumnName })
  $anchos = @{}
  foreach ($c in $cols) { $anchos[$c] = $c.Length }
  $filas = @()
  foreach ($r in $dt.Rows) {
    $celdas = @{}
    foreach ($c in $cols) {
      $v = $r[$c]
      $t = if ($v -is [System.DBNull]) { '' }
           elseif ($v -is [datetime]) { $v.ToString('yyyy-MM-dd HH:mm:ss') }
           elseif ($v -is [byte[]]) { '(binario)' }
           else { [string]$v }
      $t = ($t -replace '\s+', ' ').Trim()
      if ($t.Length -gt 60) { $t = $t.Substring(0, 57) + '...' }
      $celdas[$c] = $t
      if ($t.Length -gt $anchos[$c]) { $anchos[$c] = $t.Length }
    }
    $filas += ,$celdas
  }
  Escribir ('  ' + (($cols | ForEach-Object { $_.PadRight($anchos[$_] + 2) }) -join ''))
  Escribir ('  ' + (($cols | ForEach-Object { ('-' * $anchos[$_]).PadRight($anchos[$_] + 2) }) -join ''))
  foreach ($celdas in $filas) {
    Escribir ('  ' + (($cols | ForEach-Object { $celdas[$_].PadRight($anchos[$_] + 2) }) -join ''))
  }
  Escribir ''
}

<# Una seccion: si falla, se dice y se sigue con la siguiente. #>
function Seccion($titulo, [scriptblock]$bloque) {
  Escribir '============================================================'
  Escribir $titulo
  Escribir '============================================================'
  Escribir ''
  try { & $bloque }
  catch {
    Escribir ('  No se pudo leer esta parte: ' + $_.Exception.Message)
    Escribir ''
  }
}

<#
  Tapa el valor de todo lo que parezca una contrasena, una clave o un token.

  Sobretapa a proposito: es preferible perder una linea inofensiva que mandar por
  chat una clave. Cubre tanto  Password=abc;  como  clave: abc  y  "pwd": "abc".
#>
$PATRON_SECRETO = '(?i)((?:pass(?:word)?|pwd|clave|contrase\w*|secret|token|apikey|api_key|key)["'']?\s*[=:]\s*)("[^"]*"|''[^'']*''|[^;\s"'']+)'
function Enmascarar([string]$linea) {
  return [regex]::Replace($linea, $PATRON_SECRETO, '$1***')
}

$PALABRAS_DE_CONEXION = '(?i)nationalsoft|initial catalog|data source|database|catalog\s*=|servidor|server\s*=|instancia|base\s*de\s*datos|pruebas|softrestaurant|\\sql'

if ($Probar) {
  $ok = 0
  function Comprobar($que, $real, $esperado) {
    if ("$real" -eq "$esperado") { $script:ok += 1; Write-Host "OK    $que" }
    else { Write-Host "MAL   $que  ($real != $esperado)"; exit 1 }
  }
  Comprobar 'tapa Password=' (Enmascarar 'Server=.;Database=x;User Id=sa;Password=abc123;Timeout=5') 'Server=.;Database=x;User Id=sa;Password=***;Timeout=5'
  Comprobar 'tapa pwd=' (Enmascarar 'pwd=secreto') 'pwd=***'
  Comprobar 'tapa clave: en espanol' (Enmascarar 'clave: miclave') 'clave: ***'
  Comprobar 'tapa contrasena' (Enmascarar 'Contrasena=hola') 'Contrasena=***'
  Comprobar 'tapa json con comillas' (Enmascarar '"password": "abc def"') '"password": ***'
  Comprobar 'no toca el servidor' (Enmascarar 'Server=.\NATIONALSOFT;Database=pruebas') 'Server=.\NATIONALSOFT;Database=pruebas'
  Comprobar 'reconoce una linea de conexion' ([bool]('Initial Catalog=pruebas' -match $PALABRAS_DE_CONEXION)) 'True'
  Comprobar 'ignora una linea cualquiera' ([bool]('Color=azul' -match $PALABRAS_DE_CONEXION)) 'False'
  $dt = New-Object System.Data.DataTable
  [void]$dt.Columns.Add('a')
  [void]$dt.Columns.Add('b', [byte[]])
  $f = $dt.NewRow(); $f['a'] = 'uno'; $f['b'] = [byte[]](1, 2, 3); $dt.Rows.Add($f)
  $antes = $lineas.Count
  MostrarTabla $dt
  $nuevas = @($lineas[$antes..($lineas.Count - 1)])
  Comprobar 'una columna binaria no revienta' ([bool]($nuevas[2] -match '\(binario\)')) 'True'
  $antes = $lineas.Count
  Seccion 'PRUEBA' { throw 'fallo a proposito' }
  $texto = ($lineas[$antes..($lineas.Count - 1)]) -join "`n"
  Comprobar 'una seccion que falla no tumba el informe' ([bool]($texto -match 'No se pudo leer esta parte: fallo a proposito')) 'True'
  Write-Host ''
  Write-Host "Todo bien ($ok comprobaciones)."
  exit 0
}

Escribir ''
Escribir 'A QUE IMPRESORA VA CADA COSA, Y A QUE BASE SE CONECTA EL POS'
Escribir ('Generado: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Escribir ('Equipo:   ' + $env:COMPUTERNAME)
Escribir ''

$raiz = "Server=$Instancia;Integrated Security=SSPI;TrustServerCertificate=True;Connect Timeout=15"

if ($Base -eq '') {
  $bases = Consultar "$raiz;Database=master" `
    "SELECT name FROM sys.databases WHERE database_id > 4 AND state = 0 ORDER BY name"
  $mejor = -1
  foreach ($fila in $bases.Rows) {
    $nombre = [string]$fila['name']
    # Una copia de prueba nunca se elige sola: tendria mas pedidos que la real.
    if ($nombre -match '(?i)_copia$') { continue }
    try {
      $r = Consultar "$raiz;Database=$nombre" `
        "IF OBJECT_ID('dbo.cheques','U') IS NULL SELECT -1 AS n ELSE SELECT COUNT(*) AS n FROM dbo.cheques"
      $n = [int]$r.Rows[0]['n']
      if ($n -gt $mejor) { $mejor = $n; $Base = $nombre }
    } catch { }
  }
}
if ($Base -eq '') { Escribir 'No se encontro ninguna base con pedidos.'; $lineas | Set-Content -Path $salida -Encoding utf8; exit 1 }
$cadena = "$raiz;Database=$Base"
Escribir "Base: $Base"
Escribir ''

# --- 1. Las estaciones (las computadoras del POS) -----------------------------
Seccion '1. LAS ESTACIONES (cada computadora que usa el POS)' {
  Escribir '  Solo nombres, areas e impresoras: nada de claves ni de rutas.'
  Escribir '  monitorimprimircomanda = 1 significa que esa estacion imprime comandas'
  Escribir '  desde el modulo de monitor de cocina.'
  Escribir ''
  MostrarTabla (Consultar $cadena "
    SELECT idestacion, descripcion, numeroestacion, idarearestaurant,
           idarearestaurantdomicilio, impresoracheques, impresoranotas,
           monitorimprimircomanda, monitorimpresoracomandas, monitoriniciarmodulo,
           tipoimpresioncomandamonitor, enviarcomandosdeimpresion,
           idformatodomicilio, modo_operacion, PosIsOpen, PosLastOnline
    FROM dbo.estaciones ORDER BY idestacion")
}

# --- 2. Que impresora saca cada area en cada estacion -------------------------
Seccion '2. QUE IMPRESORA SACA CADA AREA, ESTACION POR ESTACION' {
  Escribir '  imprimir = 1 y domicilio = 1: sale la comanda de ese area en esa'
  Escribir '  impresora cuando la cuenta es de domicilio. copias = cuantas saca.'
  Escribir ''
  MostrarTabla (Consultar $cadena "
    SELECT idestacion, idarea, impresora, imprimir, copias, comedor, domicilio,
           rapido, tipodeimpresioncomanda, nombrereportecomanda, impresion,
           saltos, autocutter
    FROM dbo.estacionesareas ORDER BY idestacion, idarea")
}

# --- 3. Las areas y a que area pertenece cada producto ------------------------
Seccion '3. LAS AREAS DE PRODUCCION' {
  Escribir '  --- areas ---'
  MostrarTabla (Consultar $cadena 'SELECT * FROM dbo.areas ORDER BY 1')
  Escribir '  --- areasdetalle ---'
  MostrarTabla (Consultar $cadena 'SELECT * FROM dbo.areasdetalle')
  Escribir '  --- cuantos productos tiene cada area ---'
  MostrarTabla (Consultar $cadena "
    SELECT ISNULL(d.idarea, '(sin area)') AS idarea, COUNT(*) AS productos
    FROM dbo.productosdetalle d GROUP BY d.idarea ORDER BY d.idarea")
  Escribir '  --- cuantos productos tiene cada grupo, y de que area son ---'
  MostrarTabla (Consultar $cadena "
    SELECT p.idgrupo, ISNULL(d.idarea, '(sin area)') AS idarea, COUNT(*) AS productos
    FROM dbo.productos p
    LEFT JOIN dbo.productosdetalle d ON d.idproducto = p.idproducto
    GROUP BY p.idgrupo, d.idarea ORDER BY p.idgrupo, d.idarea")
}

# --- 4. Los codigos que traen las cuentas de domicilio ------------------------
Seccion '4. LOS CODIGOS QUE TRAEN LAS CUENTAS DE DOMICILIO (ultimos 30 dias)' {
  Escribir '  Cuantas cuentas hay con cada combinacion. Son codigos de configuracion,'
  Escribir '  no datos de nadie.'
  Escribir ''
  $union = "
    SELECT estacion, idarearestaurant, idempresa, seriefolio, tipodeservicio,
           idmenucomedor, idmesero
    FROM dbo.tempcheques WHERE tipodeservicio = 2 AND fecha >= DATEADD(day, -30, GETDATE())
    UNION ALL
    SELECT estacion, idarearestaurant, idempresa, seriefolio, tipodeservicio,
           idmenucomedor, idmesero
    FROM dbo.cheques WHERE tipodeservicio = 2 AND fecha >= DATEADD(day, -30, GETDATE())"
  Escribir '  --- por estacion, area, empresa, serie y menu ---'
  MostrarTabla (Consultar $cadena "
    SELECT estacion, idarearestaurant, idempresa, seriefolio, idmenucomedor, COUNT(*) AS cuentas
    FROM ($union) x GROUP BY estacion, idarearestaurant, idempresa, seriefolio, idmenucomedor
    ORDER BY COUNT(*) DESC")
  Escribir '  --- por codigo de mesero/repartidor (los 12 mas usados) ---'
  MostrarTabla (Consultar $cadena "
    SELECT TOP 12 idmesero, COUNT(*) AS cuentas FROM ($union) x
    GROUP BY idmesero ORDER BY COUNT(*) DESC")
}

Seccion '5. QUE CAMPOS LIBRES SE USAN EN LAS CUENTAS (solo conteos)' {
  Escribir '  Para elegir donde dejar la llave de nuestros pedidos sin pisar nada.'
  Escribir ''
  MostrarTabla (Consultar $cadena "
    SELECT COUNT(*) AS cuentas,
      SUM(CASE WHEN ISNULL(observaciones,'') <> '' THEN 1 ELSE 0 END) AS con_observaciones,
      SUM(CASE WHEN ISNULL(campoadicional1,'') <> '' THEN 1 ELSE 0 END) AS con_campoadicional1,
      SUM(CASE WHEN ISNULL(campoadicional2,'') <> '' THEN 1 ELSE 0 END) AS con_campoadicional2,
      SUM(CASE WHEN ISNULL(campoadicional3,'') <> '' THEN 1 ELSE 0 END) AS con_campoadicional3,
      SUM(CASE WHEN ISNULL(campoadicional4,'') <> '' THEN 1 ELSE 0 END) AS con_campoadicional4,
      SUM(CASE WHEN ISNULL(campoadicional5,'') <> '' THEN 1 ELSE 0 END) AS con_campoadicional5,
      SUM(CASE WHEN ISNULL(idcliente,'') <> '' THEN 1 ELSE 0 END) AS con_idcliente,
      SUM(CASE WHEN ISNULL(idclientedomicilio,'') <> '' THEN 1 ELSE 0 END) AS con_idclientedomicilio,
      SUM(CASE WHEN ISNULL(iddireccion,'') <> '' THEN 1 ELSE 0 END) AS con_iddireccion,
      SUM(CASE WHEN ISNULL(telefonousadodomicilio,'') <> '' THEN 1 ELSE 0 END) AS con_telefono,
      SUM(CASE WHEN ISNULL(idclientefacturacion,'') <> '' THEN 1 ELSE 0 END) AS con_clientefacturacion,
      SUM(CASE WHEN ISNULL(idcliente,'') = ISNULL(idclientedomicilio,'') THEN 1 ELSE 0 END) AS cliente_igual_domicilio
    FROM dbo.cheques WHERE tipodeservicio = 2 AND fecha >= DATEADD(day, -30, GETDATE())")
}

Seccion '6. RENGLONES CON MODIFICADORES, MITADES Y COMENTARIOS (ultimos 14 dias)' {
  Escribir '  Codigos y banderas, nunca el texto del comentario.'
  Escribir ''
  Escribir '  --- cuantos renglones hay de cada clase ---'
  MostrarTabla (Consultar $cadena "
    SELECT d.modificador, d.mitad, d.productocompuestoprincipal AS compuesto_principal,
           CASE WHEN ISNULL(d.idproductocompuesto,'') <> '' THEN 'si' ELSE '' END AS tiene_compuesto,
           CASE WHEN ISNULL(d.comentario,'') <> '' THEN 'si' ELSE '' END AS tiene_comentario,
           COUNT(*) AS renglones
    FROM dbo.cheqdet d
    JOIN dbo.cheques c ON c.folio = d.foliodet
    WHERE c.fecha >= DATEADD(day, -14, GETDATE())
    GROUP BY d.modificador, d.mitad, d.productocompuestoprincipal,
             CASE WHEN ISNULL(d.idproductocompuesto,'') <> '' THEN 'si' ELSE '' END,
             CASE WHEN ISNULL(d.comentario,'') <> '' THEN 'si' ELSE '' END
    ORDER BY COUNT(*) DESC")
  Escribir '  --- una cuenta con modificadores, renglon por renglon ---'
  MostrarTabla (Consultar $cadena "
    SELECT d.foliodet AS cuenta, d.movimiento, d.cantidad, d.idproducto, d.precio,
           d.impuesto1, d.preciosinimpuestos, d.modificador, d.mitad,
           d.idproductocompuesto, d.productocompuestoprincipal,
           d.prioridadproduccion, d.idmeseroproducto
    FROM dbo.cheqdet d
    WHERE d.foliodet = (
      SELECT TOP 1 c.folio FROM dbo.cheques c
      JOIN dbo.cheqdet x ON x.foliodet = c.folio AND x.modificador = 1
      WHERE c.tipodeservicio = 2 ORDER BY c.folio DESC)
    ORDER BY d.movimiento")
}

# --- 7. Como sabe el programa a que base conectarse ---------------------------
Seccion '7. PROGRAMAS DE NATIONALSOFT INSTALADOS EN ESTA COMPUTADORA' {
  $carpetas = @('C:\NationalSoft', 'C:\Program Files\NationalSoft', 'C:\Program Files (x86)\NationalSoft', 'C:\ProgramData\NationalSoft')
  $carpetas += @(Get-ChildItem 'C:\Program Files', 'C:\Program Files (x86)' -Directory -Filter '*Soft*Restaurant*' -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
  $carpetas = @($carpetas | Where-Object { Test-Path $_ } | Select-Object -Unique)
  if ($carpetas.Count -eq 0) { Escribir '  No se encontro ninguna carpeta de NationalSoft en las rutas habituales.'; Escribir '' }
  foreach ($c in $carpetas) {
    Escribir "  Carpeta: $c"
    $exes = @(Get-ChildItem $c -Recurse -Depth 3 -File -Include '*.exe' -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -notmatch '(?i)\\(agente-pos|sql|respaldos|backup)\\' })
    if ($exes.Count -eq 0) { Escribir '    (sin programas .exe)' }
    foreach ($e in ($exes | Select-Object -First 25)) {
      Escribir ('    {0}   ({1:N0} KB, {2})' -f $e.FullName.Substring($c.Length).TrimStart([char]92), ($e.Length / 1KB), $e.LastWriteTime.ToString('yyyy-MM-dd'))
    }
    Escribir ''
  }
}

Seccion '8. DONDE GUARDA EL POS A QUE BASE CONECTARSE (archivos de configuracion)' {
  Escribir '  Solo salen las lineas que hablan de servidor o de base de datos.'
  Escribir '  Toda contrasena, clave o token sale tapado con ***.'
  Escribir ''
  $carpetas = @('C:\NationalSoft', 'C:\Program Files\NationalSoft', 'C:\Program Files (x86)\NationalSoft', 'C:\ProgramData\NationalSoft')
  $carpetas += @(Get-ChildItem 'C:\Program Files', 'C:\Program Files (x86)' -Directory -Filter '*Soft*Restaurant*' -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
  $carpetas = @($carpetas | Where-Object { Test-Path $_ } | Select-Object -Unique)
  $hallo = 0
  foreach ($c in $carpetas) {
    $archivos = @(Get-ChildItem $c -Recurse -Depth 4 -File -Include '*.ini', '*.udl', '*.config', '*.cfg', '*.conf', '*.xml', '*.txt' -ErrorAction SilentlyContinue |
      Where-Object { $_.Length -lt 300KB -and $_.FullName -notmatch '(?i)\\(agente-pos|sql|respaldos|backup)\\' -and $_.Name -notmatch '^salida-' })
    foreach ($a in $archivos) {
      $coinciden = @()
      try {
        foreach ($l in (Get-Content -LiteralPath $a.FullName -ErrorAction Stop)) {
          if ($l -match $PALABRAS_DE_CONEXION) {
            $t = (Enmascarar $l).Trim()
            if ($t.Length -gt 220) { $t = $t.Substring(0, 217) + '...' }
            $coinciden += $t
          }
        }
      } catch { continue }
      if ($coinciden.Count -eq 0) { continue }
      $hallo += 1
      Escribir ('  Archivo: ' + $a.FullName)
      foreach ($t in ($coinciden | Select-Object -First 8)) { Escribir ('      ' + $t) }
      Escribir ''
    }
  }
  if ($hallo -eq 0) { Escribir '  Ningun archivo de configuracion habla de servidor ni de base de datos.'; Escribir '  (Entonces lo guarda en el registro de Windows: ver la parte siguiente.)'; Escribir '' }
}

Seccion '9. DONDE GUARDA EL POS A QUE BASE CONECTARSE (registro de Windows)' {
  $raices = @('HKLM:\SOFTWARE\NationalSoft', 'HKLM:\SOFTWARE\WOW6432Node\NationalSoft',
              'HKCU:\Software\NationalSoft', 'HKCU:\Software\VB and VB Program Settings')
  $secreto = '(?i)pass|pwd|clave|contrase|secret|token|key|licen|serial'
  $hallo = 0
  foreach ($raiz in $raices) {
    if (-not (Test-Path $raiz)) { continue }
    $claves = @(Get-Item $raiz -ErrorAction SilentlyContinue) + @(Get-ChildItem $raiz -Recurse -ErrorAction SilentlyContinue)
    foreach ($k in $claves) {
      foreach ($nombre in $k.GetValueNames()) {
        $v = [string]$k.GetValue($nombre)
        if (($nombre + ' ' + $v) -notmatch $PALABRAS_DE_CONEXION) { continue }
        $hallo += 1
        $shown = if ($nombre -match $secreto) { '***' } else { (Enmascarar $v) }
        if ($shown.Length -gt 160) { $shown = $shown.Substring(0, 157) + '...' }
        Escribir ('  {0}   {1} = {2}' -f $k.Name, $nombre, $shown)
      }
    }
  }
  if ($hallo -eq 0) { Escribir '  No hay nada del servidor ni de la base en el registro (en las rutas habituales).' }
  Escribir ''
}

Escribir '============================================================'
Escribir 'LISTO. El informe quedo en:'
Escribir "  $salida"
Escribir 'Mande ese archivo.'
Escribir '============================================================'

$lineas | Set-Content -Path $salida -Encoding utf8
