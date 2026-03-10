import { config } from '@/lib/config';

interface UpgradePlan {
  /** @deprecated */
  hours: string;
  price: string;
  tierKey: string;  // Backend tier key
}

export interface PricingTier {
  name: string;
  price: string;
  yearlyPrice?: string;
  description: string;
  buttonText: string;
  buttonColor: string;
  isPopular: boolean;
  /** @deprecated */
  hours: string;
  features: string[];
  disabledFeatures?: string[];
  baseCredits?: number;
  bonusCredits?: number;
  tierKey: string;  // Backend tier key (e.g., 'tier_2_20', 'free')
  upgradePlans: UpgradePlan[];
  hidden?: boolean;
  billingPeriod?: 'monthly' | 'yearly';
  originalYearlyPrice?: string;
  discountPercentage?: number;
}

export const pricingTiers: PricingTier[] = [
  {
    name: 'Free',
    price: '$0',
    yearlyPrice: '$0',
    originalYearlyPrice: '$0',
    discountPercentage: 0,
    description: 'Perfect for trying out TestAgent',
    buttonText: 'Get started',
    buttonColor: 'bg-secondary text-white',
    isPopular: false,
    hours: '0 hours',
    features: [
      '10 test runs per month',
      '1 concurrent test',
      'Basic QA reports',
      'Screenshot capture',
      'Email delivery',
    ],
    disabledFeatures: [
      'No detailed reports',
      'No CI/CD integration',
      'No email notifications',
      'No team management',
    ],
    tierKey: config.SUBSCRIPTION_TIERS.FREE_TIER.tierKey,
    upgradePlans: [],
  },
  {
    name: 'Pro',
    price: '$29',
    yearlyPrice: '$295',
    originalYearlyPrice: '$348',
    discountPercentage: 15,
    description: 'Best for individual developers and small teams',
    buttonText: 'Get started',
    buttonColor: 'bg-primary text-white dark:text-black',
    isPopular: true,
    hours: '10 hours',
    baseCredits: 100,
    bonusCredits: 0,
    features: [
      '100 test runs per month',
      '3 concurrent tests',
      'Detailed QA reports with screenshots',
      'Email notifications on test completion',
      'Priority email support',
      'Test history & analytics',
    ],
    tierKey: config.SUBSCRIPTION_TIERS.TIER_2_20.tierKey,
    upgradePlans: [],
  },
  {
    name: 'Team',
    price: '$99',
    yearlyPrice: '$1009',
    originalYearlyPrice: '$1188',
    discountPercentage: 15,
    description: 'Ideal for growing teams with CI/CD needs',
    buttonText: 'Get started',
    buttonColor: 'bg-primary text-white dark:text-black',
    isPopular: false,
    hours: '50 hours',
    baseCredits: 500,
    bonusCredits: 0,
    features: [
      '500 test runs per month',
      '10 concurrent tests',
      'Detailed QA reports with screenshots',
      'CI/CD integration (GitHub Actions, Jenkins, etc.)',
      'Team management & role-based access',
      'Priority support',
      'Slack/Discord notifications',
      'Custom test templates',
    ],
    tierKey: config.SUBSCRIPTION_TIERS.TIER_3_200.tierKey,
    upgradePlans: [],
  },
];

