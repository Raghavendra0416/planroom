import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * One aggregate figure linking to its filtered list.
 * @param props - Card props.
 * @param props.value - Big number.
 * @param props.label - What the number counts.
 * @param props.href - Filtered destination, such as `/plans?status=DRAFT`.
 * @param props.children - Optional extra content, such as a status stamp.
 * @returns A linked sheet card.
 */
export function MetricCard({ value, label, href, children }: { value: number; label: string; href: string; children?: ReactNode }) {
  return (
    <Link className="metric-card" href={href}>
      <span className="metric-value">{value}</span>
      <span className="metric-label">{label}</span>
      {children}
    </Link>
  );
}
