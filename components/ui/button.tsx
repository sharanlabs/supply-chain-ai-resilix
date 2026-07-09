import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

// Styled on the "Apple premium-white / Forest" register tokens. API unchanged (variant/size/
// asChild) so every caller and test stays valid. Backgrounds are SOLID (not
// gradients) so axe composites them to a single color and the AA scan stays
// clean; depth comes from a tinted shadow + an inset top highlight, and the
// :active translate gives a small tactile push -- calm, not cinematic, no loop.
export function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  asChild = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-[background-color,box-shadow,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        // Primary -- the Forest accent with elevation + a top highlight; the
        // accent-ink label clears AA on both the resting and hover fills.
        variant === "primary" &&
          "border-accent-strong bg-accent text-accent-ink shadow-[var(--shadow-e2),inset_0_1px_0_oklch(1_0_0/0.18)] hover:bg-accent-strong hover:shadow-[var(--shadow-e3),inset_0_1px_0_oklch(1_0_0/0.18)]",
        variant === "secondary" &&
          "border-line-strong bg-surface text-ink shadow-[var(--shadow-e1)] hover:bg-sink hover:shadow-[var(--shadow-e2)]",
        variant === "ghost" &&
          "border-transparent bg-transparent text-ink-muted hover:bg-sink hover:text-ink",
        variant === "danger" &&
          "border-danger bg-danger text-accent-ink shadow-[var(--shadow-e2),inset_0_1px_0_oklch(1_0_0/0.14)] hover:opacity-90",
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}
