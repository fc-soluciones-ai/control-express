'use client';

/**
 * Usuarios de caja: quien entra por la pestana Administrador y con que rol.
 *
 * Cada fila dice lo unico que hace falta decidir: que puede hacer, si esta
 * activo, y si tiene sesiones abiertas en algun equipo. El PIN nunca se
 * muestra; solo se puede poner uno nuevo.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  accionAsignarPinUsuario,
  accionCrearUsuario,
  accionEditarUsuario,
} from '@/app/configuracion/acciones';
import { LARGO_MINIMO_PIN, TecladoPin } from '@/components/TecladoPin';
import type { UsuarioDeCaja } from '@/server/services/usuarios';

interface Props {
  usuarios: UsuarioDeCaja[];
  /** Quien esta mirando: no se puede desactivar ni degradar a si mismo. */
  yoId: string;
}

const ROLES: Array<{ valor: string; etiqueta: string; puede: string }> = [
  { valor: 'CAJERO', etiqueta: 'Cajero', puede: 'Turnos, abonos, cierres y arqueos.' },
  {
    valor: 'SUPERVISOR',
    etiqueta: 'Supervisor',
    puede: 'Lo del cajero, mas importar el Excel, la flota y los repartidores.',
  },
  {
    valor: 'ADMIN',
    etiqueta: 'Administrador',
    puede: 'Todo, incluidos los usuarios, los roles y los PIN.',
  },
];

const NOMBRE_ROL: Record<string, string> = {
  CAJERO: 'Cajero',
  SUPERVISOR: 'Supervisor',
  ADMIN: 'Administrador',
};

