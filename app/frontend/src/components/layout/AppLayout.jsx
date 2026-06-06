import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore.js';
import { DollarSign, ClipboardList, Box, Tag, CreditCard, FileText, PieChart, Users, Home } from 'lucide-react';
import Logo from '../ui/Logo.jsx';

export default function AppLayout() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const location = useLocation();

  const isActive = (path) => {
    return location.pathname === path;
  };

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-name"><Logo className="h-9" /></div>
          <div className="logo-sub">Sistema de gestión</div>
        </div>

        <div className="sidebar-kiosk">
          <div className="kiosk-avatar">K</div>
          <div className="kiosk-info">
            <div className="kiosk-name-s">Kiosco Demo</div>
            <div className="kiosk-plan">Plan Base · 1 sucursal</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Principal</div>
          <Link to="/venta" className={`nav-link ${isActive('/venta') ? 'active' : ''}`}><span className="icon"><DollarSign size={16} /></span>Registrar venta</Link>
          <Link to="/historial" className={`nav-link ${isActive('/historial') ? 'active' : ''}`}><span className="icon"><ClipboardList size={16} /></span>Historial de ventas</Link>

          <div className="nav-section-label">Inventario</div>
          <Link to="/stock" className={`nav-link ${isActive('/stock') ? 'active' : ''}`}><span className="icon"><Box size={16} /></span>Stock<span className="badge">2</span></Link>
          <Link to="/precios" className={`nav-link ${isActive('/precios') ? 'active' : ''}`}><span className="icon"><Tag size={16} /></span>Actualizar precios</Link>

          <div className="nav-section-label">Finanzas</div>
          <Link to="/caja-flujo" className={`nav-link ${isActive('/caja-flujo') ? 'active' : ''}`}><span className="icon"><CreditCard size={16} /></span>Gastos</Link>
          <Link to="/afip" className={`nav-link ${isActive('/afip') ? 'active' : ''}`}><span className="icon"><FileText size={16} /></span>Facturación</Link>
          <Link to="/resultados" className={`nav-link ${isActive('/resultados') ? 'active' : ''}`}><span className="icon"><PieChart size={16} /></span>Resultados del mes</Link>

          <div className="nav-section-label">Gestión</div>
          <Link to="/proveedores" className={`nav-link ${isActive('/proveedores') ? 'active' : ''}`}><span className="icon"><Users size={16} /></span>Proveedores</Link>
          <Link to="/caja" className={`nav-link ${isActive('/caja') ? 'active' : ''}`}><span className="icon"><Home size={16} /></span>Caja</Link>
          <Link to="/clientes" className={`nav-link ${isActive('/clientes') ? 'active' : ''}`}><span className="icon"><Users size={16} /></span>Clientes / Puntos</Link>
        </nav>

        <div style={{padding:16}}>
          <button onClick={handleLogout} className="btn-outline" style={{width:'100%'}}>Cerrar sesión</button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div style={{display:'flex',alignItems:'center',gap:8}}><Logo className="h-6" /></div>
          <div className="topbar-actions">
            <div style={{fontSize:'.85rem',color:'#888'}}>Viernes 16 de mayo, 2026</div>
            <button className="btn-primary" onClick={() => navigate('/venta')}>Registrar venta</button>
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
