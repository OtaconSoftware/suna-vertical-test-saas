'use client';

import { cn } from '@/lib/utils';

interface OtaconLogoProps {
  size?: number;
  variant?: 'symbol' | 'logomark';
  className?: string;
}

export function OtaconLogo({ size = 24, variant = 'symbol', className }: OtaconLogoProps) {
  // Breakit branding: text logo with test tube emoji
  return (
    <div
      className={cn('flex items-center gap-2 flex-shrink-0', className)}
      style={{ fontSize: `${size}px` }}
    >
      <span className="text-2xl" role="img" aria-label="test tube">🧪</span>
      <span className="font-semibold text-foreground" style={{ fontSize: `${size * 0.8}px` }}>
        Breakit
      </span>
    </div>
  );
}
