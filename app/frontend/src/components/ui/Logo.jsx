import React from 'react';
import logo from '../../../images/logo.png';

export default function Logo({ alt = 'Kiosco', className = 'h-8' }) {
  return <img src={logo} alt={alt} className={className} />;
}
