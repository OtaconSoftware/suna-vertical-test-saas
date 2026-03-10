import { pricingTiers, type PricingTier } from '@/lib/pricing-config';

// Re-export for backward compatibility
export type { PricingTier } from '@/lib/pricing-config';

export const siteConfig = {
  url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  nav: {
    links: [
      { id: 1, name: 'Home', href: '/' },
      { id: 2, name: 'Pricing', href: '/pricing' },
      { id: 3, name: 'Docs', href: '/docs' },
    ],
  },
  hero: {
    description:
      'Breakit – AI-powered platform to automatically test your web apps, catch bugs, and generate QA reports.',
  },
  cloudPricingItems: pricingTiers,
  footerLinks: [
    {
      title: 'Breakit',
      links: [
        { id: 1, title: 'About', url: '/about' },
        { id: 2, title: 'Support', url: '/support' },
        { id: 3, title: 'Contact', url: 'mailto:support@breakit.dev' },
      ],
    },
    {
      title: 'Resources',
      links: [
        { id: 4, title: 'Documentation', url: '/docs' },
        { id: 5, title: 'API Reference', url: '/docs/api' },
        { id: 6, title: 'Tutorials', url: '/tutorials' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { id: 7, title: 'Privacy Policy', url: '/legal?tab=privacy' },
        { id: 8, title: 'Terms of Service', url: '/legal?tab=terms' },
      ],
    },
  ],
};

export type SiteConfig = typeof siteConfig;
