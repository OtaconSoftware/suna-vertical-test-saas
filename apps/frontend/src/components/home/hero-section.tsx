'use client';

import { useState, useEffect, lazy, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useIsMobile } from '@/hooks/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogOverlay,
} from '@/components/ui/dialog';
import { useTranslations } from 'next-intl';
import { trackCtaSignup } from '@/lib/analytics/gtm';
import { useAgentStartInput } from '@/hooks/dashboard';
import { ChatInput } from '@/components/thread/chat-input/chat-input';
import { DynamicGreeting } from '@/components/ui/dynamic-greeting';

// Lazy load heavy components
const BreakitModesPanel = lazy(() => 
  import('@/components/dashboard/breakit-modes-panel').then(mod => ({ default: mod.BreakitModesPanel }))
);
const GoogleSignIn = lazy(() => import('@/components/GoogleSignIn'));

const BlurredDialogOverlay = () => (
  <DialogOverlay className="bg-background/40 backdrop-blur-md" />
);

export function HeroSection() {
  const t = useTranslations('dashboard');
  const tAuth = useTranslations('auth');
  const isMobile = useIsMobile();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  
  // Close auth dialog and redirect when user logs in
  useEffect(() => {
    if (authDialogOpen && user && !isLoading) {
      setAuthDialogOpen(false);
      router.push('/dashboard');
    }
  }, [user, isLoading, authDialogOpen, router]);
  
  const handleAuthRequired = (pendingMessage: string) => {
    trackCtaSignup();
    setAuthDialogOpen(true);
  };

  // Use the agent start input hook for state management (same as dashboard)
  const {
    inputValue,
    setInputValue,
    isSubmitting,
    isRedirecting,
    chatInputRef,
    selectedAgentId,
    setSelectedAgent,
    selectedMode,
    selectedCharts,
    selectedOutputFormat,
    selectedTemplate,
    setSelectedMode,
    setSelectedCharts,
    setSelectedOutputFormat,
    setSelectedTemplate,
    handleSubmit,
  } = useAgentStartInput({
    redirectOnError: '/',
    requireAuth: true,
    onAuthRequired: handleAuthRequired,
    enableAutoSubmit: true,
    logPrefix: '[HeroSection]',
  });
  
  return (
    <section id="hero" className="w-full h-dvh relative overflow-hidden">
      <div className="flex flex-col h-full w-full overflow-hidden relative">
        {/* Brandmark Background removed - was causing orange overlay */}

        {/* Main content area - greeting and modes centered */}
        <div className="flex-1 flex flex-col relative z-[1]">
          {/* Centered content: Greeting + Subtitle + Modes
              - Mobile: shifted up with pb-28 to account for chat input and feel more balanced
              - Desktop: true center with no offset */}
          <div className="absolute inset-0 flex items-center justify-center px-4 pb-28 sm:pb-0 pointer-events-none">
            <div className="w-full max-w-3xl mx-auto flex flex-col items-center text-center pointer-events-auto">
              {/* Headline */}
              <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 fill-mode-both">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground tracking-tight">
                  Test Your Web App with AI
                </h1>
              </div>

              {/* Subtitle */}
              <p className="mt-3 sm:mt-4 text-base sm:text-lg text-muted-foreground/80 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-75 fill-mode-both max-w-2xl">
                Describe what to test, get a detailed QA report. No scripts to write, no tests to maintain.
              </p>
            </div>
          </div>

          {/* Chat Input - fixed at bottom
              - Mobile: safe area padding for iOS home indicator */}
          <div className="absolute bottom-0 left-0 right-0 px-3 sm:px-4 pb-3 sm:pb-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-100 fill-mode-both">
            <div className="w-full max-w-3xl mx-auto">
              <ChatInput
                ref={chatInputRef}
                onSubmit={handleSubmit}
                placeholder={t('describeWhatYouNeed')}
                loading={isSubmitting || isRedirecting}
                disabled={isSubmitting}
                value={inputValue}
                onChange={setInputValue}
                isLoggedIn={!!user}
                selectedAgentId={selectedAgentId}
                onAgentSelect={setSelectedAgent}
                autoFocus={false}
                enableAdvancedConfig={false}
                selectedMode={selectedMode}
                onModeDeselect={() => setSelectedMode(null)}
                animatePlaceholder={true}
                hideAttachments={false}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Auth Dialog */}
      <Dialog open={authDialogOpen} onOpenChange={setAuthDialogOpen}>
        <BlurredDialogOverlay />
        <DialogContent className="sm:max-w-md rounded-xl bg-background border border-border">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-medium">
                {tAuth('signInToContinue')}
              </DialogTitle>
            </div>
            <DialogDescription className="text-muted-foreground">
              {tAuth('signInOrCreateAccountToTalk')}
            </DialogDescription>
          </DialogHeader>

          <div className="w-full space-y-3 mt-8">
            <Suspense fallback={<div className="h-12 bg-muted/20 rounded-full animate-pulse" />}>
              <GoogleSignIn returnUrl="/dashboard" />
            </Suspense>
          </div>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-background text-muted-foreground font-medium">
                {tAuth('orContinueWithEmail')}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <Link
              href={`/auth?returnUrl=${encodeURIComponent('/dashboard')}`}
              className="flex h-12 items-center justify-center w-full text-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm font-medium"
              onClick={() => {
                trackCtaSignup();
                setAuthDialogOpen(false);
              }}
            >
              {tAuth('signInWithEmail')}
            </Link>

            <Link
              href={`/auth?mode=signup&returnUrl=${encodeURIComponent('/dashboard')}`}
              className="flex h-12 items-center justify-center w-full text-center rounded-full border border-border bg-background hover:bg-accent/50 transition-all font-medium"
              onClick={() => {
                trackCtaSignup();
                setAuthDialogOpen(false);
              }}
            >
              {tAuth('createNewAccount')}
            </Link>
          </div>

          <div className="mt-8 text-center text-[13px] text-muted-foreground leading-relaxed">
            {tAuth('byContinuingYouAgreeSimple')}{' '}
            <a href="https://www.otacon.com/legal?tab=terms" target="_blank" rel="noopener noreferrer" className="text-foreground/70 hover:text-foreground underline underline-offset-2 transition-colors">
              {tAuth('termsOfService')}
            </a>{' '}
            and{' '}
            <a href="https://www.otacon.com/legal?tab=privacy" target="_blank" rel="noopener noreferrer" className="text-foreground/70 hover:text-foreground underline underline-offset-2 transition-colors">
              {tAuth('privacyPolicy')}
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
