'use client';

/**
 * El quiosco: la pantalla donde el cliente arma su pedido.
 *
 * Pensado como las plataformas de entrega y los quioscos de las cadenas grandes:
 * una cabecera que dice de un vistazo cuanto tarda y cuanto cuesta el envio, un
 * buscador, "lo mas pedido", platos en filas con su ficha a la derecha y el
 * carrito siempre a la vista. El cliente nunca ve "productos del POS": ve platos,
 * y el servidor traduce lo que eligio al producto exacto de la caja.
 *
 * Los precios que se muestran aqui son de referencia. Al confirmar, el servidor
 * vuelve a calcular todo desde la caja.
 */

import { useEffect, useMemo, useState } from 'react';

import {
  agregarLinea,
  cambiarCantidad,
  leerCarritoGuardado,
  totalDeLinea,
  totalDelCarrito,
  unidadesDelCarrito,
  MAXIMO_POR_LINEA,
  type LineaDelCarrito,
} from '@/lib/menu/carrito';
import { DESTACADOS, emojiDe, fondoDe, paraBuscar } from '@/lib/menu/presentacion';
import { TIEMPO_ESTIMADO } from '@/lib/pedido/envio';
import type { CategoriaDelMenu, ItemDelMenu } from '@/server/services/menu-app';

import { Entrega } from './Entrega';
import { HojaDeProducto } from './HojaDeProducto';
import { colones, Contador, Hoja } from './ui';

const CLAVE_GUARDADA = 'pedido-en-curso-v1';

const ICONO_DE_CATEGORIA: Record<string, string> = {
  pizzas: '🍕',
  pollo: '🍗',
  parrilla: '🥩',
  hamburguesas: '🍔',
  combos: '🎁',
  bebidas: '🥤',
  postres: '🍰',
  adicionales: '🍟',
};

export interface InfoParaElQuiosco {
  abierto: boolean;
  sinpe: boolean;
  envioDesde: number | null;
}

