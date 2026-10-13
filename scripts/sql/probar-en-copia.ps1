<#
  PRUEBA DE ESCRIBIR UN PEDIDO EN LA COPIA DE LA BASE DEL POS

  PARA QUE SIRVE

  Es el primer ensayo de la decision del dueno: que el pedido de la app caiga
  directo en el POS y que la comanda salga sola a cada parte de la cocina.

  SOLO FUNCIONA SOBRE UNA BASE CUYO NOMBRE TERMINA EN _copia. Si se le pasa la
  real (pruebas), se niega antes de hacer nada. No hay forma de saltarse esto.

  QUE HACE, EN ORDEN

  1. VALIDAR (solo lee). Recalcula, con las reglas que creo haber entendido, los
     totales de las ultimas 150 cuentas de domicilio ya cerradas y los compara con
     los que el POS guardo. Si coinciden, se que se calcular una cuenta igual que
     el programa. Tambien averigua solo que clasificacion de producto cuenta como
     alimento, bebida u otro.
  2. DESVIAR LAS IMPRESORAS (pide SI). En la COPIA cambia todas las impresoras por
     "Microsoft Print to PDF". Asi, si el POS saca una comanda, sale un PDF en
     lugar de papel en la cocina real. La base real no se toca.
  3. ESCRIBIR UN PEDIDO DE PRUEBA (pide SI). Crea una cuenta de domicilio en la
     copia, con un producto de cada area (pizza, pollo, hamburguesa, batido), copiando
     la forma de una cuenta real y tomando un numero de orden y de produccion de la
     tabla de contadores, como lo hace el programa. Los renglones quedan marcados
     como comanda NO impresa (o como impresa, con -ComandaImpresa 1, para comparar).

  LUEGO SE ABRE EL PROGRAMA DEL POS APUNTADO A LA COPIA Y SE MIRA SI LA CUENTA
  APARECE Y SI SALEN 4 COMANDAS (4 PDF).

  -BorrarPruebas  borra de la copia las cuentas de prueba que dejo este script.

  NO SACA DATOS DE CLIENTES: el informe solo lleva folios, nombres de producto y
  montos. La cuenta de prueba toma el cliente de una cuenta real que ya esta en la
  copia, sin mostrarlo.
#>

param(
  [string]$Instancia = '.\NATIONALSOFT',
  [string]$Base = 'pruebas_copia',
  [ValidateSet(0, 1)][int]$ComandaImpresa = 0,
  [string[]]$Areas = @('01', '02', '03', '04'),
  [switch]$BorrarPruebas,
  [switch]$Probar
)

$ErrorActionPreference = 'Stop'
$salida = Join-Path $PSScriptRoot 'salida-prueba-copia.txt'
$lineas = @()
$MARCA_DE_PRUEBA = 'APPTEST-'
$IMPRESORA_SEGURA = 'Microsoft Print to PDF'

function Escribir($texto) {
  $script:lineas += $texto
  Write-Host $texto
}

<# La salvaguarda central: solo una base de copia. #>
function EsCopiaValida([string]$nombre) {
  return [bool]($nombre -cmatch '^[A-Za-z][A-Za-z0-9_]{0,60}_copia$')
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
    return ,$tabla
  } finally { $con.Close() }
}

