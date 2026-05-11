import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { AppRole } from "@/lib/api";
import { toast } from "sonner";
import { useEffect, useRef } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Restrict route to users that have one of these roles. Admins always pass. */
  requiredRole?: AppRole | AppRole[];
  /** Where to send users that don't have the required role (default: /dashboard). */
  fallback?: string;
}

export const ProtectedRoute = ({ children, requiredRole, fallback = "/dashboard" }: ProtectedRouteProps) => {
  const { user, roles, loading } = useAuth();
  const location = useLocation();
  const toldRef = useRef(false);

  const allowedRoles = requiredRole
    ? Array.isArray(requiredRole)
      ? requiredRole
      : [requiredRole]
    : null;

  const hasAccess =
    !allowedRoles || roles.includes("admin") || allowedRoles.some((r) => roles.includes(r));

  useEffect(() => {
    if (!loading && user && !hasAccess && !toldRef.current) {
      toldRef.current = true;
      const role = allowedRoles?.[0];
      toast.error(
        role === "seller"
          ? "Seller access required. Apply to become a seller first."
          : "You don't have access to this area."
      );
    }
  }, [loading, user, hasAccess, allowedRoles]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!hasAccess) {
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
};