// src/components/screens/LoginPage.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore.js';
import { Store, Loader2 } from 'lucide-react';
import Logo from '../ui/Logo.jsx';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@kiosco.com');
  const [password, setPassword] = useState('kiosco123');
  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);
  const loginError = useAuthStore((state) => state.loginError);
  const navigate = useNavigate();

  function handleEmailChange(e) {
    setEmail(e.target.value);
    if (loginError) {
      useAuthStore.setState({ loginError: '' });
    }
  }

  function handlePasswordChange(e) {
    setPassword(e.target.value);
    if (loginError) {
      useAuthStore.setState({ loginError: '' });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const ok = await login(email, password);
    if (ok) navigate('/venta');
  }

  return (
    <div className="min-h-screen bg-brand-sidebar flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Logo className="h-10 mx-auto mb-4" />
          <p className="text-slate-400 text-sm mt-1">Sistema de gestión</p>
        </div>

        <form onSubmit={handleSubmit} className="page-card">
          <div className="space-y-4">
            <div className="field-group">
              <label className="field-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={handleEmailChange}
                className="field-input"
                required
                autoFocus
              />
            </div>
            <div className="field-group">
              <label className="field-label">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={handlePasswordChange}
                className="field-input"
                required
              />
            </div>

            {loginError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {loginError}
              </div>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full mt-6 py-3 flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : null}
            {isLoading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
