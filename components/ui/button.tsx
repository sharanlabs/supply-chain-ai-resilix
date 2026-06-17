import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

// Restyled to the calm-command-center tokens. API unchanged (variant/size/
// asChild) so every caller and test stays valid. The :active translate gives a
// small tactile push without any continuous motion — calm, not cinematic.
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
        "inline-flex items-center justify-center gap-2 rounded-md border font-medium transition-colors duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        variant === "primary" &&
          "border-accent-strong bg-accent text-accent-ink hover:bg-accent-strong",
        variant === "secondary" &&
          "border-line-strong bg-surface text-ink hover:bg-sink",
        variant === "ghost" &&
          "border-transparent bg-transparent text-ink-muted hover:bg-sink hover:text-ink",
        variant === "danger" &&
          "border-danger bg-danger text-accent-ink hover:opacity-90",
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}
