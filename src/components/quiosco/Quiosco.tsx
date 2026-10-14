'use client';

/**
 * El quiosco: la pantalla donde el cliente arma su pedido.
 *
 * Pensado como los quioscos de McDonald's, KFC o Pizza Hut: pocas decisiones por
 * pantalla, botones grandes, y el carrito siempre a la vista. El cliente nunca ve
 * "productos del POS": ve platos, y el sistema traduce lo que eligio al producto
 * exacto de la caja.
 *
 * Los precios que se muestran aqui son de referencia. Al confirmar el pedido el
 * servidor vuelve a calcular todo desde la caja.
 */

import { useEffect, useMemo, useState } from 'react';

import {
  agregarLinea,
  cambiarCantidad,
  crearLinea,
  leerCarritoGuardado,
  totalDeLinea,
  totalDelCarrito,
  unidadesDelCarrito,
  MAXIMO_POR_LINEA,
  type LineaDelCarrito,
} from '@/lib/menu/carrito';
import {
  complementosDe,
  ejesDe,
  precioDeUnidad,
  valoresPosibles,
  varianteElegida,
  type Opciones,
} from '@/lib/menu/estructura';
import { formatearMoneda } from '@/lib/money/money';
import type { CategoriaDelMenu, ItemDelMenu } from '@/server/services/menu-app';

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

const colones = (centimos: number): string => formatearMoneda(centimos);

export function Quiosco({ menu }: { menu: CategoriaDelMenu[] }) {
  const [categoriaId, setCategoriaId] = useState<string>(menu[0]?.id ?? '');
  const [abierto, setAbierto] = useState<ItemDelMenu | null>(null);
  const [verCarrito, setVerCarrito] = useState(false);
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

  if (menu.length === 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <img src="/logo.png" alt="" className="h-32 w-auto" />
        <h1 className="text-2xl font-extrabold">Estamos preparando el menú</h1>
        <p className="text-lg text-tinta/70">Volvé en un ratito. Mientras tanto, llamanos y te atendemos.</p>
      </main>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-32">
      <header className="flex items-center gap-3 px-4 pb-2 pt-4">
        <img src="/logo.png" alt="" className="h-14 w-auto" />
        <div className="leading-tight">
          <h1 className="text-xl font-extrabold text-tomate">Pizzería La Estación</h1>
          <p className="text-sm text-tinta/70">Pedí a domicilio · entrega rápida</p>
        </div>
      </header>

      <nav
        aria-label="Categorías"
        className="sticky top-0 z-10 flex gap-2 overflow-x-auto bg-crema/95 px-4 py-3 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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

      <section aria-label={categoria?.nombre} className="grid grid-cols-2 gap-3 px-4 pt-2 sm:grid-cols-3">
        {categoria?.items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setAbierto(item)}
            className="flex min-h-[9rem] flex-col justify-between rounded-3xl bg-white p-4 text-left shadow-sm ring-1 ring-black/5 transition active:scale-[0.98]"
          >
            <span className="text-lg font-extrabold leading-snug">{item.nombre}</span>
            <span className="mt-3 flex items-end justify-between gap-2">
              <span className="text-sm text-tinta/60">
                {item.variantes.length > 1 ? 'desde' : ''}
                <span className="block text-lg font-extrabold text-tomate">{colones(item.desde)}</span>
              </span>
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-full bg-albahaca text-2xl font-bold text-white"
              >
                +
              </span>
            </span>
          </button>
        ))}
      </section>

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
          alCerrar={() => setVerCarrito(false)}
          alCambiar={(llave, cantidad) => setCarrito((c) => cambiarCantidad(c, llave, cantidad))}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La hoja de un producto
// ---------------------------------------------------------------------------

function Hoja({
  titulo,
  alCerrar,
  children,
  pie,
}: {
  titulo: string;
  alCerrar: () => void;
  children: React.ReactNode;
  pie?: React.ReactNode;
}) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = antes;
    };
  }, [alCerrar]);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={titulo}>
      <button type="button" aria-label="Cerrar" onClick={alCerrar} className="absolute inset-0 bg-black/50" />
      <div className="relative flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-[2rem] bg-crema shadow-2xl sm:rounded-[2rem]">
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <h2 className="text-2xl font-extrabold leading-tight">{titulo}</h2>
          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-2xl shadow-sm"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-4">{children}</div>
        {pie && <div className="border-t border-black/10 bg-crema px-5 py-4">{pie}</div>}
      </div>
    </div>
  );
}

