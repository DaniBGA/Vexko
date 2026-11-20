import React from 'react';
import logo from '../../../images/logo vexko2.png';
import logoClaro from '../../../images/logo-vexko-claro.png';

// `onDark`: versión con el texto en blanco, para fondos oscuros (sidebar, logins,
// topbar en modo oscuro). La normal tiene "Vexko" casi negro.
export default function Logo({ alt = 'Vexko', className = 'h-8', onDark = false }) {
  return <img src={onDark ? logoClaro : logo} alt={alt} className={className} />;
}