export function PanelUsuarios({ usuarios, yoId }: Props) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [paraPin, setParaPin] = useState<UsuarioDeCaja | null>(null);
  const [confirmarBaja, setConfirmarBaja] = useState<string | null>(null);

  const cambiar = useCallback(
    async (usuario: UsuarioDeCaja, cambios: { rol?: string; estado?: string }) => {
      setTrabajando(usuario.id);
      setError(null);
      setAviso(null);
      const respuesta = await accionEditarUsuario(usuario.id, cambios);
      setTrabajando(null);
      setConfirmarBaja(null);
      if (!respuesta.ok) {
        setError(respuesta.mensaje);
        return;
      }
      setAviso(
        cambios.estado
          ? `${usuario.nombre} quedo ${cambios.estado === 'ACTIVO' ? 'activo' : 'fuera de servicio'}.`
          : `${usuario.nombre} ahora es ${NOMBRE_ROL[cambios.rol ?? ''] ?? cambios.rol}.`,
      );
      router.refresh();
    },
    [router],
  );

  const activos = usuarios.filter((u) => u.estado === 'ACTIVO');
  const inactivos = usuarios.filter((u) => u.estado !== 'ACTIVO');

  return (
    <div className="space-y-5">
      <button
        type="button"
        className="boton-tactil w-full bg-entrada text-lg text-slate-950"
        onClick={() => {
          setError(null);
          setAviso(null);
          setCreando(true);
        }}
      >
        ＋ Agregar usuario de caja
      </button>

      {error ? (
        <p className="rounded-2xl bg-alerta/15 p-5 text-center text-lg text-alerta" role="alert">
          {error}
        </p>
      ) : null}
      {aviso ? (
        <p className="rounded-2xl bg-entrada/15 p-5 text-center text-lg text-entrada">{aviso}</p>
      ) : null}

      <Seccion titulo={`Activos (${activos.length})`}>
        {activos.map((u) => (
          <Fila
            key={u.id}
            usuario={u}
            soyYo={u.id === yoId}
            trabajando={trabajando === u.id}
            confirmandoBaja={confirmarBaja === u.id}
            alPedirBaja={() => setConfirmarBaja(u.id)}
            alCancelarBaja={() => setConfirmarBaja(null)}
            alCambiarRol={(rol) => cambiar(u, { rol })}
            alCambiarEstado={(estado) => cambiar(u, { estado })}
            alAsignarPin={() => {
              setError(null);
              setAviso(null);
              setParaPin(u);
            }}
          />
        ))}
      </Seccion>

      {inactivos.length > 0 ? (
        <Seccion titulo={`Fuera de servicio (${inactivos.length})`}>
          {inactivos.map((u) => (
            <Fila
              key={u.id}
              usuario={u}
              soyYo={u.id === yoId}
              trabajando={trabajando === u.id}
              confirmandoBaja={false}
              alPedirBaja={() => undefined}
              alCancelarBaja={() => undefined}
              alCambiarRol={(rol) => cambiar(u, { rol })}
              alCambiarEstado={(estado) => cambiar(u, { estado })}
              alAsignarPin={() => {
                setError(null);
                setAviso(null);
                setParaPin(u);
              }}
            />
          ))}
        </Seccion>
      ) : null}

      {creando ? (
        <ModalNuevoUsuario
          alCerrar={() => setCreando(false)}
          alGuardar={(mensaje) => {
            setCreando(false);
            setAviso(mensaje);
            router.refresh();
          }}
        />
      ) : null}

      {paraPin ? (
        <ModalPinUsuario
          usuario={paraPin}
          alCerrar={() => setParaPin(null)}
          alGuardar={(mensaje) => {
            setParaPin(null);
            setAviso(mensaje);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="tarjeta p-5">
      <h2 className="text-lg font-bold">{titulo}</h2>
      <ul className="mt-4 space-y-3">{children}</ul>
    </section>
  );
}

function Fila({
  usuario,
  soyYo,
  trabajando,
  confirmandoBaja,
  alPedirBaja,
  alCancelarBaja,
  alCambiarRol,
  alCambiarEstado,
  alAsignarPin,
}: {
  usuario: UsuarioDeCaja;
  soyYo: boolean;
  trabajando: boolean;
  confirmandoBaja: boolean;
  alPedirBaja: () => void;
  alCancelarBaja: () => void;
  alCambiarRol: (rol: string) => void;
  alCambiarEstado: (estado: string) => void;
  alAsignarPin: () => void;
}) {
  const activo = usuario.estado === 'ACTIVO';

  return (
    <li className={`rounded-2xl border border-borde bg-fondo p-4 ${activo ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xl font-bold">
            {usuario.nombre}
            {soyYo ? <span className="ml-2 text-sm text-slate-500">(usted)</span> : null}
          </p>
          <p className="text-sm text-slate-400">
            {NOMBRE_ROL[usuario.rol] ?? usuario.rol}
            {usuario.sesionesAbiertas > 0
              ? ` · ${usuario.sesionesAbiertas} sesion${usuario.sesionesAbiertas === 1 ? '' : 'es'} abierta${usuario.sesionesAbiertas === 1 ? '' : 's'}`
              : ''}
            {usuario.tieneMovimientos ? ' · con movimientos firmados' : ''}
          </p>
          {usuario.bloqueadoHasta ? (
            <p className="mt-1 inline-block rounded-lg bg-aviso/15 px-2 py-1 text-xs text-aviso">
              bloqueado por intentos hasta{' '}
              {new Date(usuario.bloqueadoHasta).toLocaleTimeString('es-CR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          ) : null}
        </div>

        <label className="text-sm">
          <span className="block text-xs uppercase tracking-wide text-slate-500">Rol</span>
          <select
            value={usuario.rol}
            disabled={trabajando || soyYo}
            onChange={(e) => alCambiarRol(e.target.value)}
            title={soyYo ? 'No puede cambiarse el rol a si mismo' : undefined}
            className="mt-1 h-tactil rounded-2xl border border-borde bg-panelClaro px-3 text-slate-100 outline-none focus:border-entrada disabled:opacity-50"
          >
            {ROLES.map((r) => (
              <option key={r.valor} value={r.valor}>
                {r.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>

      {confirmandoBaja ? (
        <div className="mt-3 rounded-2xl border border-alerta/50 bg-alerta/10 p-3">
          <p className="text-sm text-slate-200">
            ¿Sacar de servicio a <span className="font-bold">{usuario.nombre}</span>? No podra
            entrar y se cerraran sus sesiones. Sus movimientos se conservan.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="boton-tactil border border-borde bg-panelClaro text-slate-300"
              onClick={alCancelarBaja}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="boton-tactil bg-alerta text-white disabled:opacity-40"
              disabled={trabajando}
              onClick={() => alCambiarEstado('INACTIVO')}
            >
              Si, desactivar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className="boton-tactil border border-entrada/50 bg-entrada/10 text-entrada disabled:opacity-40"
            disabled={trabajando || !activo}
            onClick={alAsignarPin}
            title={activo ? undefined : 'Reactivelo antes de darle PIN'}
          >
            🔑 {soyYo ? 'Cambiar mi PIN' : 'Resetear PIN'}
          </button>
          {activo ? (
            <button
              type="button"
              className="boton-tactil border border-alerta/50 bg-alerta/10 text-alerta disabled:opacity-40"
              disabled={trabajando || soyYo}
              onClick={alPedirBaja}
              title={soyYo ? 'No puede desactivarse a si mismo' : undefined}
            >
              Desactivar
            </button>
          ) : (
            <button
              type="button"
              className="boton-tactil border border-entrada/50 bg-entrada/10 text-entrada disabled:opacity-40"
              disabled={trabajando}
              onClick={() => alCambiarEstado('ACTIVO')}
            >
              Reactivar
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function Marco({
  titulo,
  subtitulo,
  alCerrar,
  bloqueado,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  alCerrar: () => void;
  bloqueado: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="tarjeta w-full max-w-sm p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">{titulo}</h2>
            {subtitulo ? <p className="text-slate-400">{subtitulo}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            className="h-12 w-12 shrink-0 rounded-full border border-borde text-2xl text-slate-400 active:scale-95"
            onClick={alCerrar}
            disabled={bloqueado}
          >
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function ModalNuevoUsuario({
  alCerrar,
  alGuardar,
}: {
  alCerrar: () => void;
  alGuardar: (mensaje: string) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState('CAJERO');
  const [pin, setPin] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = useCallback(async () => {
    if (enviando) return;
    setEnviando(true);
    setError(null);
    const respuesta = await accionCrearUsuario({ nombre, rol, pin });
    setEnviando(false);
    if (!respuesta.ok) {
      setError(respuesta.mensaje);
      return;
    }
    alGuardar(`${nombre.trim()} ya puede entrar como ${NOMBRE_ROL[rol]}.`);
  }, [alGuardar, enviando, nombre, pin, rol]);

  const listo = nombre.trim().length >= 3 && pin.length >= LARGO_MINIMO_PIN;

  return (
    <Marco titulo="Nuevo usuario de caja" alCerrar={alCerrar} bloqueado={enviando}>
      <label className="mt-5 block">
        <span className="text-xs uppercase tracking-wide text-slate-500">Nombre</span>
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Karla (Caja 1)"
          disabled={enviando}
          className="mt-2 h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
        />
        <span className="mt-1 block text-xs text-slate-500">
          Es el nombre que aparece en la pantalla de entrada y firma cada movimiento.
        </span>
      </label>

      <div className="mt-5">
        <span className="text-xs uppercase tracking-wide text-slate-500">Rol</span>
        <div className="mt-2 grid gap-2">
          {ROLES.map((r) => (
            <button
              key={r.valor}
              type="button"
              aria-pressed={rol === r.valor}
              disabled={enviando}
              onClick={() => setRol(r.valor)}
              className={`rounded-2xl border p-3 text-left transition active:scale-[0.99] ${
                rol === r.valor
                  ? 'border-entrada bg-entrada/15'
                  : 'border-borde bg-panelClaro'
              }`}
            >
              <span className="block font-bold">{r.etiqueta}</span>
              <span className="block text-xs text-slate-400">{r.puede}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <span className="text-xs uppercase tracking-wide text-slate-500">PIN de entrada</span>
        <div className="mt-2">
          <TecladoPin valor={pin} alCambiar={setPin} bloqueado={enviando} />
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl bg-alerta/15 p-3 text-center text-alerta" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={guardar}
        disabled={!listo || enviando}
        className="boton-tactil mt-5 h-16 w-full bg-entrada text-xl text-slate-950 disabled:bg-slate-700 disabled:text-slate-500"
      >
        {enviando ? 'Guardando...' : 'Crear usuario'}
      </button>
    </Marco>
  );
}

function ModalPinUsuario({
  usuario,
  alCerrar,
  alGuardar,
}: {
  usuario: UsuarioDeCaja;
  alCerrar: () => void;
  alGuardar: (mensaje: string) => void;
}) {
  const [pin, setPin] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = useCallback(async () => {
    if (enviando || pin.length < LARGO_MINIMO_PIN) return;
    setEnviando(true);
    setError(null);
    const respuesta = await accionAsignarPinUsuario(usuario.id, pin);
    setEnviando(false);
    if (!respuesta.ok) {
      setError(respuesta.mensaje);
      return;
    }
    alGuardar(
      `${usuario.nombre} ya puede entrar con el PIN nuevo.` +
        (respuesta.datos.sesionesCerradas > 0
          ? ` Se cerraron ${respuesta.datos.sesionesCerradas} sesion(es) que tenia abiertas.`
          : ''),
    );
  }, [alGuardar, enviando, pin, usuario]);

  return (
    <Marco titulo="PIN de entrada" subtitulo={usuario.nombre} alCerrar={alCerrar} bloqueado={enviando}>
      <p className="mt-4 text-sm text-slate-400">
        Entre 4 y 6 digitos. El PIN anterior deja de servir y se cierran sus sesiones abiertas.
      </p>
      <div className="mt-4">
        <TecladoPin valor={pin} alCambiar={setPin} bloqueado={enviando} />
      </div>

      {error ? (
        <p className="mt-4 rounded-xl bg-alerta/15 p-3 text-center text-alerta" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={guardar}
        disabled={enviando || pin.length < LARGO_MINIMO_PIN}
        className="boton-tactil mt-5 h-16 w-full bg-entrada text-xl text-slate-950 disabled:bg-slate-700 disabled:text-slate-500"
      >
        {enviando ? 'Guardando...' : 'Guardar PIN'}
      </button>
    </Marco>
  );
}
