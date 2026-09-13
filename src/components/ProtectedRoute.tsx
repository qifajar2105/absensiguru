import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { translations } from '../lib/translations';
import { checkIsSuperAdmin, isMasterSuperAdmin } from '../lib/superAdminAuth';
import toast from 'react-hot-toast';

export const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) => {
  const { user, userData, loading, language } = useStore();
  const location = useLocation();
  const t = translations[language] || translations.id;

  const isSuperAdminOnlyRoute = Boolean(
    location.pathname.startsWith('/superadmin') ||
    (allowedRoles && allowedRoles.length === 1 && allowedRoles[0] === 'superadmin')
  );

  const [verifyingSuperAdmin, setVerifyingSuperAdmin] = useState(false);
  const [isSuperAdminAllowed, setIsSuperAdminAllowed] = useState<boolean | null>(() => {
    if (!userData) return null;
    if (isMasterSuperAdmin(userData.email)) return true;
    if (userData.role === 'superadmin') return true;
    return null;
  });

  const rolesKey = allowedRoles ? allowedRoles.join(',') : '';

  useEffect(() => {
    let isMounted = true;
    if (user && userData) {
      if (isMasterSuperAdmin(userData.email)) {
        setIsSuperAdminAllowed(true);
      } else if (userData.role === 'superadmin' || isSuperAdminOnlyRoute) {
        setVerifyingSuperAdmin(true);
        checkIsSuperAdmin(userData.email).then((allowed) => {
          if (isMounted) {
            setIsSuperAdminAllowed(allowed);
            setVerifyingSuperAdmin(false);
          }
        });
      } else {
        setIsSuperAdminAllowed(false);
      }
    }
    return () => {
      isMounted = false;
    };
  }, [user?.uid, userData?.email, userData?.role, isSuperAdminOnlyRoute, rolesKey]);

  // Show toast asynchronously via effect when access to /superadmin is denied
  useEffect(() => {
    if (isSuperAdminOnlyRoute && isSuperAdminAllowed === false && !isMasterSuperAdmin(userData?.email)) {
      toast.error(
        language === 'id'
          ? 'Akses ditolak. Portal Super Admin hanya untuk Pemilik Sistem atau akun yang diizinkan.'
          : 'Access denied. Super Admin portal is restricted to the System Owner or authorized personnel.'
      );
    }
  }, [isSuperAdminOnlyRoute, isSuperAdminAllowed, userData?.email, language]);

  if (loading || (isSuperAdminOnlyRoute && isSuperAdminAllowed === null) || verifyingSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <p className="text-gray-500 dark:text-gray-400 font-medium animate-pulse">{t.loading}</p>
      </div>
    );
  }

  if (!user || !userData) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isSuperAdminUser = Boolean(
    isMasterSuperAdmin(userData.email) ||
    isSuperAdminAllowed === true ||
    userData.role === 'superadmin'
  );

  // If user is accessing a Super Admin only route
  if (isSuperAdminOnlyRoute) {
    if (!isSuperAdminUser) {
      const target = userData.role === 'admin' ? '/admin' : '/teacher';
      return <Navigate to={target} replace />;
    }
    return <>{children}</>;
  }

  // Super admin has access to all other routes (admin, teacher)
  if (isSuperAdminUser) {
    return <>{children}</>;
  }

  // Standard role check for normal users (admin, teacher)
  if (allowedRoles && !allowedRoles.includes(userData.role)) {
    const target = userData.role === 'admin' ? '/admin' : '/teacher';
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
};
