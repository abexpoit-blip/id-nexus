import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "./hooks/useAuth";
import { ProtectedRoute } from "./components/ProtectedRoute";

// Eager — landing & auth routes (small, needed immediately)
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import Register from "./pages/Register.tsx";
import NotFound from "./pages/NotFound.tsx";

// Lazy — heavier authenticated routes; split into separate chunks
const AdminLogin = lazy(() => import("./pages/AdminLogin.tsx"));
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/auth" element={<Navigate to="/login" replace />} />
            <Route path="/admin-login" element={<AdminLogin />} />
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
                <ProtectedRoute>
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
                <ProtectedRoute>
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
                <ProtectedRoute>
                  <Admin />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/audit"
              element={
                <ProtectedRoute>
                  <AuditLog />
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
