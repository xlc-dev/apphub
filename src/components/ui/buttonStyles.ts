export type ButtonSize = "default" | "large" | "icon";
export type ButtonVariant = "icon" | "outline" | "primary";

const base =
  "focus-ring inline-flex cursor-pointer items-center justify-center rounded-md text-sm font-medium shadow-sm disabled:pointer-events-none disabled:opacity-50";

const sizes: Record<ButtonSize, string> = {
  default: "min-h-11 px-4",
  large: "min-h-11 px-4 py-2.5",
  icon: "size-11",
};

const variants: Record<ButtonVariant, string> = {
  icon: "card-surface hover:bg-[var(--card-raised)]",
  outline:
    "border border-[var(--border)] bg-[var(--control-bg)] hover:border-[var(--primary)] hover:bg-[var(--card-raised)] hover:text-[var(--primary)]",
  primary:
    "bg-[var(--primary)] font-semibold text-[var(--primary-text)] hover:bg-[var(--primary-hover)]",
};

export function buttonClasses(variant: ButtonVariant, size: ButtonSize) {
  return `${base} ${variants[variant]} ${sizes[size]}`;
}
