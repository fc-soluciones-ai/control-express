'use client';

/**
 * La hoja que se abre al tocar un plato: tamano o presentacion, extras, notas y
 * cantidad. Todo con botones grandes.
 */

import { useMemo, useState } from 'react';

import { crearLinea, MAXIMO_POR_LINEA, type LineaDelCarrito } from '@/lib/menu/carrito';
import {
  complementosDe,
  ejesDe,
  precioDeUnidad,
  valoresPosibles,
  varianteElegida,
  type Opciones,
} from '@/lib/menu/estructura';
import { emojiDe, fondoDe } from '@/lib/menu/presentacion';
import type { ItemDelMenu } from '@/server/services/menu-app';

import { colones, Contador, Hoja, Paso } from './ui';

export function HojaDeProducto({
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
      <div
        aria-hidden
        className={`mt-1 flex h-28 items-center justify-center rounded-3xl bg-gradient-to-br text-6xl ${fondoDe(item.categoriaId)}`}
      >
        {emojiDe(item.nombre, item.categoriaId)}
      </div>
      {item.descripcion && <p className="mt-3 text-tinta/70">{item.descripcion}</p>}

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
