import React from 'react';

export function fmt(v) {
  if (v == null) return '—';
  return Number(v).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="p-6 border-b bg-white flex items-center justify-between">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-700">{title}</h1>
        {subtitle && <span className="text-sm text-gray-500">{subtitle}</span>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function Spinner() {
  return <div className="p-6 text-center text-sm text-gray-500">Cargando...</div>;
}

export function Badge({ children, variant }) {
  const cls = variant === 'low' ? 'bg-red-100 text-red-700' : variant === 'alert' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700';
  return <span className={`px-2 py-1 rounded text-xs ${cls}`}>{children}</span>;
}

export function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="text-center p-8 text-gray-400">
      {Icon && <Icon size={36} className="mx-auto mb-3" />}
      <div className="font-700 mb-1">{title}</div>
      <div className="text-sm">{description}</div>
    </div>
  );
}

export function Input(props) {
  return <input className="field-input" {...props} />;
}

export default {
  fmt,
  PageHeader,
  Spinner,
  Badge,
  EmptyState,
  Input,
};
