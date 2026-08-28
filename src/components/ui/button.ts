export type ButtonSize = "default" | "large" | "icon";
export type ButtonVariant = "icon" | "outline" | "primary";

const base =
  "inline-flex cursor-pointer items-center justify-center rounded-md text-sm font-medium shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50";

const sizes: Record<ButtonSize, string> = {
  default: "min-h-11 px-4",
  large: "min-h-11 px-4 py-2.5",
  icon: "size-11",
};

const variants: Record<ButtonVariant, string> = {
  icon: "border border-[var(--border)] bg-[var(--card)] enabled:hover:bg-[var(--card-raised)]",
  outline:
    "border border-[var(--border)] bg-[var(--control-bg)] enabled:hover:border-[var(--primary)] enabled:hover:bg-[var(--card-raised)] enabled:hover:text-[var(--primary)]",
  primary:
    "bg-[var(--primary)] font-semibold text-[var(--primary-text)] enabled:hover:bg-[var(--primary-hover)]",
};

export function buttonClasses(variant: ButtonVariant, size: ButtonSize) {
  return `${base} ${variants[variant]} ${sizes[size]}`;
}
