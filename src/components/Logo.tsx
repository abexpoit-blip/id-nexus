import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showTagline?: boolean;
  size?: "sm" | "md" | "lg";
}

export const Logo = ({ className, showTagline = true, size = "md" }: LogoProps) => {
  const sizes = {
    sm: { title: "text-base", tag: "text-[9px]" },
    md: { title: "text-lg", tag: "text-[10px]" },
    lg: { title: "text-3xl md:text-4xl", tag: "text-xs" },
  };
  return (
    <div className={cn("leading-tight", className)}>
      <div
        className={cn(
          "font-display font-bold tracking-tight bg-gradient-brand bg-clip-text text-transparent",
          sizes[size].title
        )}
      >
        Nexus X
      </div>
      {showTagline && (
        <div className={cn("uppercase tracking-[0.18em] text-muted-foreground", sizes[size].tag)}>
          Basictrick MarketPlace
        </div>
      )}
    </div>
  );
};