<#
  EL MENU DEL POS, PARA ARMAR EL MENU DE LA APP, Y EL HORARIO REAL DEL LOCAL

  PARA QUE SIRVE

  La app de los clientes necesita un menu: que se vende, a que precio, en que
  grupo, con que extras. Todo eso vive en el POS. Este informe mira:

  1. productosdelivery: el POS trae una tabla pensada para un menu de entregas
     (491 productos, con precio propio y una marca de visible). Hay que ver si es
     el menu que se usa de verdad o esta abandonada, y si sus precios coinciden con
     los de la caja.
  2. Los productos, por grupo, con sus precios: para decidir como se muestran.
  3. Los modificadores y comentarios: como se piden extras y como se quita un
     ingrediente. Es lo que el cliente va a querer elegir en la app.
  4. El horario real del local: a que horas entran pedidos, por dia de la semana.

  NO SACA DATOS DE CLIENTES. Solo productos, precios, grupos y conteos de pedidos
  por hora. NO ESCRIBE NADA. Se puede correr con el negocio trabajando.
#>

param(
  [string]$Instancia = '.\NATIONALSOFT',
  [string]$Base = '',
  [switch]$Probar
)

$ErrorActionPreference = 'Stop'
$salida = Join-Path $PSScriptRoot 'salida-menu.txt'
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
    return ,$tabla
  } finally { $con.Close() }
}

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
           elseif ($v -is [decimal] -or $v -is [double]) { ([decimal]$v).ToString('0.####') }
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

if ($Probar) {
  $ok = 0
  function Comprobar($que, $real, $esperado) {
    if ("$real" -eq "$esperado") { $script:ok += 1; Write-Host "OK    $que" }
    else { Write-Host "MAL   $que  ($real != $esperado)"; exit 1 }
  }
  $dt = New-Object System.Data.DataTable
  [void]$dt.Columns.Add('a')
  [void]$dt.Columns.Add('b', [decimal])
  $f = $dt.NewRow(); $f['a'] = 'uno'; $f['b'] = [decimal]1500.5000; $dt.Rows.Add($f)
  $antes = $lineas.Count
  MostrarTabla $dt
  $nuevas = @($lineas[$antes..($lineas.Count - 1)])
  Comprobar 'un decimal sale sin ceros de mas' ([bool]($nuevas[2] -match '1500\.5(\s|$)')) 'True'
  $antes = $lineas.Count
  Seccion 'PRUEBA' { throw 'fallo a proposito' }
  $texto = ($lineas[$antes..($lineas.Count - 1)]) -join "`n"
  Comprobar 'una seccion que falla no tumba el informe' ([bool]($texto -match 'No se pudo leer esta parte: fallo a proposito')) 'True'
  Write-Host ''
  Write-Host "Todo bien ($ok comprobaciones)."
  exit 0
}

Escribir ''
Escribir 'EL MENU DEL POS Y EL HORARIO REAL DEL LOCAL'
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

