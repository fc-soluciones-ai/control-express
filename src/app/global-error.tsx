'use client';

/**
 * El ultimo cable: un fallo tan temprano que ni el layout llego a pintarse.
 *
 * Por eso trae su propio <html> y sus estilos en linea: aqui no se puede
 * contar con la hoja de estilos ni con ningun componente.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          background: '#0b1120',
          color: '#e2e8f0',
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          padding: '1.25rem',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <p style={{ fontSize: '3rem', margin: 0 }}>⚠️</p>
          <h1 style={{ fontSize: '1.5rem' }}>La aplicacion no pudo arrancar</h1>
          <p style={{ color: '#94a3b8' }}>
            Intente de nuevo. Si vuelve a pasar, avise con este codigo:
            {error.digest ? ` ${error.digest}` : ' sin codigo'}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              padding: '1rem 2rem',
              borderRadius: '1rem',
              border: 0,
              background: '#22c55e',
              color: '#020617',
              fontWeight: 700,
              fontSize: '1rem',
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
