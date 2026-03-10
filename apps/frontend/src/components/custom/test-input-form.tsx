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
import { createClient } from '@/lib/supabase/client';

const TEST_TYPES = [
  { value: 'full-audit', label: 'Full Site Audit', placeholder: 'Test all pages, links, forms, and functionality' },
  { value: 'signup-flow', label: 'Signup Flow', placeholder: 'Test user registration and account creation' },
  { value: 'checkout-flow', label: 'Checkout Flow', placeholder: 'Test shopping cart and payment process' },
  { value: 'form-validation', label: 'Form Validation', placeholder: 'Test all forms with valid/invalid data' },
  { value: 'responsive-check', label: 'Responsive Check', placeholder: 'Test at mobile, tablet, and desktop viewports' },
  { value: 'custom', label: 'Custom', placeholder: 'Describe exactly what you want to test...' },
] as const;

const VIEWPORTS = [
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'both', label: 'Both' },
] as const;

export function TestInputForm() {
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

    if (testType === 'custom' && !specs.trim()) {
      setError('Please describe what you want to test');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setError('Please sign in to run tests');
        setLoading(false);
        return;
      }

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000/v1';
      
      const response = await fetch(`${backendUrl}/qa/start-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          url: url.trim(),
          test_type: testType,
          specs: specs.trim() || undefined,
          viewport,
          credentials: (credEmail || credPassword) ? {
            email: credEmail || undefined,
            password: credPassword || undefined,
          } : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || `Test failed to start (${response.status})`);
      }

      const data = await response.json();
      
      // Navigate to the thread
      router.push(`/projects/${data.project_id}/thread/${data.thread_id}`);
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
          {testType === 'custom' ? 'Test specifications (required)' : 'Additional specifications (optional)'}
        </Label>
        <Textarea
          id="specs"
          placeholder={selectedType?.placeholder}
          value={specs}
          onChange={(e) => setSpecs(e.target.value)}
          rows={3}
          required={testType === 'custom'}
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
