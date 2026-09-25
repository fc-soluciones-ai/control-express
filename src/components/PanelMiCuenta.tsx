'use client';

/**
 * Mi cuenta: lo poco que cada quien puede cambiar de si mismo.
 *
 * El PIN se cambia pidiendo el actual. Sin eso, cualquiera que encuentre una
 * pantalla abierta se queda con el usuario de otro, y con su firma en los
 * movimientos del turno.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

import { accionCambiarMiPin } from '@/app/configuracion/acciones';
import { LARGO_MINIMO_PIN, TecladoPin } from '@/components/TecladoPin';

interface Props {
  usuario: { nombre: string; rol: string };
  sesionesAbiertas: number;
}

const NOMBRE_ROL: Record<string, string> = {
  CAJERO: 'Cajero',
  SUPERVISOR: 'Supervisor',
  ADMIN: 'Administrador',
};

const PUEDE: Record<string, string[]> = {
  CAJERO: ['Turnos, abonos, cierres y arqueos'],
  SUPERVISOR: [
    'Turnos, abonos, cierres y arqueos',
    'Importar el Excel de ventas',
    'Flota, gastos y repartidores',
  ],
  ADMIN: [
    'Turnos, abonos, cierres y arqueos',
    'Importar el Excel de ventas',
    'Flota, gastos y repartidores',
    'Usuarios de caja, roles y PIN',
  ],
};

export function PanelMiCuenta({ usuario, sesionesAbiertas }: Props) {
  const router = useRouter();
  const [paso, setPaso] = useState<'ACTUAL' | 'NUEVO'>('ACTUAL');
  const [actual, setActual] = useState('');
  const [nuevo, setNuevo] = useState('');
  const [cambiando, setCambiando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const cerrar = () => {
    setCambiando(false);
    setPaso('ACTUAL');
    setActual('');
    setNuevo('');
    setError(null);
  };

  const guardar = useCallback(async () => {
    if (enviando || nuevo.length < LARGO_MINIMO_PIN) return;
    setEnviando(true);
    setError(null);
    const respuesta = await accionCambiarMiPin(actual, nuevo);
    setEnviando(false);
    if (!respuesta.ok) {
      setError(respuesta.mensaje);
      // El PIN actual es lo que suele estar mal: se vuelve a pedir.
      setPaso('ACTUAL');
      setActual('');
      setNuevo('');
      return;
    }
    cerrar();
    setListo(true);
    router.refresh();
  }, [actual, enviando, nuevo, router]);

  return (
    <div className="space-y-5">
      <section className="tarjeta p-6">
        <p className="text-xs uppercase tracking-wide text-slate-500">Usuario</p>
        <p className="text-2xl font-bold">{usuario.nombre}</p>
        <p className="mt-1 text-slate-400">{NOMBRE_ROL[usuario.rol] ?? usuario.rol}</p>
        <p className="mt-3 text-sm text-slate-500">
          {sesionesAbiertas === 1
            ? 'Tiene 1 sesion abierta, la de este equipo.'
            : `Tiene ${sesionesAbiertas} sesiones abiertas en distintos equipos.`}
        </p>

        <p className="mt-5 text-xs uppercase tracking-wide text-slate-500">Su rol le permite</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-300">
          {(PUEDE[usuario.rol] ?? []).map((linea) => (
            <li key={linea}>· {linea}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Para cambiar de rol hay que pedirselo a un administrador.
        </p>
      </section>

      <section className="tarjeta p-6">
        <p className="text-xl font-bold">PIN de entrada</p>
        <p className="mt-1 text-sm text-slate-400">
          Cambielo si alguien mas lo vio. Le vamos a pedir el actual primero.
        </p>

        {listo ? (
          <p className="mt-4 rounded-2xl bg-entrada/15 p-4 text-center text-entrada">
            PIN cambiado. Use el nuevo la proxima vez que entre.
          </p>
        ) : null}

        {!cambiando ? (
          <button
            type="button"
            className="boton-tactil mt-4 w-full border border-entrada/50 bg-entrada/10 text-entrada"
            onClick={() => {
              setListo(false);
              setCambiando(true);
            }}
          >
            🔑 Cambiar mi PIN
          </button>
        ) : (
          <div className="mt-4">
            <p className="mb-2 text-sm font-bold text-slate-200">
              {paso === 'ACTUAL' ? '1. Su PIN actual' : '2. El PIN nuevo'}
            </p>
            <TecladoPin
              valor={paso === 'ACTUAL' ? actual : nuevo}
              alCambiar={paso === 'ACTUAL' ? setActual : setNuevo}
              bloqueado={enviando}
              vacio={paso === 'ACTUAL' ? 'PIN actual' : 'PIN nuevo'}
            />

            {error ? (
              <p className="mt-4 rounded-xl bg-alerta/15 p-3 text-center text-alerta" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                className="boton-tactil border border-borde bg-panelClaro text-slate-300"
                onClick={cerrar}
                disabled={enviando}
              >
                Cancelar
              </button>
              {paso === 'ACTUAL' ? (
                <button
                  type="button"
                  className="boton-tactil bg-entrada text-slate-950 disabled:bg-slate-700 disabled:text-slate-500"
                  disabled={actual.length < LARGO_MINIMO_PIN}
                  onClick={() => {
                    setError(null);
                    setPaso('NUEVO');
                  }}
                >
                  Siguiente
                </button>
              ) : (
                <button
                  type="button"
                  className="boton-tactil bg-entrada text-slate-950 disabled:bg-slate-700 disabled:text-slate-500"
                  disabled={enviando || nuevo.length < LARGO_MINIMO_PIN}
                  onClick={guardar}
                >
                  {enviando ? 'Guardando...' : 'Guardar PIN'}
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
