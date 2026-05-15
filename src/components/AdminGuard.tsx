import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { authApi, ApiError } from "@/lib/api";
import { Forbidden403 } from "./Forbidden403";

/**
 * Server-validated admin gate.
 * Hits /api/auth/me on every mount — if the server does not return the
 * "admin" role, renders a hard 403 screen (no silent redirect).
 */
export const AdminGuard = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const [state, setState] = useState<"loading" | "ok" | "forbidden" | "unauth">("loading");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await authApi.me();
        if (!alive) return;
        if (me.roles?.includes("admin")) setState("ok");
        else setState("forbidden");
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) setState("unauth");
        else setState("forbidden");
      }
    })();
    return () => {
      alive = false;
    };
  }, [location.pathname]);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (state === "unauth") {
    return <Navigate to="/admin-login" state={{ from: location.pathname }} replace />;
  }
  if (state === "forbidden") {
    return (
      <Forbidden403
        title="403 — Admin only"
        message="Server rejected this request. Your account does not have admin role."
      />
    );
  }
  return <>{children}</>;
};

export default AdminGuard;