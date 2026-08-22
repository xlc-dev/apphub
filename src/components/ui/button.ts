export type ButtonSize = "default" | "large" | "icon";
export type ButtonVariant = "icon" | "outline" | "primary";

const base =
  "inline-flex cursor-pointer items-center justify-center rounded-md text-sm font-medium shadow-sm focus-visible:ring-[3px] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

const sizes: Record<ButtonSize, string> = {
  default: "min-h-9 px-4",
  large: "min-h-11 px-4 py-2.5",
  icon: "size-9",
};

const variants: Record<ButtonVariant, string> = {
  icon: "border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--card-raised)] focus-visible:border-[var(--primary)] focus-visible:ring-[color-mix(in_srgb,var(--primary)_20%,transparent)]",
  outline:
    "border border-[var(--border)] bg-[var(--control-bg)] hover:border-[var(--primary)] hover:bg-[var(--card-raised)] hover:text-[var(--primary)] focus-visible:border-[var(--primary)] focus-visible:ring-[color-mix(in_srgb,var(--primary)_20%,transparent)]",
  primary:
    "bg-[var(--primary)] font-semibold text-[var(--primary-text)] hover:bg-[var(--primary-hover)] focus-visible:ring-[color-mix(in_srgb,var(--primary)_25%,transparent)]",
};

export function buttonClasses(variant: ButtonVariant, size: ButtonSize) {
  return `${base} ${variants[variant]} ${sizes[size]}`;
}
