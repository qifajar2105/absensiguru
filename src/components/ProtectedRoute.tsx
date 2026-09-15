import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';

export const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) => {
  const { user, userData, loading } = useStore();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-500">Memuat...</p></div>;
  }

  if (!user || !userData) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(userData.role)) {
    // Redirect to their respective dashboard if they don't have access
    if (userData.role === 'superadmin') {
      return <Navigate to="/superadmin" replace />;
    }
    return <Navigate to={userData.role === 'admin' ? '/admin' : '/teacher'} replace />;
  }

  return <>{children}</>;
};
