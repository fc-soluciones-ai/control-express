'use client';

/**
 * Un mapa pequeno con un pin que se mueve, como el de Uber.
 *
 * POR QUE UN PIN Y NO SOLO EL GPS
 *
 * El GPS del telefono se equivoca unos metros en la ciudad y bastantes mas en un
 * barrio con arboles o techos de lamina. El cliente ve donde cayo el pin y lo
 * mueve a su puerta: el repartidor llega ahi.
 *
 * El mapa es de OpenStreetMap, gratis para este piloto. Para mucho trafico hay que
 * pasar a un proveedor de mapas (ver docs/PROPUESTA-CUENTAS-Y-UBICACION.md).
 *
 * Leaflet toca el documento, asi que se carga solo en el navegador, ya montado.
 */

import 'leaflet/dist/leaflet.css';

import type { Map as MapaLeaflet, Marker } from 'leaflet';
import { useEffect, useRef } from 'react';

const PIN =
  '<div style="position:absolute;left:-18px;top:-38px;font-size:38px;line-height:38px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))">📍</div>';

export function MapaConPin({
  lat,
  lng,
  alMover,
}: {
  lat: number;
  lng: number;
  alMover: (lat: number, lng: number) => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);
  const pin = useRef<Marker | null>(null);
  // El ultimo valor de la funcion, sin volver a armar el mapa cada vez.
  const avisar = useRef(alMover);
  avisar.current = alMover;

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const L = (await import('leaflet')).default;
      if (cancelado || !contenedor.current || mapa.current) return;

      const m = L.map(contenedor.current, { zoomControl: true, attributionControl: true }).setView([lat, lng], 17);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(m);

      const marcador = L.marker([lat, lng], {
        draggable: true,
        icon: L.divIcon({ className: '', html: PIN, iconSize: [0, 0] }),
      }).addTo(m);
      marcador.on('dragend', () => {
        const p = marcador.getLatLng();
        avisar.current(p.lat, p.lng);
      });
      // Tocar el mapa tambien mueve el pin: con el dedo es mas facil que arrastrarlo.
      m.on('click', (e) => {
        marcador.setLatLng(e.latlng);
        avisar.current(e.latlng.lat, e.latlng.lng);
      });

      mapa.current = m;
      pin.current = marcador;
      // El mapa nace dentro de una hoja que acaba de aparecer: sin esto sale cortado.
      setTimeout(() => m.invalidateSize(), 150);
    })();

    return () => {
      cancelado = true;
      mapa.current?.remove();
      mapa.current = null;
      pin.current = null;
    };
    // El mapa se arma una sola vez; los cambios de posicion entran por el otro efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Una ubicacion nueva (otro GPS, otra direccion guardada) mueve el pin y el mapa.
  useEffect(() => {
    const m = mapa.current;
    const p = pin.current;
    if (!m || !p) return;
    const actual = p.getLatLng();
    if (Math.abs(actual.lat - lat) > 1e-7 || Math.abs(actual.lng - lng) > 1e-7) {
      p.setLatLng([lat, lng]);
      m.setView([lat, lng], Math.max(m.getZoom(), 17));
    }
  }, [lat, lng]);

  return (
    <div
      ref={contenedor}
      role="application"
      aria-label="Mapa para marcar dónde te entregamos. Tocá el mapa o arrastrá el pin."
      className="h-56 w-full overflow-hidden rounded-2xl bg-masa ring-1 ring-black/10"
    />
  );
}
