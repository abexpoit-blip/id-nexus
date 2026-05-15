import { Link } from "react-router-dom";
import { ShieldAlert, ArrowLeft, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Props {
  title?: string;
  message?: string;
  showAdminLogin?: boolean;
}

export const Forbidden403 = ({
  title = "403 — Forbidden",
  message = "Server denied admin access for this account.",
  showAdminLogin = true,
}: Props) => {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background px-4 py-10"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at top, hsl(0 84% 60% / 0.18), transparent 55%), radial-gradient(ellipse at bottom, hsl(265 84% 62% / 0.10), transparent 55%)",
      }}
    >
      <Card className="w-full max-w-md border-destructive/40 bg-gradient-card p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="font-display text-2xl font-bold text-destructive">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex flex-col gap-2">
          {showAdminLogin && (
            <Link to="/admin-login">
              <Button className="w-full bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90">
                <LogIn className="mr-2 h-4 w-4" /> Sign in as admin
              </Button>
            </Link>
          )}
          <Link to="/">
            <Button variant="outline" className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to home
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
};

export default Forbidden403;