function Ejecutar($cadena, $sql) {
  $con = New-Object System.Data.SqlClient.SqlConnection $cadena
  $con.Open()
  try {
    $cmd = $con.CreateCommand()
    $cmd.CommandText = $sql
    $cmd.CommandTimeout = 120
    return $cmd.ExecuteNonQuery()
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
           elseif ($v -is [decimal] -or $v -is [double]) { ([decimal]$v).ToString('0.####') }
           else { [string]$v }
      $t = ($t -replace '\s+', ' ').Trim()
      if ($t.Length -gt 50) { $t = $t.Substring(0, 47) + '...' }
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

function Seccion($titulo, [scriptblock]$bloque) {
  Escribir '============================================================'
  Escribir $titulo
  Escribir '============================================================'
  Escribir ''
  try { & $bloque }
  catch {
    Escribir ('  No se pudo hacer esta parte: ' + $_.Exception.Message)
    Escribir ''
  }
}

<#
  Los totales de una cuenta, a partir de sus renglones.

  Reglas observadas en cuentas reales: el precio del POS ya trae el 13 % de
  impuesto; preciosinimpuestos es el precio sin el; el subtotal es la suma sin
  impuesto, el total es la suma con impuesto y el impuesto es la diferencia.
  Alimentos, bebidas y otros se reparten el subtotal segun la clasificacion del
  grupo del producto.

  Cada renglon: cantidad, precio, preciosinimpuestos, cubeta ('alimentos',
  'bebidas' u 'otros'). Todo en 4 decimales, como lo guarda el POS (money).
#>
function CalcularTotales($renglones) {
  $art = [decimal]0; $sub = [decimal]0; $tot = [decimal]0
  $cub = @{ alimentos = [decimal]0; bebidas = [decimal]0; otros = [decimal]0 }
  foreach ($r in $renglones) {
    $c = [decimal]$r.cantidad
    $art += $c
    $tot += $c * [decimal]$r.precio
    $s = $c * [decimal]$r.preciosinimpuestos
    $sub += $s
    $cub[[string]$r.cubeta] += $s
  }
  return @{
    articulos = $art
    subtotal = [Math]::Round($sub, 4)
    total = [Math]::Round($tot, 4)
    impuesto = [Math]::Round($tot - $sub, 4)
    alimentos = [Math]::Round($cub['alimentos'], 4)
    bebidas = [Math]::Round($cub['bebidas'], 4)
    otros = [Math]::Round($cub['otros'], 4)
  }
}

<#
  Que cubeta le toca a cada clasificacion de grupo, aprendido de las cuentas
  reales: en las cuentas donde todo es de una sola clasificacion, el POS puso el
  monto en una sola cubeta; esa es la que vota.

  $muestras: filas con clasificacion y la cubeta ('alimentos', 'bebidas' u 'otros')
  donde el POS puso el monto de una cuenta de una sola clasificacion.
#>
function AprenderCubetas($muestras) {
  $votos = @{}
  foreach ($m in $muestras) {
    $k = [string]$m.clasificacion
    if (-not $votos.ContainsKey($k)) { $votos[$k] = @{ alimentos = 0; bebidas = 0; otros = 0 } }
    $votos[$k][[string]$m.cubeta] += 1
  }
  $mapa = @{}
  foreach ($k in $votos.Keys) {
    $mejor = 'otros'; $max = -1
    foreach ($c in @('alimentos', 'bebidas', 'otros')) {
      if ($votos[$k][$c] -gt $max) { $max = $votos[$k][$c]; $mejor = $c }
    }
    $mapa[$k] = $mejor
  }
  return $mapa
}

<#
  Arma el INSERT que copia una fila existente cambiando algunas columnas.

  $columnas: nombres de las columnas copiables (sin numeracion automatica ni
  calculadas). $cambios: columna -> expresion SQL. Una columna que no esta en
  $columnas se ignora. Copiar la fila de una cuenta real garantiza que las mas de
  cien columnas queden con los valores que el POS usa, no con mis suposiciones.
#>
function ArmarClonacion($tabla, $columnas, $cambios, $donde) {
  $ins = @(); $sel = @()
  foreach ($c in $columnas) {
    $ins += "[$c]"
    if ($cambios.ContainsKey($c)) { $sel += $cambios[$c] } else { $sel += "[$c]" }
  }
  return ('INSERT INTO dbo.{0} ({1}) SELECT TOP 1 {2} FROM dbo.{0} WHERE {3}' -f $tabla, ($ins -join ', '), ($sel -join ', '), $donde)
}

if ($Probar) {
  $ok = 0
  function Comprobar($que, $real, $esperado) {
    if ("$real" -eq "$esperado") { $script:ok += 1; Write-Host "OK    $que" }
    else { Write-Host "MAL   $que  ($real != $esperado)"; exit 1 }
  }
  Comprobar 'acepta pruebas_copia' (EsCopiaValida 'pruebas_copia') 'True'
  Comprobar 'rechaza la base real' (EsCopiaValida 'pruebas') 'False'
  Comprobar 'rechaza una copia con mayusculas en el sufijo' (EsCopiaValida 'pruebas_COPIA') 'False'
  Comprobar 'rechaza algo que solo contiene copia' (EsCopiaValida 'copia_pruebas') 'False'
  Comprobar 'rechaza inyeccion' (EsCopiaValida 'x]; DROP DATABASE y;--_copia') 'False'
  Comprobar 'rechaza vacio' (EsCopiaValida '') 'False'

  # Los numeros reales de una cuenta del POS: 3 renglones de 2950, 3800 y 2000.
  $r = @(
    @{ cantidad = 1; precio = 2950; preciosinimpuestos = 2610.6195; cubeta = 'alimentos' },
    @{ cantidad = 1; precio = 3800; preciosinimpuestos = 3362.8319; cubeta = 'alimentos' },
    @{ cantidad = 1; precio = 2000; preciosinimpuestos = 1769.9115; cubeta = 'otros' }
  )
  $t = CalcularTotales $r
  Comprobar 'total con impuesto' $t.total 8750
  Comprobar 'subtotal sin impuesto' $t.subtotal 7743.3629
  Comprobar 'impuesto es la diferencia' $t.impuesto 1006.6371
  Comprobar 'alimentos' $t.alimentos 5973.4514
  Comprobar 'otros' $t.otros 1769.9115
  Comprobar 'articulos' $t.articulos 3
  $t2 = CalcularTotales @(@{ cantidad = 2; precio = 3000; preciosinimpuestos = 2654.8672; cubeta = 'bebidas' })
  Comprobar 'cantidad 2' $t2.total 6000
  Comprobar 'bebidas' $t2.bebidas 5309.7344

  $m = AprenderCubetas @(
    @{ clasificacion = 1; cubeta = 'alimentos' }, @{ clasificacion = 1; cubeta = 'alimentos' },
    @{ clasificacion = 1; cubeta = 'otros' }, @{ clasificacion = 2; cubeta = 'bebidas' })
  Comprobar 'gana la cubeta con mas votos' $m['1'] 'alimentos'
  Comprobar 'clasificacion con un voto' $m['2'] 'bebidas'

  $sql = ArmarClonacion 'tempcheques' @('folio2', 'fecha', 'total') @{ fecha = 'GETDATE()'; noexiste = 'X' } 'folio = @tpl'
  Comprobar 'clona y cambia una columna' $sql 'INSERT INTO dbo.tempcheques ([folio2], [fecha], [total]) SELECT TOP 1 [folio2], GETDATE(), [total] FROM dbo.tempcheques WHERE folio = @tpl'
  Write-Host ''
  Write-Host "Todo bien ($ok comprobaciones)."
  exit 0
}

Escribir ''
Escribir 'PRUEBA DE ESCRIBIR UN PEDIDO EN LA COPIA'
Escribir ('Generado: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Escribir ('Equipo:   ' + $env:COMPUTERNAME)
Escribir ''

# --- La salvaguarda: solo una copia ------------------------------------------
if (-not (EsCopiaValida $Base)) {
  Escribir "SE NIEGA: la base '$Base' no termina en _copia. Este script solo escribe en copias."
  $lineas | Set-Content -Path $salida -Encoding utf8
  exit 1
}
$raiz = "Server=$Instancia;Integrated Security=SSPI;TrustServerCertificate=True;Connect Timeout=15"
$hay = Consultar "$raiz;Database=master" "SELECT COUNT(*) AS n FROM sys.databases WHERE name = '$Base' AND state = 0"
if ([int]$hay.Rows[0]['n'] -eq 0) {
  Escribir "No existe la base '$Base'. Primero hay que crearla con CREAR-COPIA-DE-PRUEBA.bat."
  $lineas | Set-Content -Path $salida -Encoding utf8
  exit 1
}
$cadena = "$raiz;Database=$Base"
Escribir "Base de trabajo: $Base (copia)"
Escribir ''

# --- Borrar las pruebas ---------------------------------------------------------
if ($BorrarPruebas) {
  Seccion 'BORRAR LAS CUENTAS DE PRUEBA DE LA COPIA' {
    $folios = Consultar $cadena "SELECT folio FROM dbo.tempcheques WHERE campoadicional2 LIKE '$MARCA_DE_PRUEBA%'"
    Escribir ('  Cuentas de prueba encontradas: ' + $folios.Rows.Count)
    foreach ($f in $folios.Rows) {
      $n = [long]$f['folio']
      [void](Ejecutar $cadena "DELETE FROM dbo.tempcheqdet WHERE foliodet = $n; DELETE FROM dbo.tempcheques WHERE folio = $n;")
      Escribir "  Borrada la cuenta $n"
    }
    Escribir ''
  }
  $lineas | Set-Content -Path $salida -Encoding utf8
  exit 0
}

# --- 1. Validar los totales ---------------------------------------------------------
$mapaCubetas = @{}
Seccion '1. SE CALCULAR UNA CUENTA IGUAL QUE EL POS? (solo lee)' {
  Escribir '  Recalculo los totales de las ultimas cuentas de domicilio cerradas, sin'
  Escribir '  descuentos, y los comparo con los que el POS guardo.'
  Escribir ''
  $cuentas = Consultar $cadena "
    SELECT TOP 150 c.folio, c.total, c.subtotal, c.totalimpuesto1 AS impuesto, c.totalarticulos AS articulos,
           c.totalalimentos AS alimentos, c.totalbebidas AS bebidas, c.totalotros AS otros,
           ISNULL(s.t, 0) AS t_det, ISNULL(s.st, 0) AS st_det, ISNULL(s.n, 0) AS n_det
    FROM dbo.cheques c
    OUTER APPLY (SELECT SUM(d.cantidad * d.precio) AS t, SUM(d.cantidad * d.preciosinimpuestos) AS st,
                        SUM(d.cantidad) AS n FROM dbo.cheqdet d WHERE d.foliodet = c.folio) s
    WHERE c.tipodeservicio = 2 AND c.cancelado = 0 AND ISNULL(c.descuentoimporte, 0) = 0
          AND ISNULL(c.descuento, 0) = 0 AND c.total > 0
    ORDER BY c.folio DESC"
  $n = $cuentas.Rows.Count
  $okTotal = 0; $okSub = 0; $okArt = 0; $okImp = 0
  foreach ($c in $cuentas.Rows) {
    if ([Math]::Abs([decimal]$c['total'] - [decimal]$c['t_det']) -lt 0.011) { $okTotal += 1 }
    if ([Math]::Abs([decimal]$c['subtotal'] - [decimal]$c['st_det']) -lt 0.011) { $okSub += 1 }
    if ([Math]::Abs([decimal]$c['articulos'] - [decimal]$c['n_det']) -lt 0.011) { $okArt += 1 }
    if ([Math]::Abs([decimal]$c['impuesto'] - ([decimal]$c['total'] - [decimal]$c['subtotal'])) -lt 0.011) { $okImp += 1 }
  }
  Escribir "  Cuentas revisadas: $n"
  Escribir "  total = suma de cantidad x precio:            coincide en $okTotal"
  Escribir "  subtotal = suma de cantidad x precio sin imp: coincide en $okSub"
  Escribir "  impuesto = total - subtotal:                  coincide en $okImp"
  Escribir "  articulos = suma de cantidades:               coincide en $okArt"
  Escribir ''

  $grupos = Consultar $cadena "SELECT idgrupo, descripcion, clasificacion FROM dbo.grupos ORDER BY idgrupo"
  Escribir '  --- los grupos de productos y su clasificacion ---'
  MostrarTabla $grupos

  if ($n -gt 0) {
    $lista = (($cuentas.Rows | ForEach-Object { [long]$_['folio'] }) -join ',')
    $porClase = Consultar $cadena "
      SELECT d.foliodet AS folio, ISNULL(g.clasificacion, -1) AS cl, SUM(d.cantidad * d.preciosinimpuestos) AS st
      FROM dbo.cheqdet d
      JOIN dbo.productos p ON p.idproducto = d.idproducto
      LEFT JOIN dbo.grupos g ON g.idgrupo = p.idgrupo
      WHERE d.foliodet IN ($lista)
      GROUP BY d.foliodet, g.clasificacion"
    $porFolio = @{}
    foreach ($r in $porClase.Rows) {
      $k = [string][long]$r['folio']
      if (-not $porFolio.ContainsKey($k)) { $porFolio[$k] = @() }
      $porFolio[$k] += ,@{ cl = [string]$r['cl']; st = [decimal]$r['st'] }
    }
    $muestras = @()
    foreach ($c in $cuentas.Rows) {
      $k = [string][long]$c['folio']
      if (-not $porFolio.ContainsKey($k)) { continue }
      $filas = @($porFolio[$k] | Where-Object { $_.st -gt 0 })
      if ($filas.Count -ne 1) { continue }
      $cubs = @()
      if ([decimal]$c['alimentos'] -gt 0) { $cubs += 'alimentos' }
      if ([decimal]$c['bebidas'] -gt 0) { $cubs += 'bebidas' }
      if ([decimal]$c['otros'] -gt 0) { $cubs += 'otros' }
      if ($cubs.Count -ne 1) { continue }
      $muestras += ,@{ clasificacion = $filas[0].cl; cubeta = $cubs[0] }
    }
    $script:mapaCubetas = AprenderCubetas $muestras
    Escribir ('  Cuentas de una sola clasificacion usadas para aprender el reparto: ' + $muestras.Count)
    foreach ($k in ($script:mapaCubetas.Keys | Sort-Object)) {
      Escribir ("    clasificacion $k  ->  " + $script:mapaCubetas[$k])
    }
    # Contraste con todas las cuentas
    $buenas = 0; $revisadas = 0
    foreach ($c in $cuentas.Rows) {
      $k = [string][long]$c['folio']
      if (-not $porFolio.ContainsKey($k)) { continue }
      $rng = @()
      foreach ($f in $porFolio[$k]) {
        $cub = if ($script:mapaCubetas.ContainsKey($f.cl)) { $script:mapaCubetas[$f.cl] } else { 'otros' }
        $rng += @{ cantidad = 1; precio = 0; preciosinimpuestos = $f.st; cubeta = $cub }
      }
      $t = CalcularTotales $rng
      $revisadas += 1
      if ([Math]::Abs($t.alimentos - [decimal]$c['alimentos']) -lt 0.02 -and
          [Math]::Abs($t.bebidas - [decimal]$c['bebidas']) -lt 0.02 -and
          [Math]::Abs($t.otros - [decimal]$c['otros']) -lt 0.02) { $buenas += 1 }
    }
    Escribir ("  Con ese reparto, alimentos/bebidas/otros coinciden en $buenas de $revisadas cuentas.")
    Escribir ''
  }
}

# --- 2. Impresoras de la copia -----------------------------------------------------
$impresorasReales = 0
Seccion '2. IMPRESORAS DE LA COPIA' {
  $r = Consultar $cadena "
    SELECT (SELECT COUNT(*) FROM dbo.estacionesareas WHERE ISNULL(impresora,'') <> '' AND impresora <> '$IMPRESORA_SEGURA') AS en_areas,
           (SELECT COUNT(*) FROM dbo.estaciones WHERE (ISNULL(impresoracheques,'') <> '' AND impresoracheques <> '$IMPRESORA_SEGURA')
              OR (ISNULL(impresoranotas,'') <> '' AND impresoranotas <> '$IMPRESORA_SEGURA')
              OR (ISNULL(impresorafacturas,'') <> '' AND impresorafacturas <> '$IMPRESORA_SEGURA')
              OR (ISNULL(monitorimpresoracomandas,'') <> '' AND monitorimpresoracomandas <> '$IMPRESORA_SEGURA')) AS en_estaciones"
  $script:impresorasReales = [int]$r.Rows[0]['en_areas'] + [int]$r.Rows[0]['en_estaciones']
  if ($script:impresorasReales -eq 0) {
    Escribir "  Todas las impresoras de la copia ya estan desviadas a '$IMPRESORA_SEGURA'."
    Escribir ''
    return
  }
  Escribir ("  La copia todavia apunta a las impresoras REALES de la cocina ({0} configuraciones)." -f $script:impresorasReales)
  Escribir "  Si el programa del POS saca una comanda desde la copia, saldria en papel en la"
  Escribir "  cocina real. Se desvian a '$IMPRESORA_SEGURA' SOLO EN LA COPIA."
  Escribir ''
  $resp = Read-Host '  Escriba SI para desviarlas'
  if (([string]$resp).Trim().ToUpper() -ne 'SI') { Escribir ('  No se desviaron (se recibio: [' + $resp + ']). No se va a escribir ningun pedido.'); Escribir ''; return }
  [void](Ejecutar $cadena "
    UPDATE dbo.estacionesareas SET impresora = '$IMPRESORA_SEGURA' WHERE ISNULL(impresora,'') <> '';
    UPDATE dbo.estaciones SET impresoracheques = '$IMPRESORA_SEGURA' WHERE ISNULL(impresoracheques,'') <> '';
    UPDATE dbo.estaciones SET impresoranotas = '$IMPRESORA_SEGURA' WHERE ISNULL(impresoranotas,'') <> '';
    UPDATE dbo.estaciones SET impresorafacturas = '$IMPRESORA_SEGURA' WHERE ISNULL(impresorafacturas,'') <> '';
    UPDATE dbo.estaciones SET monitorimpresoracomandas = '$IMPRESORA_SEGURA' WHERE ISNULL(monitorimpresoracomandas,'') <> '';")
  $script:impresorasReales = 0
  Escribir "  Hecho: todas las impresoras de la copia apuntan a '$IMPRESORA_SEGURA'."
  Escribir ''
}

# --- 3. Escribir el pedido de prueba ------------------------------------------------
Seccion '3. PEDIDO DE PRUEBA EN LA COPIA' {
  if ($script:impresorasReales -ne 0) {
    Escribir '  No se escribe nada: las impresoras de la copia siguen siendo las reales.'
    Escribir ''
    return
  }
  $plantilla = Consultar $cadena "
    SELECT TOP 1 h.folio FROM dbo.tempcheques h
    WHERE h.tipodeservicio = 2 AND h.cancelado = 0
      AND EXISTS (SELECT 1 FROM dbo.tempcheqdet d WHERE d.foliodet = h.folio AND d.modificador = 0)
    ORDER BY h.folio DESC"
  if ($plantilla.Rows.Count -eq 0) { throw 'No hay en la copia una cuenta abierta de domicilio para copiar su forma.' }
  $tpl = [long]$plantilla.Rows[0]['folio']

  # Un producto de cada area.
  $productos = @()
  foreach ($a in $Areas) {
    if ($a -notmatch '^[0-9A-Za-z]{1,5}$') { throw "Area invalida: $a" }
    $p = Consultar $cadena "
      SELECT TOP 1 p.idproducto, p.descripcion, d.precio, d.impuesto1, d.preciosinimpuestos,
             ISNULL(g.clasificacion, -1) AS cl
      FROM dbo.productos p
      JOIN dbo.productosdetalle d ON d.idproducto = p.idproducto
      LEFT JOIN dbo.grupos g ON g.idgrupo = p.idgrupo
      WHERE d.idarea = '$a' AND d.precio > 0 AND ISNULL(d.bloqueado, 0) = 0 AND ISNULL(p.usardomicilio, 1) = 1
      ORDER BY p.idproducto"
    if ($p.Rows.Count -eq 0) { Escribir "  (el area $a no tiene productos utilizables: se omite)"; continue }
    $productos += ,@{
      area = $a; id = [string]$p.Rows[0]['idproducto']; nombre = [string]$p.Rows[0]['descripcion']
      precio = [decimal]$p.Rows[0]['precio']; impuesto = [decimal]$p.Rows[0]['impuesto1']
      sinimp = [decimal]$p.Rows[0]['preciosinimpuestos']; cl = [string]$p.Rows[0]['cl']
    }
  }
  if ($productos.Count -eq 0) { throw 'No se encontro ningun producto con area.' }

  Escribir ("  Se va a escribir UNA cuenta de domicilio con {0} renglones (uno por area):" -f $productos.Count)
  foreach ($p in $productos) { Escribir ("    area {0}  {1}  {2:N2}" -f $p.area, $p.nombre, $p.precio) }
  Escribir ("  Renglones marcados como comanda_impresa = {0}  (0 = pendiente de imprimir)" -f $ComandaImpresa)
  Escribir '  La cuenta lleva la marca APPTEST- en campoadicional2 para poder borrarla.'
  Escribir ''
  $resp = Read-Host '  Escriba SI para escribirla en la copia'
  if (([string]$resp).Trim().ToUpper() -ne 'SI') { Escribir ('  No se escribio nada (se recibio: [' + $resp + '])'); Escribir ''; return }

  $colH = @((Consultar $cadena "SELECT c.name FROM sys.columns c WHERE c.object_id = OBJECT_ID('dbo.tempcheques') AND c.is_identity = 0 AND c.is_computed = 0 AND c.system_type_id <> 189 ORDER BY c.column_id").Rows | ForEach-Object { [string]$_['name'] })
  $colD = @((Consultar $cadena "SELECT c.name FROM sys.columns c WHERE c.object_id = OBJECT_ID('dbo.tempcheqdet') AND c.is_identity = 0 AND c.is_computed = 0 AND c.system_type_id <> 189 ORDER BY c.column_id").Rows | ForEach-Object { [string]$_['name'] })

  $cambiosH = @{
    fecha = 'GETDATE()'; salidarepartidor = 'NULL'; arriborepartidor = 'NULL'; cierre = 'NULL'
    numcheque = '0'; pagado = '0'; cancelado = '0'; impreso = '0'; impresiones = '0'
    orden = '@orden'; idturno = '0'; observaciones = "'PRUEBA DE LA APP - NO PREPARAR'"
    campoadicional2 = '@marca'; fechacancelado = 'NULL'; cuentaenuso = '0'; reabiertas = '0'
    facturado = '0'; cambiorepartidor = '0'; comandaimpresa = '0'; domicilioprogramado = '0'
    fechadomicilioprogramado = 'NULL'; efectivo = '0'; tarjeta = '0'; vales = '0'; otros = '0'
    propina = '0'; propinatarjeta = '0'; cambio = '0'; enviado = '0'
  }
  $cambiosD = @{
    foliodet = '@folio'; movimiento = '@mov'; comanda = "''"; cantidad = '1'; idproducto = '@pid'
    descuento = '0'; precio = '@precio'; impuesto1 = '@imp'; impuesto2 = '0'; impuesto3 = '0'
    preciosinimpuestos = '@psi'; preciocatalogo = '@precio'; hora = 'GETDATE()'; modificador = '0'
    mitad = '0'; comentario = 'NULL'; horaproduccion = 'NULL'; idproductocompuesto = 'NULL'
    productocompuestoprincipal = '0'; folioproduccion = '@fp'; estadomonitor = '0'
    comanda_impresa = '@ci'; procesadosrx = '0'; llavemovto = 'NULL'; saledetailid = 'NULL'
    horameserofinalizado = 'NULL'; meserofinalizado = 'NULL'; marcar = '0'; idcortesia = 'NULL'
    numerotarjeta = 'NULL'; usuariodescuento = 'NULL'; comentariodescuento = 'NULL'; idtipodescuento = 'NULL'
  }
  $sqlH = ArmarClonacion 'tempcheques' $colH $cambiosH 'folio = @tpl'
  $sqlD = ArmarClonacion 'tempcheqdet' $colD $cambiosD 'foliodet = @tpl AND modificador = 0 ORDER BY movimiento'

  $marca = $MARCA_DE_PRUEBA + ([guid]::NewGuid().ToString('N').Substring(0, 8))
  $con = New-Object System.Data.SqlClient.SqlConnection $cadena
  $con.Open()
  $tx = $con.BeginTransaction()
  try {
    function Comando($texto) {
      $c = $con.CreateCommand(); $c.Transaction = $tx; $c.CommandText = $texto; $c.CommandTimeout = 60
      return $c
    }
    # Los contadores, como los toma el programa: orden del dia y folio de produccion.
    $c = Comando 'UPDATE dbo.folios SET ultimaorden = ultimaorden + 1, ultimofolioproduccion = ultimofolioproduccion + 1 OUTPUT inserted.ultimaorden, inserted.ultimofolioproduccion'
    $rd = $c.ExecuteReader()
    if (-not $rd.Read()) { throw 'La tabla folios no tiene su fila de contadores.' }
    $orden = [int][decimal]$rd[0]; $fp = [int][decimal]$rd[1]
    $rd.Close()

    $c = Comando ($sqlH + '; SELECT CAST(SCOPE_IDENTITY() AS bigint)')
    [void]$c.Parameters.AddWithValue('@tpl', $tpl)
    [void]$c.Parameters.AddWithValue('@orden', $orden)
    [void]$c.Parameters.AddWithValue('@marca', $marca)
    $folio = [long]$c.ExecuteScalar()

    $renglones = @()
    $mov = 0
    foreach ($p in $productos) {
      $mov += 1
      $c = Comando $sqlD
      [void]$c.Parameters.AddWithValue('@tpl', $tpl)
      [void]$c.Parameters.AddWithValue('@folio', $folio)
      [void]$c.Parameters.AddWithValue('@mov', $mov)
      [void]$c.Parameters.AddWithValue('@pid', $p.id)
      [void]$c.Parameters.AddWithValue('@precio', $p.precio)
      [void]$c.Parameters.AddWithValue('@imp', $p.impuesto)
      [void]$c.Parameters.AddWithValue('@psi', $p.sinimp)
      [void]$c.Parameters.AddWithValue('@fp', $fp)
      [void]$c.Parameters.AddWithValue('@ci', $ComandaImpresa)
      $filas = $c.ExecuteNonQuery()
      if ($filas -ne 1) { throw "El renglon $mov no se escribio ($filas filas)." }
      $cub = if ($mapaCubetas.ContainsKey($p.cl)) { $mapaCubetas[$p.cl] } else { 'otros' }
      $renglones += ,@{ cantidad = 1; precio = $p.precio; preciosinimpuestos = $p.sinimp; cubeta = $cub }
    }

    $t = CalcularTotales $renglones
    $c = Comando "
      UPDATE dbo.tempcheques SET
        totalarticulos = @art, subtotal = @sub, total = @tot, totalconpropina = @tot,
        totalimpuesto1 = @imp, totalconcargo = @tot, totalconpropinacargo = @tot,
        totalsindescuento = @sub, subtotalcondescuento = @sub, totalimpuestod1 = @imp,
        totalalimentos = @ali, totalbebidas = @beb, totalotros = @otr,
        totalalimentossindescuentos = @ali, totalbebidassindescuentos = @beb,
        totalotrossindescuentos = @otr
      WHERE folio = @folio"
    [void]$c.Parameters.AddWithValue('@art', $t.articulos)
    [void]$c.Parameters.AddWithValue('@sub', $t.subtotal)
    [void]$c.Parameters.AddWithValue('@tot', $t.total)
    [void]$c.Parameters.AddWithValue('@imp', $t.impuesto)
    [void]$c.Parameters.AddWithValue('@ali', $t.alimentos)
    [void]$c.Parameters.AddWithValue('@beb', $t.bebidas)
    [void]$c.Parameters.AddWithValue('@otr', $t.otros)
    [void]$c.Parameters.AddWithValue('@folio', $folio)
    if ($c.ExecuteNonQuery() -ne 1) { throw 'No se pudieron poner los totales.' }
    $tx.Commit()
  } catch {
    $tx.Rollback()
    throw
  } finally { $con.Close() }

  Escribir "  ESCRITA en la copia: cuenta (folio) $folio, orden $orden, folio de produccion $fp."
  Escribir ("  Total {0:N2}  (subtotal {1:N2}, impuesto {2:N2})" -f $t.total, $t.subtotal, $t.impuesto)
  Escribir ''
  Escribir '  Lo que quedo escrito, leido de vuelta:'
  MostrarTabla (Consultar $cadena "
    SELECT folio, numcheque, fecha, orden, tipodeservicio, pagado, cancelado, impreso, total, totalarticulos
    FROM dbo.tempcheques WHERE folio = $folio")
  MostrarTabla (Consultar $cadena "
    SELECT foliodet AS cuenta, movimiento, cantidad, idproducto, precio, preciosinimpuestos, hora,
           idestacion, folioproduccion, comanda_impresa
    FROM dbo.tempcheqdet WHERE foliodet = $folio ORDER BY movimiento")
  Escribir '  AHORA: abrir el programa del POS apuntado a la copia, buscar esta cuenta de'
  Escribir '  domicilio y ver si salen las comandas (un PDF por cada area).'
  Escribir ''
}

Escribir '============================================================'
Escribir 'LISTO. El informe quedo en:'
Escribir "  $salida"
Escribir '============================================================'
$lineas | Set-Content -Path $salida -Encoding utf8
