import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./hooks/useAuth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { RouteFallback } from "./components/RouteFallback";

// Eager — landing & auth routes (small, needed immediately)
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import Register from "./pages/Register.tsx";
import NotFound from "./pages/NotFound.tsx";

// Lazy — heavier authenticated routes; split into separate chunks
const AdminLogin = lazy(() => import("./pages/AdminLogin.tsx"));
const SellerLogin = lazy(() => import("./pages/SellerLogin.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Browse = lazy(() => import("./pages/Browse.tsx"));
const OrderDetail = lazy(() => import("./pages/OrderDetail.tsx"));
const SellerDashboard = lazy(() => import("./pages/SellerDashboard.tsx"));
const SellerApply = lazy(() => import("./pages/SellerApply.tsx"));
const SellerOnboarding = lazy(() => import("./pages/SellerOnboarding.tsx"));
const ClaimAdmin = lazy(() => import("./pages/ClaimAdmin.tsx"));
const Replacements = lazy(() => import("./pages/Replacements.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const Wallet = lazy(() => import("./pages/Wallet.tsx"));
const AuditLog = lazy(() => import("./pages/AuditLog.tsx"));
const Vpn = lazy(() => import("./pages/Vpn.tsx"));
const VpnOrderDetail = lazy(() => import("./pages/VpnOrderDetail.tsx"));

// Auto-recover from stale chunk errors after a deploy.
// If a dynamic import fails (chunk 404 / network), reload once.
const CHUNK_RELOAD_KEY = "__chunkReloadAt";
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    const msg = String(e?.message || "");
    if (/Loading chunk|Failed to fetch dynamically imported module|ChunkLoadError/i.test(msg)) {
      const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
      if (Date.now() - last > 30_000) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
        window.location.reload();
      }
    }
  });
  window.addEventListener("unhandledrejection", (e) => {
    const msg = String((e?.reason as any)?.message || e?.reason || "");
    if (/Loading chunk|Failed to fetch dynamically imported module|ChunkLoadError/i.test(msg)) {
      const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
      if (Date.now() - last > 30_000) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
        window.location.reload();
      }
    }
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      retry: 0,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/auth" element={<Navigate to="/login" replace />} />
            <Route path="/admin-login" element={<AdminLogin />} />
            <Route path="/seller-login" element={<SellerLogin />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/browse"
              element={
                <ProtectedRoute>
                  <Browse />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vpn"
              element={
                <ProtectedRoute>
                  <Vpn />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vpn-orders/:id"
              element={
                <ProtectedRoute>
                  <VpnOrderDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders/:id"
              element={
                <ProtectedRoute>
                  <OrderDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/seller"
              element={
                <ProtectedRoute requiredRole="seller">
                  <SellerDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/apply-seller"
              element={
                <ProtectedRoute>
                  <SellerApply />
                </ProtectedRoute>
              }
            />
            <Route
              path="/seller/onboarding"
              element={
                <ProtectedRoute requiredRole="seller">
                  <SellerOnboarding />
                </ProtectedRoute>
              }
            />
            <Route path="/claim-admin" element={<ClaimAdmin />} />
            <Route
              path="/replacements"
              element={
                <ProtectedRoute>
                  <Replacements />
                </ProtectedRoute>
              }
            />
            <Route
              path="/wallet"
              element={
                <ProtectedRoute>
                  <Wallet />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Admin />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/audit"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AuditLog />
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
