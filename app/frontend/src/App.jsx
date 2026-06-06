// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './store/authStore.js';
import AppLayout from './components/layout/AppLayout.jsx';
import LoginPage from './components/screens/LoginPage.jsx';
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

const PLAN_LEVELS = { BASE: 0, INTERMEDIO: 1, PREMIUM: 2 };

function PlanRoute({ minPlan = 0, children }) {
  const user = useAuthStore((s) => s.user);
  const plan = String(user?.kiosk?.customer?.plan || 'BASE').toUpperCase();
  const level = PLAN_LEVELS[plan] ?? 0;
  return level >= minPlan ? children : <Navigate to="/venta" replace />;
}

function AdminPrivateRoute({ children }) {
  const token = useAdminAuthStore((s) => s.token);
  return token ? children : <Navigate to="/admin/login" replace />;
}

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token);
  return token ? children : <Navigate to="/login" replace />;
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
          <Route path="historial"            element={<HistoryPage />} />
          <Route path="stock"                element={<StockPage />} />
          <Route path="catalogo"            element={<CatalogPage />} />
          <Route path="stock/nuevo"          element={<ProductFormPage />} />
          <Route path="stock/producto/:id"   element={<ProductFormPage />} />
          <Route path="precios"              element={<PricesPage />} />
          <Route path="caja-flujo"           element={<PlanRoute minPlan={1}><CashFlowPage /></PlanRoute>} />
          <Route path="proveedores"          element={<SuppliersPage />} />
          <Route path="proveedores/:id"      element={<SupplierDetailPage />} />
          <Route path="afip"                 element={<AfipPage />} />
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
