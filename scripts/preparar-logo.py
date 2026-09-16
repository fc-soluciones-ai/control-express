"""
Prepara el logo de la aplicacion y los iconos para el telefono.

    npm run logo -- assets/logo-original.jpg

POR QUE HACE FALTA QUITAR EL FONDO A MANO

La imagen original trae el cuadriculado gris y blanco que usan los editores
para indicar transparencia, pero pintado dentro de la imagen: no es
transparencia de verdad, son pixeles. Sobre la pantalla oscura de la caja se
veria el tablero de ajedrez detras del tren.

Se quita llenando desde los bordes todo lo que sea claro y sin color, que es
exactamente lo que es ese cuadriculado. Llenar desde los bordes, y no borrar
todo pixel claro, es lo que salva los ojos blancos del tren: estan rodeados
por el contorno oscuro y el relleno nunca llega a ellos.

QUE DEJA

  public/logo.png                 el tren, recortado y con fondo transparente
  src/app/icon.png                el icono de la pestana del navegador
  src/app/apple-icon.png          el icono al agregarla a la pantalla del iPhone
  public/icons/icon-192.png       icono para Android
  public/icons/icon-512.png       icono para Android, grande
  public/icons/maskable-512.png   icono que Android recorta en circulo o gota

Los iconos del telefono llevan fondo solido y no transparente. El iPhone
rellena la transparencia de negro, y Android puede recortar el icono en
cualquier forma: con el tren pegado al borde, le cortaria las ruedas.
"""

import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent

# Mismo color que el tema de la aplicacion, para que al abrirla desde el
# telefono la pantalla de arranque y el icono sean del mismo tono.
FONDO_ICONO = (11, 17, 32)

# Tono del contorno del dibujo. Ver quitar_fondo().
CONTORNO = (70, 22, 22)

# Que cuenta como "cuadriculado": claro y sin color.
LUZ_MINIMA = 185        # 0 a 255; el gris del tablero baja a 192 por la compresion JPEG
SATURACION_MAXIMA = 18  # diferencia maxima entre canales; el tablero es gris puro


def mascara_de_fondo(pixeles: np.ndarray) -> np.ndarray:
    """Pixeles del cuadriculado: los que tocan un borde y los huecos encerrados."""
    rgb = pixeles[:, :, :3].astype(np.int16)
    luz = rgb.min(axis=2)
    saturacion = rgb.max(axis=2) - rgb.min(axis=2)
    candidato = (luz >= LUZ_MINIMA) & (saturacion <= SATURACION_MAXIMA)

    # Si la imagen ya trae transparencia de verdad, eso tambien es fondo.
    if pixeles.shape[2] == 4:
        candidato |= pixeles[:, :, 3] < 16

    # Relleno desde los cuatro bordes, sin scipy: se crece la zona un pixel
    # por vuelta, siempre dentro de los candidatos, hasta que deja de cambiar.
    fondo = np.zeros_like(candidato)
    fondo[0, :] = candidato[0, :]
    fondo[-1, :] = candidato[-1, :]
    fondo[:, 0] = candidato[:, 0]
    fondo[:, -1] = candidato[:, -1]

    while True:
        crecido = fondo.copy()
        crecido[1:, :] |= fondo[:-1, :]
        crecido[:-1, :] |= fondo[1:, :]
        crecido[:, 1:] |= fondo[:, :-1]
        crecido[:, :-1] |= fondo[:, 1:]
        crecido &= candidato
        if np.array_equal(crecido, fondo):
            break
        fondo = crecido

    return fondo | bolsas_de_cuadriculado(candidato & ~fondo, rgb.min(axis=2))


# Como se reconoce un hueco de cuadriculado encerrado por el dibujo.
#
# El relleno desde los bordes no llega a los cuadros que quedan entre los
# durmientes de la via o detras de los soportes: el dibujo los rodea. Pero el
# cuadriculado tiene una firma: mitad blanco puro, mitad un gris PLANO de 201.
# Los ojos del tren son blancos con una sombra degradada, que pasa por ese gris
# solo en una franja angosta.
#
# Medido en el logo real:
#   ojos     blanco 0,76-0,80   gris plano 0,18-0,21   -> se conservan
#   faro     blanco 0,50        gris plano 0,10        -> se conserva
#   espejo   blanco 0,00        gris plano 0,21        -> se conserva
#   huecos   blanco 0,35-0,49   gris plano 0,39-0,47   -> son fondo
GRIS_PLANO = (194, 210)
BLANCO_PURO = 248
MINIMO_GRIS_PLANO = 0.30
MINIMO_BLANCO = 0.25
TAMANO_MINIMO_BOLSA = 40


def bolsas_de_cuadriculado(interior: np.ndarray, luz: np.ndarray) -> np.ndarray:
    """Zonas claras encerradas que tienen la firma del cuadriculado."""
    alto, ancho = interior.shape
    visto = np.zeros_like(interior)
    bolsas = np.zeros_like(interior)

    ys, xs = np.nonzero(interior)
    for y0, x0 in zip(ys.tolist(), xs.tolist()):
        if visto[y0, x0]:
            continue
        visto[y0, x0] = True
        cola = deque([(y0, x0)])
        puntos_y, puntos_x = [], []
        while cola:
            y, x = cola.popleft()
            puntos_y.append(y)
            puntos_x.append(x)
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < alto and 0 <= nx < ancho and interior[ny, nx] and not visto[ny, nx]:
                    visto[ny, nx] = True
                    cola.append((ny, nx))

        if len(puntos_y) < TAMANO_MINIMO_BOLSA:
            continue

        tonos = luz[puntos_y, puntos_x]
        blanco = (tonos >= BLANCO_PURO).mean()
        gris = ((tonos >= GRIS_PLANO[0]) & (tonos <= GRIS_PLANO[1])).mean()
        if gris >= MINIMO_GRIS_PLANO and blanco >= MINIMO_BLANCO:
            bolsas[puntos_y, puntos_x] = True

    return bolsas


