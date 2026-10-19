import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { TourStep } from './useTour';

export function TourOverlay({
  active,
  step,
  total,
  currentStep,
  onNext,
  onSkip,
}: {
  active: boolean;
  step: number;
  total: number;
  currentStep: TourStep | undefined;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!active || !currentStep) return;
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector(currentStep.target);
      if (el) {
        const rect = el.getBoundingClientRect();
        setPosition({
          top: rect.bottom + window.scrollY + 8,
          left: Math.max(16, Math.min(rect.left + window.scrollX, window.innerWidth - 340)),
        });
      } else {
        setPosition({ top: 100, left: Math.max(16, (window.innerWidth - 320) / 2) });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [active, currentStep]);

  if (!active || !currentStep || !position) return null;

  const isLast = step === total - 1;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/20" aria-hidden onClick={onSkip} />
      <Card
        className="fixed z-[61] w-80 space-y-3 p-4 shadow-lg"
        style={{ top: position.top, left: position.left }}
        role="dialog"
        aria-label={currentStep.title}
      >
        <div>
          <p className="text-muted-foreground text-xs font-medium">
            Step {step + 1} of {total}
          </p>
          <h3 className="text-sm font-semibold">{currentStep.title}</h3>
          <p className="text-muted-foreground mt-1 text-sm">{currentStep.content}</p>
        </div>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Skip
          </Button>
          <Button size="sm" onClick={onNext}>
            {isLast ? 'Done' : 'Next'}
          </Button>
        </div>
      </Card>
    </>
  );
}
