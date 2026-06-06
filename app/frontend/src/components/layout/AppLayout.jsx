import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore.js';
import { DollarSign, ClipboardList, Box, Tag, CreditCard, FileText, PieChart, Users, Home } from 'lucide-react';
import Logo from '../ui/Logo.jsx';

const PLAN_LEVELS = { BASE: 0, INTERMEDIO: 1, PREMIUM: 2 };

export default function AppLayout() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const currentDateLabel = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const isActive = (path) => {
    return location.pathname === path;
  };

  const kioskName = user?.kiosk?.name || user?.kiosk?.customer?.name || user?.kioskName || 'Mi kiosco';
  const kioskPlan = user?.kiosk?.customer?.plan || user?.planName || 'BASE';
  const kioskInitial = (kioskName || 'K').charAt(0).toUpperCase();
  const planLevel = PLAN_LEVELS[String(kioskPlan).toUpperCase()] ?? 0;
  const canSeeBilling = planLevel >= 1;
  const canSeeMonthly = planLevel >= 1;
  const canSeeClients = planLevel >= 2;

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
          <div className="kiosk-avatar">{kioskInitial}</div>
          <div className="kiosk-info">
            <div className="kiosk-name-s">{kioskName}</div>
            <div className="kiosk-plan">Plan {String(kioskPlan).toLowerCase()}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Principal</div>
          <Link to="/venta" className={`nav-link ${isActive('/venta') ? 'active' : ''}`}><span className="icon"><DollarSign size={16} /></span>Registrar venta</Link>
          <Link to="/historial" className={`nav-link ${isActive('/historial') ? 'active' : ''}`}><span className="icon"><ClipboardList size={16} /></span>Historial de ventas</Link>

          <div className="nav-section-label">Inventario</div>
          <Link to="/stock" className={`nav-link ${isActive('/stock') ? 'active' : ''}`}><span className="icon"><Box size={16} /></span>Stock</Link>

          <div className="nav-section-label">Finanzas</div>
          <Link to="/caja-flujo" className={`nav-link ${isActive('/caja-flujo') ? 'active' : ''}`}><span className="icon"><CreditCard size={16} /></span>Gastos</Link>
          {canSeeBilling && <div className={`nav-link disabled`} title="En desarrollo" style={{opacity:0.7,display:'flex',alignItems:'center',gap:8,cursor:'default'}}><span className="icon"><FileText size={16} /></span>Facturación <span style={{color:'#999',fontSize:'.75rem',marginLeft:6}}>(En desarrollo)</span></div>}
          {canSeeMonthly && <Link to="/resultados" className={`nav-link ${isActive('/resultados') ? 'active' : ''}`}><span className="icon"><PieChart size={16} /></span>Resultados del mes</Link>}

          <div className="nav-section-label">Gestión</div>
          <Link to="/proveedores" className={`nav-link ${isActive('/proveedores') ? 'active' : ''}`}><span className="icon"><Users size={16} /></span>Proveedores</Link>
          <Link to="/caja" className={`nav-link ${isActive('/caja') ? 'active' : ''}`}><span className="icon"><Home size={16} /></span>Caja</Link>
          {canSeeClients && <Link to="/clientes" className={`nav-link ${isActive('/clientes') ? 'active' : ''}`}><span className="icon"><Users size={16} /></span>Clientes / puntos</Link>}
        </nav>

        <div className="sidebar-footer">
          <button onClick={handleLogout} className="btn-outline" style={{width:'100%'}}>Cerrar sesión</button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div style={{display:'flex',alignItems:'center',gap:8}}><Logo className="h-6" /></div>
          <div className="topbar-actions">
            <div style={{fontSize:'.85rem',color:'#888'}}>{currentDateLabel}</div>
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
