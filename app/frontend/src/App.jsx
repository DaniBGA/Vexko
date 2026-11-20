// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './store/authStore.js';
import AppLayout from './components/layout/AppLayout.jsx';
import LoginPage from './components/screens/LoginPage.jsx';
import LandingPage from './components/screens/LandingPage.jsx';
import SalePage from './components/screens/SalePage.jsx';
import HistoryPage from './components/screens/HistoryPage.jsx';
import StockPage from './components/screens/StockPage.jsx';
import ProductFormPage from './components/screens/ProductFormPage.jsx';
import PricesPage from './components/screens/PricesPage.jsx';
import CashFlowPage from './components/screens/CashFlowPage.jsx';
import SuppliersPage from './components/screens/SuppliersPage.jsx';
import SupplierDetailPage from './components/screens/SupplierDetailPage.jsx';
import CatalogPage from './components/screens/CatalogPage.jsx';
import AfipPage from './components/screens/AfipPage.jsx';
import ReportsPage from './components/screens/ReportsPage.jsx';
import CashRegisterPage from './components/screens/CashRegisterPage.jsx';
import ClientsPage from './components/screens/ClientsPage.jsx';
import ClientDetailPage from './components/screens/ClientDetailPage.jsx';
import AdminPage from './components/screens/AdminPage.jsx';
import AdminLoginPage from './components/screens/AdminLoginPage.jsx';
import { useAdminAuthStore } from './store/adminAuthStore.js';
import { SubscriptionBlockedPage } from './components/subscription/SubscriptionNotices.jsx';
import { SUBSCRIPTION_BLOCKED_EVENT } from './lib/api.js';
import { Spinner } from './components/ui/index.jsx';

const PLAN_LEVELS = { BASE: 0, INTERMEDIO: 1, PREMIUM: 2 };

function PlanRoute({ minPlan = 0, children }) {
  const user = useAuthStore((s) => s.user);
  // Al recargar la página (F5) el usuario llega recién con /auth/me. Antes se lo
  // tomaba como BASE mientras tanto y una sucursal premium que recargaba en
  // Clientes o Historial terminaba en /venta. Si /me falla, la sesión se cierra
  // y PrivateRoute manda al login, así que esto no queda cargando para siempre.
  if (!user) return <Spinner />;
  const plan = String(user.kiosk?.customer?.plan || 'BASE').toUpperCase();
  const level = PLAN_LEVELS[plan] ?? 0;
  return level >= minPlan ? children : <Navigate to="/venta" replace />;
}

function AdminPrivateRoute({ children }) {
  const token = useAdminAuthStore((s) => s.token);
  return token ? children : <Navigate to="/admin/login" replace />;
}

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token);
  const subscription = useAuthStore((s) => s.user?.kiosk?.customer?.subscription);
  const location = useLocation();
  // Suscripción vencida: en lugar de la app se muestra la pantalla de bloqueo
  // (el backend igual rechaza todo con 402).
  if (token && subscription?.status === 'BLOCKED') return <SubscriptionBlockedPage subscription={subscription} />;
  if (token) return children;
  // Anonymous visitors landing on the bare root see the public landing page
  // instead of being bounced to /login; deep links still redirect to login.
  if (location.pathname === '/') return <LandingPage />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  const { token, fetchMe } = useAuthStore();
  const { token: adminToken, fetchMe: fetchAdminMe } = useAdminAuthStore();

  useEffect(() => {
    if (token) fetchMe();
  }, []);

  useEffect(() => {
    if (adminToken) fetchAdminMe();
  }, []);

  // Si la suscripción se vence con la app abierta, la próxima request recibe
  // un 402: se refresca /auth/me para pasar a la pantalla de bloqueo.
  useEffect(() => {
    const onBlocked = () => fetchMe();
    window.addEventListener(SUBSCRIPTION_BLOCKED_EVENT, onBlocked);
    return () => window.removeEventListener(SUBSCRIPTION_BLOCKED_EVENT, onBlocked);
  }, [fetchMe]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <AppLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/venta" replace />} />
          <Route path="venta"                element={<SalePage />} />
          <Route path="historial"            element={<PlanRoute minPlan={1}><HistoryPage /></PlanRoute>} />
          <Route path="stock"                element={<StockPage />} />
          <Route path="catalogo"            element={<CatalogPage />} />
          <Route path="stock/nuevo"          element={<ProductFormPage />} />
          <Route path="stock/producto/:id"   element={<ProductFormPage />} />
          <Route path="precios"              element={<PricesPage />} />
          <Route path="caja-flujo"           element={<PlanRoute minPlan={1}><CashFlowPage /></PlanRoute>} />
          <Route path="proveedores"          element={<PlanRoute minPlan={1}><SuppliersPage /></PlanRoute>} />
          <Route path="proveedores/:id"      element={<PlanRoute minPlan={1}><SupplierDetailPage /></PlanRoute>} />
          <Route path="afip"                 element={<PlanRoute minPlan={1}><AfipPage /></PlanRoute>} />
          <Route path="resultados"           element={<PlanRoute minPlan={1}><ReportsPage /></PlanRoute>} />
          <Route path="caja"                 element={<CashRegisterPage />} />
          <Route path="clientes"             element={<PlanRoute minPlan={2}><ClientsPage /></PlanRoute>} />
          <Route path="clientes/:id"         element={<PlanRoute minPlan={2}><ClientDetailPage /></PlanRoute>} />
        </Route>
        <Route
          path="/admin"
          element={
            <AdminPrivateRoute>
              <AdminPage />
            </AdminPrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
