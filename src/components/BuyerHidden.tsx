import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Hides buyer-facing routes while we focus on seller recruitment.
 * - Sellers/admins → render normally
 * - Everyone else → forced to the seller application
 */
export const BuyerHidden = ({ children }: { children: React.ReactNode }) => {
  const { roles, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (roles.includes("admin")) return <>{children}</>;
  if (roles.includes("seller")) return <Navigate to="/seller" replace />;
  return <Navigate to="/apply-seller" replace />;
};