Seccion '1. productosdelivery: ES EL MENU QUE SE USA?' {
  MostrarTabla (Consultar $cadena "
    SELECT COUNT(*) AS filas,
           SUM(CASE WHEN visiblemenu = 1 THEN 1 ELSE 0 END) AS visibles,
           SUM(CASE WHEN visiblemenu = 0 OR visiblemenu IS NULL THEN 1 ELSE 0 END) AS ocultos,
           COUNT(DISTINCT idapp) AS apps_distintas,
           SUM(CASE WHEN ISNULL(descripcion,'') <> '' THEN 1 ELSE 0 END) AS con_descripcion
    FROM dbo.productosdelivery")
  Escribir '  --- cuantos productos por idapp y visibilidad ---'
  MostrarTabla (Consultar $cadena "
    SELECT idapp, visiblemenu, COUNT(*) AS productos FROM dbo.productosdelivery
    GROUP BY idapp, visiblemenu ORDER BY idapp, visiblemenu")
  Escribir '  --- su precio contra el de la caja (productosdetalle.precio) ---'
  MostrarTabla (Consultar $cadena "
    SELECT COUNT(*) AS en_los_dos,
           SUM(CASE WHEN pd.precio = d.precio THEN 1 ELSE 0 END) AS mismo_precio,
           SUM(CASE WHEN pd.precio <> d.precio THEN 1 ELSE 0 END) AS precio_distinto,
           SUM(CASE WHEN pd.precio > d.precio THEN 1 ELSE 0 END) AS delivery_mas_caro,
           SUM(CASE WHEN pd.precio < d.precio THEN 1 ELSE 0 END) AS delivery_mas_barato
    FROM dbo.productosdelivery pd
    JOIN dbo.productosdetalle d ON d.idproducto = pd.idproducto")
  Escribir '  --- 25 productos de ejemplo ---'
  MostrarTabla (Consultar $cadena "
    SELECT TOP 25 pd.idproducto, pd.nombre, pd.descripcion, pd.precio AS precio_delivery,
           d.precio AS precio_caja, pd.visiblemenu, pd.idapp
    FROM dbo.productosdelivery pd
    LEFT JOIN dbo.productosdetalle d ON d.idproducto = pd.idproducto
    ORDER BY pd.idproducto")
}

Seccion '2. LOS PRODUCTOS DE LA CAJA, POR GRUPO' {
  MostrarTabla (Consultar $cadena "
    SELECT g.idgrupo, g.descripcion AS grupo, g.clasificacion,
           COUNT(*) AS productos,
           SUM(CASE WHEN ISNULL(p.usardomicilio, 1) = 1 THEN 1 ELSE 0 END) AS para_domicilio,
           SUM(CASE WHEN ISNULL(d.bloqueado, 0) = 1 THEN 1 ELSE 0 END) AS bloqueados,
           SUM(CASE WHEN ISNULL(p.usarmenuelectronico, 0) = 1 THEN 1 ELSE 0 END) AS menu_electronico,
           SUM(CASE WHEN ISNULL(p.imagen_menu, '') <> '' THEN 1 ELSE 0 END) AS con_foto_ruta,
           SUM(CASE WHEN p.imagenmenuelectronico IS NOT NULL THEN 1 ELSE 0 END) AS con_foto_binaria,
           MIN(d.precio) AS precio_min, MAX(d.precio) AS precio_max
    FROM dbo.productos p
    JOIN dbo.productosdetalle d ON d.idproducto = p.idproducto
    LEFT JOIN dbo.grupos g ON g.idgrupo = p.idgrupo
    GROUP BY g.idgrupo, g.descripcion, g.clasificacion ORDER BY g.idgrupo")
  Escribir '  --- los 30 productos con mas ventas en domicilio (ultimos 90 dias) ---'
  MostrarTabla (Consultar $cadena "
    SELECT TOP 30 d.idproducto, p.descripcion, p.idgrupo, SUM(d.cantidad) AS unidades, COUNT(*) AS renglones
    FROM dbo.cheqdet d
    JOIN dbo.cheques c ON c.folio = d.foliodet
    JOIN dbo.productos p ON p.idproducto = d.idproducto
    WHERE c.tipodeservicio = 2 AND c.cancelado = 0 AND c.fecha >= DATEADD(day, -90, GETDATE())
    GROUP BY d.idproducto, p.descripcion, p.idgrupo ORDER BY SUM(d.cantidad) DESC")
}

Seccion '3. MODIFICADORES Y COMENTARIOS (como se piden los extras)' {
  Escribir '  --- gruposmodificadores ---'
  MostrarTabla (Consultar $cadena 'SELECT * FROM dbo.gruposmodificadores')
  Escribir '  --- gruposmodificadoresproductos ---'
  MostrarTabla (Consultar $cadena 'SELECT * FROM dbo.gruposmodificadoresproductos')
  Escribir '  --- modificadores (los 63) ---'
  MostrarTabla (Consultar $cadena 'SELECT * FROM dbo.modificadores ORDER BY 1')
  Escribir '  --- los 30 comentarios mas usados en renglones de domicilio (ultimos 90 dias) ---'
  Escribir '  (son frases tipo "sin cebolla"; se muestran solo las que se repiten 5 veces o mas)'
  MostrarTabla (Consultar $cadena "
    SELECT TOP 30 LEFT(d.comentario, 50) AS comentario, COUNT(*) AS veces
    FROM dbo.cheqdet d
    JOIN dbo.cheques c ON c.folio = d.foliodet
    WHERE c.tipodeservicio = 2 AND ISNULL(d.comentario, '') <> '' AND c.fecha >= DATEADD(day, -90, GETDATE())
    GROUP BY LEFT(d.comentario, 50) HAVING COUNT(*) >= 5 ORDER BY COUNT(*) DESC")
}

Seccion '4. EL HORARIO REAL DEL LOCAL (pedidos a domicilio, ultimos 60 dias)' {
  Escribir '  Hora de la primera y de la ultima cuenta de cada dia de la semana, y el promedio'
  Escribir '  de cuentas por dia. Dia 1 = domingo ... 7 = sabado.'
  Escribir ''
  # SQL Server 2014 no puede promediar horas: se promedian los minutos desde la medianoche.
  MostrarTabla (Consultar $cadena "
    SELECT dia_semana, COUNT(*) AS dias_con_ventas,
           RIGHT('0' + CAST(AVG(min_primera) / 60 AS varchar(2)), 2) + ':' + RIGHT('0' + CAST(AVG(min_primera) % 60 AS varchar(2)), 2) AS primera_promedio,
           RIGHT('0' + CAST(MIN(min_primera) / 60 AS varchar(2)), 2) + ':' + RIGHT('0' + CAST(MIN(min_primera) % 60 AS varchar(2)), 2) AS primera_mas_temprano,
           RIGHT('0' + CAST(AVG(min_ultima) / 60 AS varchar(2)), 2) + ':' + RIGHT('0' + CAST(AVG(min_ultima) % 60 AS varchar(2)), 2) AS ultima_promedio,
           RIGHT('0' + CAST(MAX(min_ultima) / 60 AS varchar(2)), 2) + ':' + RIGHT('0' + CAST(MAX(min_ultima) % 60 AS varchar(2)), 2) AS ultima_mas_tarde,
           AVG(cuentas) AS cuentas_por_dia
    FROM (
      SELECT DATEPART(weekday, fecha) AS dia_semana, CAST(fecha AS date) AS dia,
             DATEPART(hour, MIN(fecha)) * 60 + DATEPART(minute, MIN(fecha)) AS min_primera,
             DATEPART(hour, MAX(fecha)) * 60 + DATEPART(minute, MAX(fecha)) AS min_ultima,
             COUNT(*) AS cuentas
      FROM dbo.cheques
      WHERE tipodeservicio = 2 AND cancelado = 0 AND fecha >= DATEADD(day, -60, GETDATE())
      GROUP BY DATEPART(weekday, fecha), CAST(fecha AS date)
    ) x GROUP BY dia_semana ORDER BY dia_semana")
  Escribir '  --- cuentas por hora del dia (promedio por dia, ultimos 60 dias) ---'
  MostrarTabla (Consultar $cadena "
    SELECT DATEPART(hour, fecha) AS hora, COUNT(*) AS cuentas_en_60_dias
    FROM dbo.cheques
    WHERE tipodeservicio = 2 AND cancelado = 0 AND fecha >= DATEADD(day, -60, GETDATE())
    GROUP BY DATEPART(hour, fecha) ORDER BY DATEPART(hour, fecha)")
}

Escribir '============================================================'
Escribir 'LISTO. El informe quedo en:'
Escribir "  $salida"
Escribir 'Mande ese archivo.'
Escribir '============================================================'

$lineas | Set-Content -Path $salida -Encoding utf8
