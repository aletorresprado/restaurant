import { Star } from 'lucide-react';
import { LoyaltyTier } from '@repo/shared-types';

const tiers: Record<LoyaltyTier, { label: string; fill: string; stroke: string }> = {
  WHITE: { label: 'White', fill: '#ffffff', stroke: '#6b7280' },
  BRONZE: { label: 'Bronze', fill: '#b87333', stroke: '#7d431b' },
  SILVER: { label: 'Silver', fill: '#c0c0c0', stroke: '#707781' },
  GOLD: { label: 'Gold', fill: '#e3b341', stroke: '#986b00' },
  PLATINUM: { label: 'Platinum', fill: '#d7e4ec', stroke: '#526c7a' },
};

export function LoyaltyTierBadge({ tier }: { tier: string }) {
  const appearance = Object.hasOwn(tiers, tier) ? tiers[tier as LoyaltyTier] : null;
  if (!appearance) return <span>Nivel no disponible</span>;
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-secondary/60 px-2.5 py-1 align-middle text-sm font-semibold"
      aria-label={`Nivel ${appearance.label}`}
    >
      <Star
        className="size-4 shrink-0"
        fill={appearance.fill}
        stroke={appearance.stroke}
        strokeWidth={1.8}
        aria-hidden="true"
      />
      <span>{appearance.label}</span>
    </span>
  );
}
