import type { Config } from 'tailwindcss';

/**
 * La paleta y las medidas estan pensadas para un monitor tactil de mostrador:
 * fondo oscuro para no encandilar en un local con poca luz, texto grande y
 * objetivos de al menos 64 px, que es lo que mide un dedo con guante.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fondo: '#0b1120',
        panel: '#111c33',
        panelClaro: '#1a2947',
        borde: '#24365c',
        entrada: '#22c55e', // dinero que entra
        alerta: '#f43f5e', // faltante
        aviso: '#f59e0b', // sobrante y advertencias
        // El rojo del pedido que ya se paso de tarde. Mas saturado que
        // "alerta" a proposito: en el tablero va relleno, no solo en el borde,
        // y tiene que ganarle a cualquier otra cosa de la pantalla.
        critico: '#e11d48',
      },
      spacing: {
        tactil: '4rem', // 64 px, minimo de un objetivo tactil
      },
      keyframes: {
        // El pedido critico parpadea. No se apaga del todo: un bloque que
        // desaparece se lee como un error de la pantalla, y uno que solo baja
        // de intensidad se lee como lo que es, una alarma.
        parpadeo: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
      },
      animation: {
        parpadeo: 'parpadeo 1.1s ease-in-out infinite',
      },
      fontSize: {
        cifra: ['2.75rem', { lineHeight: '1', fontWeight: '700' }],
        cifraGrande: ['4rem', { lineHeight: '1', fontWeight: '800' }],
      },
    },
  },
  plugins: [],
};

export default config;