function Paso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-tinta/60">{titulo}</h3>
      {children}
    </section>
  );
}

function Contador({
  valor,
  minimo,
  maximo,
  alCambiar,
  etiqueta,
}: {
  valor: number;
  minimo: number;
  maximo: number;
  alCambiar: (n: number) => void;
  etiqueta: string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-white p-1 shadow-sm">
      <button
        type="button"
        aria-label={`Quitar ${etiqueta}`}
        disabled={valor <= minimo}
        onClick={() => alCambiar(valor - 1)}
        className="flex h-11 w-11 items-center justify-center rounded-full text-2xl font-bold text-tomate disabled:opacity-30"
      >
        −
      </button>
      <span className="min-w-8 text-center text-lg font-extrabold" aria-live="polite">
        {valor}
      </span>
      <button
        type="button"
        aria-label={`Agregar ${etiqueta}`}
        disabled={valor >= maximo}
        onClick={() => alCambiar(valor + 1)}
        className="flex h-11 w-11 items-center justify-center rounded-full text-2xl font-bold text-albahaca disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

function HojaDeProducto({
  item,
  alCerrar,
  alAgregar,
}: {
  item: ItemDelMenu;
  alCerrar: () => void;
  alAgregar: (linea: LineaDelCarrito) => void;
}) {
  const ejes = useMemo(() => ejesDe(item.variantes, item.ejes), [item]);
  const [elegido, setElegido] = useState<Opciones>(() => {
    // Un plato sin decisiones, o con una sola opcion posible, no pregunta nada.
    const inicial: Opciones = {};
    for (const eje of ejes) if (eje.valores.length === 1) inicial[eje.nombre] = eje.valores[0]!;
    return inicial;
  });
  const [extras, setExtras] = useState<Record<string, number>>({});
  const [notas, setNotas] = useState<string[]>([]);
  const [notaLibre, setNotaLibre] = useState('');
  const [cantidad, setCantidad] = useState(1);

  const variante = varianteElegida(item.variantes, elegido);
  const extrasDisponibles = variante ? complementosDe(item.complementos, variante) : [];
  const extrasSeleccionados = Object.entries(extras)
    .filter(([id, n]) => n > 0 && extrasDisponibles.some((c) => c.id === id))
    .map(([complementoId, n]) => ({ complementoId, cantidad: n }));
  const unidad = variante ? precioDeUnidad(variante, item.complementos, extrasSeleccionados) : null;
  const total = unidad === null ? 0 : unidad * cantidad;

  const elegir = (eje: string, valor: string) => {
    setElegido((antes) => {
      const nuevo: Opciones = { ...antes, [eje]: valor };
      // Si al cambiar esta decision otra ya no existe, se pregunta de nuevo.
      for (const e of ejes) {
        if (e.nombre === eje || nuevo[e.nombre] === undefined) continue;
        if (!valoresPosibles(item.variantes, e.nombre, nuevo).includes(nuevo[e.nombre]!)) {
          delete nuevo[e.nombre];
        }
      }
      return nuevo;
    });
    setExtras({}); // los extras dependen del tamano
  };

  const agregar = () => {
    if (!variante || unidad === null) return;
    const lineaExtras = extrasSeleccionados.map((e) => {
      const c = item.complementos.find((x) => x.id === e.complementoId)!;
      return { complementoId: c.id, etiqueta: c.etiqueta, cantidad: e.cantidad, precio: c.precio };
    });
    alAgregar(
      crearLinea({
        itemId: item.id,
        varianteId: variante.id,
        nombre: item.nombre,
        detalle: ejes.map((e) => elegido[e.nombre]).filter(Boolean).join(' · '),
        cantidad,
        precioUnidad: unidad,
        extras: lineaExtras,
        notas: [...notas, notaLibre],
      }),
    );
  };

  const falta = ejes.find((e) => elegido[e.nombre] === undefined);

  return (
    <Hoja
      titulo={item.nombre}
      alCerrar={alCerrar}
      pie={
        <div className="flex items-center gap-3">
          <Contador valor={cantidad} minimo={1} maximo={MAXIMO_POR_LINEA} alCambiar={setCantidad} etiqueta="una unidad" />
          <button
            type="button"
            onClick={agregar}
            disabled={!variante}
            className="min-h-[3.75rem] flex-1 rounded-2xl bg-albahaca px-4 text-lg font-extrabold text-white shadow-lg disabled:bg-black/20 disabled:shadow-none"
          >
            {variante ? `Agregar · ${colones(total)}` : falta ? `Elegí ${falta.nombre.toLowerCase()}` : 'No disponible'}
          </button>
        </div>
      }
    >
      {item.descripcion && <p className="text-tinta/70">{item.descripcion}</p>}

      {ejes.map((eje) => {
        const posibles = valoresPosibles(item.variantes, eje.nombre, elegido);
        return (
          <Paso key={eje.nombre} titulo={eje.nombre}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {eje.valores.map((valor) => {
                const activo = elegido[eje.nombre] === valor;
                const disponible = posibles.includes(valor);
                const v = varianteElegida(item.variantes, { ...elegido, [eje.nombre]: valor });
                return (
                  <button
                    key={valor}
                    type="button"
                    disabled={!disponible}
                    aria-pressed={activo}
                    onClick={() => elegir(eje.nombre, valor)}
                    className={`flex min-h-[3.75rem] items-center justify-between gap-2 rounded-2xl px-4 text-left text-base font-bold transition disabled:opacity-35 ${
                      activo ? 'bg-tomate text-white shadow-md' : 'bg-white text-tinta shadow-sm ring-1 ring-black/5'
                    }`}
                  >
                    <span>{valor}</span>
                    {v && <span className={activo ? 'text-white/90' : 'text-tomate'}>{colones(v.precio)}</span>}
                  </button>
                );
              })}
            </div>
          </Paso>
        );
      })}

      {extrasDisponibles.length > 0 && (
        <Paso titulo="Extras">
          <ul className="space-y-2">
            {extrasDisponibles.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-2 pl-4 shadow-sm ring-1 ring-black/5">
                <span className="font-semibold">
                  {c.etiqueta}
                  <span className="ml-2 text-sm font-bold text-tomate">+{colones(c.precio)}</span>
                </span>
                <Contador
                  valor={extras[c.id] ?? 0}
                  minimo={0}
                  maximo={c.maximo}
                  etiqueta={c.etiqueta.toLowerCase()}
                  alCambiar={(n) => setExtras((e) => ({ ...e, [c.id]: n }))}
                />
              </li>
            ))}
          </ul>
        </Paso>
      )}

      {(item.notasRapidas.length > 0 || variante) && (
        <Paso titulo="¿Algo especial?">
          <div className="flex flex-wrap gap-2">
            {item.notasRapidas.map((n) => {
              const activa = notas.includes(n);
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={activa}
                  onClick={() => setNotas((antes) => (activa ? antes.filter((x) => x !== n) : [...antes, n]))}
                  className={`min-h-[2.75rem] rounded-full px-4 text-base font-bold transition ${
                    activa ? 'bg-albahaca text-white' : 'bg-white text-tinta shadow-sm ring-1 ring-black/5'
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={notaLibre}
            maxLength={100}
            onChange={(e) => setNotaLibre(e.target.value)}
            placeholder="Algo más que quieras decirnos"
            aria-label="Una nota para la cocina"
            className="mt-3 min-h-[3.25rem] w-full rounded-2xl bg-white px-4 text-base shadow-sm ring-1 ring-black/10 placeholder:text-tinta/40 focus:outline-none focus:ring-2 focus:ring-tomate"
          />
        </Paso>
      )}
    </Hoja>
  );
}

// ---------------------------------------------------------------------------
// El carrito
// ---------------------------------------------------------------------------

function HojaDelCarrito({
  carrito,
  alCerrar,
  alCambiar,
}: {
  carrito: LineaDelCarrito[];
  alCerrar: () => void;
  alCambiar: (llave: string, cantidad: number) => void;
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
            <p className="text-sm text-tinta/60">El envío se suma según tu zona, y el total final lo ves antes de confirmar.</p>
            <button
              type="button"
              disabled
              className="min-h-[3.75rem] w-full rounded-2xl bg-black/20 px-4 text-lg font-extrabold text-white"
            >
              Continuar con la entrega · próximamente
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
