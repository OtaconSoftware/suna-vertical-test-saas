'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ChevronDown } from 'lucide-react';

export interface TestInputData {
  url: string;
  testType: string;
  specs: string;
  viewport: 'desktop' | 'mobile' | 'both';
  credentials?: {
    email: string;
    password: string;
  };
}

interface TestInputFormProps {
  onSubmit: (data: TestInputData) => void;
  loading?: boolean;
  className?: string;
}

const TEST_TYPES = [
  { value: 'full-audit', label: 'Full Site Audit', placeholder: 'The AI will check all links, forms, images, console errors, and performance issues.' },
  { value: 'signup', label: 'Signup Flow', placeholder: 'The AI will test user registration, validation, and email confirmation.' },
  { value: 'checkout', label: 'Checkout Flow', placeholder: 'The AI will test adding to cart, payment forms, and purchase completion.' },
  { value: 'forms', label: 'Form Validation', placeholder: 'The AI will test all forms with valid, invalid, and edge case data.' },
  { value: 'responsive', label: 'Responsive Check', placeholder: 'The AI will test your site at mobile (375px), tablet (768px), and desktop (1280px) viewports.' },
  { value: 'custom', label: 'Custom', placeholder: 'Describe exactly what you want the AI to test on your site...' },
];

export function TestInputForm({ onSubmit, loading = false, className }: TestInputFormProps) {
  const [url, setUrl] = useState('');
  const [testType, setTestType] = useState('full-audit');
  const [specs, setSpecs] = useState('');
  const [viewport, setViewport] = useState<'desktop' | 'mobile' | 'both'>('desktop');
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const selectedTestType = TEST_TYPES.find(t => t.value === testType);
  const isCustom = testType === 'custom';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!url) return;
    if (isCustom && !specs) return;

    const data: TestInputData = {
      url,
      testType,
      specs,
      viewport,
    };

    if (email || password) {
      data.credentials = { email, password };
    }

    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className="space-y-4">
        {/* URL Input */}
        <div className="space-y-2">
          <Label htmlFor="url">Website URL</Label>
          <Input
            id="url"
            type="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        {/* Test Type Dropdown */}
        <div className="space-y-2">
          <Label htmlFor="test-type">Test Type</Label>
          <Select value={testType} onValueChange={setTestType} disabled={loading}>
            <SelectTrigger id="test-type">
              <SelectValue placeholder="Select test type" />
            </SelectTrigger>
            <SelectContent>
              {TEST_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Test Specs/Prompt */}
        <div className="space-y-2">
          <Label htmlFor="specs">
            Test Instructions {!isCustom && <span className="text-muted-foreground text-sm">(optional)</span>}
          </Label>
          <Textarea
            id="specs"
            placeholder={selectedTestType?.placeholder || 'Describe what to test...'}
            value={specs}
            onChange={(e) => setSpecs(e.target.value)}
            required={isCustom}
            disabled={loading}
            rows={4}
            className="resize-none"
          />
        </div>

        {/* Viewport Selection */}
        <div className="space-y-2">
          <Label>Viewport</Label>
          <RadioGroup value={viewport} onValueChange={(v) => setViewport(v as any)} disabled={loading}>
            <div className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="desktop" id="desktop" />
                <Label htmlFor="desktop" className="font-normal cursor-pointer">Desktop</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="mobile" id="mobile" />
                <Label htmlFor="mobile" className="font-normal cursor-pointer">Mobile</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="both" id="both" />
                <Label htmlFor="both" className="font-normal cursor-pointer">Both</Label>
              </div>
            </div>
          </RadioGroup>
        </div>

        {/* Collapsible Test Credentials */}
        <Collapsible open={credentialsOpen} onOpenChange={setCredentialsOpen}>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              disabled={loading}
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${credentialsOpen ? 'rotate-180' : ''}`} />
              Test Credentials (optional)
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="test@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full"
          disabled={loading || !url || (isCustom && !specs)}
        >
          {loading ? 'Running Test...' : 'Run Test 🧪'}
        </Button>
      </div>
    </form>
  );
}
