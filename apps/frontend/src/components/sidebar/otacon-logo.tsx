'use client';

import { cn } from '@/lib/utils';

interface OtaconLogoProps {
  size?: number;
  variant?: 'symbol' | 'logomark';
  className?: string;
}

export function OtaconLogo({ size = 24, variant = 'symbol', className }: OtaconLogoProps) {
  return (
    <div
      className={cn('flex items-center gap-2 flex-shrink-0', className)}
    >
      <img
        src="/otacon-logo.svg"
        alt="Otacon"
        width={size}
        height={size}
        className="flex-shrink-0"
      />
      {variant === 'logomark' && (
        <span className="font-semibold text-foreground" style={{ fontSize: `${size * 0.7}px` }}>
          Breakit
        </span>
      )}
    </div>
  );
}