export function Quiosco({ menu, info }: { menu: CategoriaDelMenu[]; info: InfoParaElQuiosco }) {
  const [categoriaId, setCategoriaId] = useState<string>(menu[0]?.id ?? '');
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState<ItemDelMenu | null>(null);
  const [verCarrito, setVerCarrito] = useState(false);
  const [paso, setPaso] = useState<'menu' | 'entrega'>('menu');
  const [carrito, setCarrito] = useState<LineaDelCarrito[]>([]);
  const [cargado, setCargado] = useState(false);

  // El carrito sobrevive a recargar la pagina o a que se cierre el navegador.
  useEffect(() => {
    try {
      setCarrito(leerCarritoGuardado(window.localStorage.getItem(CLAVE_GUARDADA)));
    } catch {
      /* sin almacenamiento (ventana privada): el carrito dura lo que dure la pagina */
    }
    setCargado(true);
  }, []);
  useEffect(() => {
    if (!cargado) return;
    try {
      window.localStorage.setItem(CLAVE_GUARDADA, JSON.stringify(carrito));
    } catch {
      /* idem */
    }
  }, [carrito, cargado]);

  const categoria = menu.find((c) => c.id === categoriaId) ?? menu[0];
  const unidades = unidadesDelCarrito(carrito);
  const total = totalDelCarrito(carrito);

  const todos = useMemo(() => menu.flatMap((c) => c.items), [menu]);
  const destacados = useMemo(
    () =>
      DESTACADOS.map((clave) => todos.find((i) => i.clave === clave)).filter(
        (i): i is ItemDelMenu => i !== undefined,
      ),
    [todos],
  );
  const q = paraBuscar(busqueda.trim());
  const resultados = q === '' ? null : todos.filter((i) => paraBuscar(i.nombre).includes(q));

  if (menu.length === 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <img src="/logo.png" alt="" className="h-32 w-auto" />
        <h1 className="text-2xl font-extrabold">Estamos preparando el menú</h1>
        <p className="text-lg text-tinta/70">Volvé en un ratito. Mientras tanto, llamanos y te atendemos.</p>
        <a href="tel:24877021" className="rounded-2xl bg-tomate px-6 py-4 text-lg font-extrabold text-white">
          Llamar al 2487-7021
        </a>
      </main>
    );
  }

  if (paso === 'entrega') {
    return (
      <Entrega
        carrito={carrito}
        sinpe={info.sinpe}
        abierto={info.abierto}
        alVolver={() => setPaso('menu')}
        alTerminar={() => setCarrito([])}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-32">
      {/* --- Cabecera --------------------------------------------------------- */}
      <header className="bg-gradient-to-b from-tomate to-[#a81f17] px-4 pb-5 pt-4 text-white">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="h-14 w-auto rounded-xl bg-white/90 p-1" />
          <div className="leading-tight">
            <h1 className="text-xl font-extrabold">Pizzería La Estación</h1>
            <p className="text-sm text-white/85">Pizza, pollo y hamburguesas a tu casa</p>
          </div>
        </div>
        <ul className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
          <li className="rounded-full bg-white/20 px-3 py-1.5">
            ⏱ {TIEMPO_ESTIMADO.desde}–{TIEMPO_ESTIMADO.hasta} min
          </li>
          <li className="rounded-full bg-white/20 px-3 py-1.5">
            🛵 Envío {info.envioDesde !== null ? `desde ${colones(info.envioDesde)}` : 'según tu zona'}
          </li>
          <li className={`rounded-full px-3 py-1.5 ${info.abierto ? 'bg-albahaca' : 'bg-black/40'}`}>
            {info.abierto ? '● Recibiendo pedidos' : '● Cerrado por ahora'}
          </li>
        </ul>
        <label className="mt-4 block">
          <span className="sr-only">Buscar en el menú</span>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar pizza, pollo, hamburguesa…"
            className="min-h-[3.25rem] w-full rounded-2xl bg-white px-4 text-base text-tinta shadow-sm placeholder:text-tinta/40 focus:outline-none focus:ring-2 focus:ring-white/70"
          />
        </label>
      </header>

      {!info.abierto && (
        <p className="mx-4 mt-4 rounded-2xl bg-amber-100 p-4 text-base font-semibold text-amber-900">
          Por ahora no estamos recibiendo pedidos por la app. Podés ver el menú, y para pedir llamanos al{' '}
          <a href="tel:24877021" className="underline">
            2487-7021
          </a>
          .
        </p>
      )}

      {resultados ? (
        /* --- Resultados de la busqueda ------------------------------------- */
        <section aria-label="Resultados" className="px-4 pt-4">
          <p className="mb-2 text-sm font-bold text-tinta/60">
            {resultados.length === 0 ? 'No encontramos nada con eso.' : `${resultados.length} resultado(s)`}
          </p>
          <ul className="space-y-3">
            {resultados.map((item) => (
              <FilaDePlato key={item.id} item={item} alAbrir={() => setAbierto(item)} />
            ))}
          </ul>
        </section>
      ) : (
        <>
          {/* --- Lo mas pedido ------------------------------------------------ */}
          {destacados.length > 0 && (
            <section aria-label="Lo más pedido" className="pt-5">
              <h2 className="px-4 pb-2 text-xl font-extrabold">Lo más pedido</h2>
              <ul className="flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {destacados.map((item) => (
                  <li key={item.id} className="w-40 shrink-0">
                    <button
                      type="button"
                      onClick={() => setAbierto(item)}
                      className="block w-full text-left"
                    >
                      <span
                        aria-hidden
                        className={`relative flex h-28 items-center justify-center rounded-3xl bg-gradient-to-br text-5xl ${fondoDe(item.categoriaId)}`}
                      >
                        {emojiDe(item.nombre, item.categoriaId)}
                        <span className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-2xl font-bold text-albahaca shadow">
                          +
                        </span>
                      </span>
                      <span className="mt-2 block text-base font-extrabold leading-snug">{item.nombre}</span>
                      <span className="block text-sm font-bold text-tomate">
                        {item.variantes.length > 1 ? 'desde ' : ''}
                        {colones(item.desde)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* --- Categorias --------------------------------------------------- */}
          <nav
            aria-label="Categorías"
            className="sticky top-0 z-10 mt-3 flex gap-2 overflow-x-auto bg-crema/95 px-4 py-3 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {menu.map((c) => {
              const activa = c.id === categoria?.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoriaId(c.id)}
                  aria-pressed={activa}
                  className={`flex shrink-0 items-center gap-2 rounded-full px-5 py-3 text-base font-bold transition ${
                    activa ? 'bg-tomate text-white shadow-md' : 'bg-white text-tinta shadow-sm'
                  }`}
                >
                  <span aria-hidden className="text-xl">
                    {ICONO_DE_CATEGORIA[c.id] ?? '🍽️'}
                  </span>
                  {c.nombre}
                </button>
              );
            })}
          </nav>

          <section aria-label={categoria?.nombre} className="px-4 pt-1">
            <h2 className="pb-2 text-xl font-extrabold">{categoria?.nombre}</h2>
            <ul className="space-y-3">
              {categoria?.items.map((item) => (
                <FilaDePlato key={item.id} item={item} alAbrir={() => setAbierto(item)} />
              ))}
            </ul>
          </section>
        </>
      )}

      {/* --- El carrito, siempre a la vista ---------------------------------------- */}
      {unidades > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-crema via-crema to-transparent px-4 pb-4 pt-8">
          <button
            type="button"
            onClick={() => setVerCarrito(true)}
            className="mx-auto flex min-h-[4rem] w-full max-w-3xl items-center justify-between rounded-2xl bg-albahaca px-5 text-lg font-extrabold text-white shadow-xl"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-white px-2 text-base font-extrabold text-albahaca">
                {unidades}
              </span>
              Ver mi pedido
            </span>
            <span>{colones(total)}</span>
          </button>
        </div>
      )}

      {abierto && (
        <HojaDeProducto
          key={abierto.id}
          item={abierto}
          alCerrar={() => setAbierto(null)}
          alAgregar={(linea) => {
            setCarrito((c) => agregarLinea(c, linea));
            setAbierto(null);
          }}
        />
      )}

      {verCarrito && (
        <HojaDelCarrito
          carrito={carrito}
          abierto={info.abierto}
          alCerrar={() => setVerCarrito(false)}
          alCambiar={(llave, cantidad) => setCarrito((c) => cambiarCantidad(c, llave, cantidad))}
          alContinuar={() => {
            setVerCarrito(false);
            setPaso('entrega');
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </div>
  );
}

/** Un plato en fila: texto a la izquierda, ficha con el icono a la derecha. */
function FilaDePlato({ item, alAbrir }: { item: ItemDelMenu; alAbrir: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={alAbrir}
        className="flex min-h-[7rem] w-full items-stretch gap-3 rounded-3xl bg-white p-3 text-left shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
      >
        <span className="flex min-w-0 flex-1 flex-col justify-between py-1 pl-1">
          <span>
            <span className="block text-lg font-extrabold leading-snug">{item.nombre}</span>
            {item.descripcion && <span className="mt-1 block text-sm text-tinta/60">{item.descripcion}</span>}
          </span>
          <span className="text-base font-extrabold text-tomate">
            {item.variantes.length > 1 && <span className="mr-1 text-sm font-semibold text-tinta/60">desde</span>}
            {colones(item.desde)}
          </span>
        </span>
        <span
          aria-hidden
          className={`relative flex h-24 w-24 shrink-0 items-center justify-center self-center rounded-2xl bg-gradient-to-br text-4xl ${fondoDe(item.categoriaId)}`}
        >
          {emojiDe(item.nombre, item.categoriaId)}
          <span className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-white text-2xl font-bold text-albahaca shadow-md ring-1 ring-black/5">
            +
          </span>
        </span>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// El carrito
// ---------------------------------------------------------------------------

function HojaDelCarrito({
  carrito,
  abierto,
  alCerrar,
  alCambiar,
  alContinuar,
}: {
  carrito: LineaDelCarrito[];
  abierto: boolean;
  alCerrar: () => void;
  alCambiar: (llave: string, cantidad: number) => void;
  alContinuar: () => void;
}) {
  const total = totalDelCarrito(carrito);

  return (
    <Hoja
      titulo="Tu pedido"
      alCerrar={alCerrar}
      pie={
        carrito.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between text-lg">
              <span className="font-semibold">Subtotal</span>
              <span className="text-2xl font-extrabold">{colones(total)}</span>
            </div>
            <p className="text-sm text-tinta/60">El envío se suma según tu ubicación, y el total final lo ves antes de confirmar.</p>
            <button
              type="button"
              onClick={alContinuar}
              disabled={!abierto}
              className="min-h-[3.75rem] w-full rounded-2xl bg-albahaca px-4 text-lg font-extrabold text-white shadow-lg disabled:bg-black/20 disabled:shadow-none"
            >
              {abierto ? 'Continuar con la entrega' : 'Por ahora no recibimos pedidos'}
            </button>
          </div>
        ) : undefined
      }
    >
      {carrito.length === 0 ? (
        <p className="py-10 text-center text-lg text-tinta/60">Todavía no agregaste nada.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {carrito.map((l) => (
            <li key={l.llave} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-extrabold leading-snug">{l.nombre}</p>
                  {l.detalle && <p className="text-sm font-semibold text-tinta/70">{l.detalle}</p>}
                  {l.extras.map((e) => (
                    <p key={e.complementoId} className="text-sm text-tinta/70">
                      + {e.cantidad > 1 ? `${e.cantidad} × ` : ''}
                      {e.etiqueta}
                    </p>
                  ))}
                  {l.notas.map((n) => (
                    <p key={n} className="text-sm italic text-tinta/70">
                      “{n}”
                    </p>
                  ))}
                </div>
                <span className="shrink-0 text-lg font-extrabold">{colones(totalDeLinea(l))}</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => alCambiar(l.llave, 0)}
                  className="min-h-[2.75rem] rounded-full px-3 text-sm font-bold text-tomate underline"
                >
                  Quitar
                </button>
                <Contador
                  valor={l.cantidad}
                  minimo={0}
                  maximo={MAXIMO_POR_LINEA}
                  etiqueta={l.nombre.toLowerCase()}
                  alCambiar={(n) => alCambiar(l.llave, n)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Hoja>
  );
}
