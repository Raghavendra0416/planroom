import Link from 'next/link';
import type { ReactNode } from 'react';

type ButtonProps = {
  variant?: 'primary' | 'quiet' | 'danger';
  href?: string;
  children: ReactNode;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
};

/**
 * Primary, quiet, or danger action with a 44px target and no hover motion.
 * @param props - Variant, optional destination, and button behavior.
 * @param props.variant - `primary` fills with library green. `quiet` is a sheet outline. `danger` is oxide red. Defaults to primary.
 * @param props.href - When set, renders a link instead of a button.
 * @param props.children - Visible label.
 * @param props.type - Button type when this is not a link.
 * @param props.disabled - Applies the paper disabled treatment.
 * @param props.onClick - Click handler for a button.
 * @returns A button, or a link when `href` is set.
 */
export function Button({
  variant = 'primary',
  href,
  children,
  type = 'button',
  disabled = false,
  onClick,
  ariaLabel,
}: ButtonProps) {
  const className = variant === 'quiet' ? 'btn btn-quiet' : variant === 'danger' ? 'btn btn-danger' : 'btn btn-primary';

  if (href) {
    return (
      <Link aria-label={ariaLabel} className={className} href={href}>
        {children}
      </Link>
    );
  }

  return (
    <button aria-label={ariaLabel} className={className} disabled={disabled} type={type} onClick={onClick}>
      {children}
    </button>
  );
}
