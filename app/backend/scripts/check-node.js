// scripts/check-node.js
// Corta con error si el Node que corre no tiene los parches de seguridad.
// Lo usa deploy.sh antes de tocar nada (y se puede correr a mano: npm run check:node).
//
// Mínimos por línea según el security release del 21-oct-2026 (10 CVE, 4 High,
// entre ellos un out-of-bounds write en el decoder Brotli con posible RCE):
// https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
// Node 20 y anteriores están fuera de soporte y no reciben parches.
// Actualizar esta tabla con cada security release de Node.
const PATCHED_MINIMUM = {
  22: [23, 4], // 22.23.4 (Maintenance LTS)
  24: [22, 1], // 24.22.1 (Active LTS, la que usa producción)
  26: [12, 1], // 26.12.1
};
const NEWEST_KNOWN_LINE = 26;

const [major, minor, patch] = process.versions.node.split('.').map(Number);
const minimum = PATCHED_MINIMUM[major];

let ok;
if (minimum) {
  ok = minor > minimum[0] || (minor === minimum[0] && patch >= minimum[1]);
} else {
  // Líneas impares (no LTS, soporte corto) o viejas: no. Una línea par más
  // nueva que la tabla (p. ej. 28) se acepta.
  ok = major > NEWEST_KNOWN_LINE && major % 2 === 0;
}

if (!ok) {
  const supported = Object.entries(PATCHED_MINIMUM)
    .map(([line, [m, p]]) => `${line}.${m}.${p}`)
    .join(', ');
  console.error(`✗ Node v${process.versions.node} no tiene los parches de seguridad. Usá ${supported} o una versión posterior de esa misma línea (recomendado: Node 24 LTS).`);
  process.exit(1);
}
console.log(`✓ Node v${process.versions.node} con parches de seguridad`);
