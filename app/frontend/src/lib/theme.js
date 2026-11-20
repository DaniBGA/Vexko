// src/lib/theme.js
import { useLayoutEffect, useState } from 'react';

// Modo claro/oscuro de la app logueada. Claro por defecto; la elección queda
// en el navegador (es una preferencia de cada dispositivo, no de la cuenta).
const STORAGE_KEY = 'vexko-theme';

function readStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

// La clase `dark` va en <html> solo mientras AppLayout está montado: al salir
// de la app (landing, logins, pantalla de bloqueo) se saca, así esas pantallas
// quedan siempre con su paleta clara aunque la sucursal use el modo oscuro.
export function useAppTheme() {
  const [theme, setTheme] = useState(readStoredTheme);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    return () => root.classList.remove('dark');
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Sin storage (navegación privada) el cambio vale solo para esta sesión.
      }
      return next;
    });
  }

  return { theme, isDark: theme === 'dark', toggleTheme };
}
