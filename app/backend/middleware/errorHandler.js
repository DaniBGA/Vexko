// src/middleware/errorHandler.js

// Nombre legible de los campos únicos más comunes, para que el 409 diga qué
// es lo que está repetido en vez de un genérico "valor único".
const UNIQUE_FIELD_LABELS = {
  name: 'ese nombre',
  phone: 'ese teléfono',
  email: 'ese email',
  barcode: 'ese código de barras',
  sku: 'ese ID de producto',
  code: 'ese código',
};

function describeUniqueTarget(target) {
  const fields = Array.isArray(target) ? target : [target];
  const field = fields.find((f) => UNIQUE_FIELD_LABELS[f]);
  return field ? UNIQUE_FIELD_LABELS[field] : 'ese valor';
}

export function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  if (err.code === 'P2002') {
    return res.status(409).json({ error: `Ya existe un registro con ${describeUniqueTarget(err.meta?.target)}` });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Registro no encontrado' });
  }
  // Clave foránea: antes caía en el 500 con el mensaje crudo de Prisma.
  if (err.code === 'P2003') {
    return res.status(409).json({ error: 'No se puede completar la operación porque hay registros asociados' });
  }
  // Conflicto de una transacción serializable (dos operaciones a la vez).
  if (err.code === 'P2034') {
    return res.status(409).json({ error: 'Otra operación modificó los mismos datos al mismo tiempo, probá de nuevo' });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

export function notFound(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
}
