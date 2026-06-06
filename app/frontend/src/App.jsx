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
import AfipPage from './components/screens/AfipPage.jsx';
import ReportsPage from './components/screens/ReportsPage.jsx';
import CashRegisterPage from './components/screens/CashRegisterPage.jsx';
import ClientsPage from './components/screens/ClientsPage.jsx';
import ClientDetailPage from './components/screens/ClientDetailPage.jsx';

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { token, fetchMe } = useAuthStore();

  useEffect(() => {
    if (token) fetchMe();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
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
          <Route path="stock/nuevo"          element={<ProductFormPage />} />
          <Route path="stock/producto/:id"   element={<ProductFormPage />} />
          <Route path="precios"              element={<PricesPage />} />
          <Route path="caja-flujo"           element={<CashFlowPage />} />
          <Route path="proveedores"          element={<SuppliersPage />} />
          <Route path="proveedores/:id"      element={<SupplierDetailPage />} />
          <Route path="afip"                 element={<AfipPage />} />
          <Route path="resultados"           element={<ReportsPage />} />
          <Route path="caja"                 element={<CashRegisterPage />} />
          <Route path="clientes"             element={<ClientsPage />} />
          <Route path="clientes/:id"         element={<ClientDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
