'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Loader2 } from 'lucide-react';
import { startTest } from '@/lib/api/qa';

const TEST_TYPES = [
  { value: 'full-audit', label: 'Full Site Audit', placeholder: 'Test all pages, links, forms, and functionality' },
  { value: 'signup-flow', label: 'Signup / Login Flow', placeholder: 'Test user registration, login, password reset' },
  { value: 'checkout-flow', label: 'Checkout / Payment Flow', placeholder: 'Test shopping cart, payment, and order process' },
  { value: 'form-validation', label: 'Form Validation', placeholder: 'Test all forms with valid/invalid data, edge cases' },
  { value: 'responsive-check', label: 'Responsive Design', placeholder: 'Test at mobile, tablet, and desktop viewports' },
  { value: 'navigation', label: 'Navigation & Links', placeholder: 'Test all links, menus, breadcrumbs, and routing' },
  { value: 'accessibility', label: 'Accessibility (a11y)', placeholder: 'Test WCAG compliance, screen readers, keyboard nav' },
  { value: 'performance', label: 'Performance & Loading', placeholder: 'Test page load times, lazy loading, asset optimization' },
  { value: 'seo', label: 'SEO Audit', placeholder: 'Test meta tags, headings, structured data, canonical URLs' },
  { value: 'security', label: 'Security Check', placeholder: 'Test XSS, CSRF, open redirects, insecure forms' },
  { value: 'api-integration', label: 'API & Integration', placeholder: 'Test API calls, error handling, data flow' },
  { value: 'cross-browser', label: 'Cross-Browser', placeholder: 'Test compatibility across different browsers' },
  { value: 'user-journey', label: 'User Journey / E2E', placeholder: 'Test a complete user flow from start to finish' },
  { value: 'content-check', label: 'Content & Copy', placeholder: 'Check for typos, broken images, placeholder text' },
  { value: 'error-handling', label: 'Error Handling', placeholder: 'Test 404 pages, error states, edge cases' },
  { value: 'localization', label: 'Localization / i18n', placeholder: 'Test translations, RTL, date/number formats' },
  { value: 'dark-mode', label: 'Dark Mode / Theming', placeholder: 'Test dark mode, theme switching, contrast' },
  { value: 'mobile-app', label: 'Mobile App / PWA', placeholder: 'Test mobile-specific features, gestures, offline' },
  { value: 'regression', label: 'Regression Test', placeholder: 'Re-test after changes to verify nothing broke' },
  { value: 'other', label: 'Other / Altro / Autre / Andere / Otro / その他', placeholder: 'Describe what you want to test...' },
] as const;

const VIEWPORTS = [
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'both', label: 'Both' },
] as const;

interface TestInputFormProps {
  projectId?: string;
  onTestStarted?: (reportId: string, threadId: string) => void;
}

export function TestInputForm({ projectId, onTestStarted }: TestInputFormProps = {}) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [testType, setTestType] = useState('full-audit');
  const [specs, setSpecs] = useState('');
  const [viewport, setViewport] = useState('desktop');
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [credEmail, setCredEmail] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedType = TEST_TYPES.find(t => t.value === testType);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!url.trim()) {
      setError('Please enter a URL to test');
      return;
    }

    if ((testType === 'custom' || testType === 'other') && !specs.trim()) {
      setError('Please describe what you want to test');
      return;
    }

    setLoading(true);

    try {
      const result = await startTest({
        url: url.trim(),
        test_type: testType as any,
        specs: specs.trim() || undefined,
        viewport: viewport as any,
        credentials: (credEmail || credPassword) ? {
          email: credEmail || undefined,
          password: credPassword || undefined,
        } : undefined,
        project_id: projectId,
      });

      // Call callback if provided
      if (onTestStarted) {
        onTestStarted(result.report_id, result.thread_id);
      } else {
        // Default: navigate to the thread
        router.push(`/projects/${result.project_id}/thread/${result.thread_id}`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start test');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-lg">
      <div className="space-y-2">
        <Label htmlFor="url">URL to test</Label>
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

      <div className="space-y-2">
        <Label>Test type</Label>
        <Select value={testType} onValueChange={setTestType} disabled={loading}>
          <SelectTrigger>
            <SelectValue />
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

      <div className="space-y-2">
        <Label htmlFor="specs">
          {(testType === 'custom' || testType === 'other') ? 'Test specifications (required)' : 'Additional specifications (optional)'}
        </Label>
        <Textarea
          id="specs"
          placeholder={selectedType?.placeholder}
          value={specs}
          onChange={(e) => setSpecs(e.target.value)}
          rows={3}
          required={testType === 'custom' || testType === 'other'}
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label>Viewport</Label>
        <div className="flex gap-2">
          {VIEWPORTS.map((vp) => (
            <Button
              key={vp.value}
              type="button"
              variant={viewport === vp.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewport(vp.value)}
              disabled={loading}
            >
              {vp.label}
            </Button>
          ))}
        </div>
      </div>

      <Collapsible open={credentialsOpen} onOpenChange={setCredentialsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" type="button" className="gap-1 text-muted-foreground" disabled={loading}>
            Test credentials
            <ChevronDown className={`h-4 w-4 transition-transform ${credentialsOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          <Input
            placeholder="Test email"
            value={credEmail}
            onChange={(e) => setCredEmail(e.target.value)}
            disabled={loading}
          />
          <Input
            type="password"
            placeholder="Test password"
            value={credPassword}
            onChange={(e) => setCredPassword(e.target.value)}
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">
            Credentials are used only during the test and never stored.
          </p>
        </CollapsibleContent>
      </Collapsible>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
          {error}
        </div>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Starting test...
          </>
        ) : (
          'Run Test 🧪'
        )}
      </Button>
    </form>
  );
}