def quitar_fondo(original: Image.Image) -> Image.Image:
    rgba = original.convert('RGBA')
    pixeles = np.array(rgba)
    fondo = mascara_de_fondo(pixeles)

    pixeles[:, :, 3] = np.where(fondo, 0, 255).astype(np.uint8)

    # Los pixeles del fondo quedan invisibles, pero conservan su color blanco
    # o gris. Al achicar la imagen, ese color se mezcla con el borde del
    # dibujo y deja un halo claro que se nota sobre la pantalla oscura. Se
    # pintan del mismo tono oscuro del contorno del tren, asi lo que se mezcle
    # es contorno. El suavizado del borde lo da la reduccion de tamano.
    pixeles[fondo, :3] = CONTORNO
    limpia = Image.fromarray(pixeles, 'RGBA')

    caja = limpia.getbbox()
    return limpia.crop(caja) if caja else limpia


def guardar_liviano(imagen: Image.Image, ruta: Path) -> None:
    """
    Guarda el PNG con una paleta de 256 colores.

    Es un dibujo con colores planos, no una foto: la paleta no se nota a
    simple vista y el archivo baja a la cuarta parte. Importa porque el logo
    se descarga en la pantalla de entrada, muchas veces con datos del celular.
    """
    if imagen.mode == 'RGBA':
        reducida = imagen.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
    else:
        reducida = imagen.convert('RGB').quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    reducida.save(ruta, optimize=True)


def en_cuadro(logo: Image.Image, lado: int, margen: float, fondo) -> Image.Image:
    """Centra el logo en un cuadrado, dejando `margen` libre por cada lado."""
    lienzo = Image.new('RGBA', (lado, lado), fondo)
    util = int(lado * (1 - 2 * margen))
    copia = logo.copy()
    copia.thumbnail((util, util), Image.LANCZOS)
    x = (lado - copia.width) // 2
    y = (lado - copia.height) // 2
    lienzo.alpha_composite(copia, (x, y))
    return lienzo


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit('Uso: python scripts/preparar-logo.py ruta/al/logo-original.png')

    origen = Path(sys.argv[1])
    if not origen.exists():
        sys.exit(f'No existe {origen}')

    original = Image.open(origen)
    print(f'Original: {original.width} x {original.height}, modo {original.mode}')

    logo = quitar_fondo(original)
    print(f'Recortado: {logo.width} x {logo.height}')

    publico = RAIZ / 'public'
    iconos = publico / 'icons'
    app = RAIZ / 'src' / 'app'
    iconos.mkdir(parents=True, exist_ok=True)

    # El logo se guarda a un tamano razonable: la pantalla lo muestra a unos
    # cientos de pixeles, y el original de 2000 solo haria lenta la carga.
    grande = logo.copy()
    grande.thumbnail((640, 640), Image.LANCZOS)
    guardar_liviano(grande, publico / 'logo.png')

    transparente = (0, 0, 0, 0)
    solido = (*FONDO_ICONO, 255)

    guardar_liviano(en_cuadro(logo, 256, 0.04, transparente), app / 'icon.png')
    guardar_liviano(en_cuadro(logo, 180, 0.08, solido).convert('RGB'), app / 'apple-icon.png')
    guardar_liviano(en_cuadro(logo, 192, 0.08, solido).convert('RGB'), iconos / 'icon-192.png')
    guardar_liviano(en_cuadro(logo, 512, 0.08, solido).convert('RGB'), iconos / 'icon-512.png')
    # Android puede recortar hasta el 20 % del borde: el dibujo va dentro del
    # circulo central que siempre se respeta.
    guardar_liviano(en_cuadro(logo, 512, 0.18, solido).convert('RGB'), iconos / 'maskable-512.png')

    # Una muestra para revisar el recorte a ojo, sobre un fondo de color
    # llamativo donde cualquier resto del cuadriculado salta a la vista.
    muestra = Image.new('RGBA', (logo.width + 40, logo.height + 40), (255, 0, 255, 255))
    muestra.alpha_composite(logo, (20, 20))
    muestra.thumbnail((900, 900), Image.LANCZOS)
    muestra.convert('RGB').save(RAIZ / 'muestra-logo.png')

    for ruta in [
        publico / 'logo.png',
        app / 'icon.png',
        app / 'apple-icon.png',
        iconos / 'icon-192.png',
        iconos / 'icon-512.png',
        iconos / 'maskable-512.png',
    ]:
        print(f'  {ruta.relative_to(RAIZ)}  {ruta.stat().st_size // 1024} KB')
    print('\nRevise muestra-logo.png: el fondo magenta no debe tener cuadros grises.')


if __name__ == '__main__':
    main()
