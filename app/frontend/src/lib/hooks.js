// src/lib/hooks.js
import { useEffect, useState } from 'react';

// Devuelve `value` recién después de que pasen `delayMs` sin que cambie —
// para no disparar una consulta al servidor por cada tecla escrita en un
// buscador.
export function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
