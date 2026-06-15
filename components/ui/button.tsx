import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

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
        "inline-flex items-center justify-center gap-2 rounded-md border font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        variant === "primary" &&
          "border-teal-700 bg-teal-700 text-white hover:bg-teal-800",
        variant === "secondary" &&
          "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50",
        variant === "ghost" &&
          "border-transparent bg-transparent text-zinc-700 hover:bg-zinc-100",
        variant === "danger" &&
          "border-red-700 bg-red-700 text-white hover:bg-red-800",
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}
