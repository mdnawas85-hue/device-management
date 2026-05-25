import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar }   from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Devices }   from './pages/Devices';
import { Groups }    from './pages/Groups';
import { LoginPage } from './pages/LoginPage';
import './index.css';

const AppShell: React.FC = () => {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!session) return <LoginPage />;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900">
      <Sidebar />
      <main className="flex-1 overflow-y-auto h-full">
        <Routes>
          <Route path="/"        element={<Dashboard />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/groups"  element={<Groups />} />
          <Route path="*"        element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
