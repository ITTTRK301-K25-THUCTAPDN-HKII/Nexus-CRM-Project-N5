import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth';
import { AdminUsers } from './pages/AdminUsers';
import { ForgotPassword } from './pages/ForgotPassword';
import { Login } from './pages/Login';
import { ResetPassword } from './pages/ResetPassword';
import { Workspace } from './pages/Workspace';
import { Customers } from './pages/Customers';
import { CustomerDetail } from './pages/CustomerDetail';

function LoadingPage() {
  return <div className="loading-screen">Đang tải phiên đăng nhập...</div>;
}

function RequireAuth({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingPage />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'Admin') return <Navigate to="/workspace" replace />;
  return children;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingPage />;
  return <Navigate to={user?.role === 'Admin' ? '/admin/users' : user ? '/workspace' : '/login'} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/admin/users" element={<RequireAuth adminOnly><AdminUsers /></RequireAuth>} />
      <Route path="/customers" element={<RequireAuth><Customers /></RequireAuth>} />
      <Route path="/customers/accounts/:id" element={<RequireAuth><CustomerDetail /></RequireAuth>} />
      <Route path="/workspace" element={<RequireAuth><Workspace /></RequireAuth>} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
