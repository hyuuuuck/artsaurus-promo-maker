import Link from "next/link";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "ui-button focus-ring inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap border px-4 text-sm font-black transition-colors",
  {
    variants: {
      variant: {
        primary: "border-[var(--text)] bg-[var(--text)] text-white hover:border-[var(--gold-2)] hover:bg-[var(--gold-2)]",
        secondary: "border-[var(--text)] bg-white text-[var(--text)] hover:bg-[var(--text)] hover:text-white",
        ghost: "border-transparent bg-transparent text-[var(--text)] hover:border-[var(--text)]",
        danger: "border-[var(--danger)] bg-white text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white",
        teal: "border border-[var(--teal)] bg-[var(--teal)] text-white hover:bg-[#228b4e]",
      },
      size: {
        sm: "min-h-9 px-3 text-xs",
        md: "min-h-10 px-4 text-sm",
        lg: "min-h-12 px-5 text-base",
        icon: "h-10 w-10 px-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

const solidVariants = new Set<ButtonVariant>(["primary", "teal"]);

function solidTextStyle(variant: VariantProps<typeof buttonVariants>["variant"], style?: React.CSSProperties) {
  const resolvedVariant = variant ?? "primary";
  return resolvedVariant === "primary" || resolvedVariant === "teal" ? { ...style, color: "#fff" } : style;
}

export function Button({ className, variant, size, asChild, style, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), solidVariants.has(variant ?? "primary") && "[&_svg]:text-white", className)}
      style={solidTextStyle(variant, style)}
      {...props}
    />
  );
}

type ButtonLinkProps = React.ComponentProps<typeof Link> &
  VariantProps<typeof buttonVariants> & {
    className?: string;
  };

export function ButtonLink({ className, variant, size, style, ...props }: ButtonLinkProps) {
  return (
    <Link
      className={cn(buttonVariants({ variant, size }), solidVariants.has(variant ?? "primary") && "[&_svg]:text-white", className)}
      style={solidTextStyle(variant, style)}
      {...props}
    />
  );
}
