import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Shield } from 'lucide-react';
import Logo from '../ui/Logo.jsx';
import { useAdminAuthStore } from '../../store/adminAuthStore.js';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading } = useAdminAuthStore();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    const ok = await login(email, password);
    if (ok) navigate('/admin');
  }

  return (
    <div className="min-h-screen bg-brand-sidebar flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Logo className="h-10 mx-auto mb-4" />
          <div className="inline-flex items-center gap-2 text-slate-300 text-sm justify-center">
            <Shield size={14} /> Acceso de administración
          </div>
        </div>

        <form onSubmit={handleSubmit} className="page-card">
          <div className="space-y-4">
            <div className="field-group">
              <label className="field-label">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field-input" placeholder="admin@ejemplo.com" required autoFocus />
            </div>
            <div className="field-group">
              <label className="field-label">Contraseña</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="field-input" placeholder="Ingresa tu contraseña" required />
            </div>
          </div>

          <button type="submit" disabled={isLoading} className="btn-primary w-full mt-6 py-3 flex items-center justify-center gap-2">
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : null}
            {isLoading ? 'Ingresando...' : 'Ingresar al admin'}
          </button>
        </form>
      </div>
    </div>
  );
}