// ecosystem.config.cjs
// PM2 no puede leer un ecosystem.config.js en formato ESM (export default)
// cuando el proyecto tiene "type": "module" en package.json — falla con
// "No script path - aborting". Por eso este archivo usa extensión .cjs y
// module.exports, que es lo que PM2 espera sin importar el "type" del
// proyecto.
module.exports = {
  apps: [
    {
      name: 'kiosco-api',
      script: 'index.js',
      // KVM2 tiene 2 vCPU: en modo fork (instances:1) solo se usa uno.
      // Cluster con 2 instancias reparte la carga entre ambos núcleos —
      // Node es de un solo hilo por proceso, así que sin esto la mitad de
      // la VPS queda ociosa sin importar cuántos kioscos usen la app.
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '350M',
      merge_logs: true,
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      time: true,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
  ],
};