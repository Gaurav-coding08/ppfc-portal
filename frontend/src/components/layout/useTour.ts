import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/useAuth';

const STORAGE_KEY = 'keel-tour-completed';
const TOUR_OFF_PARAM = 'tour';

export interface TourStep {
  target: string;
  title: string;
  content: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-slot="sidebar"]',
    title: 'Navigation',
    content: 'Use the sidebar to move between modules. It collapses to icons on smaller screens.',
  },
  {
    target: '[data-testid="filter-bar"], [role="combobox"]',
    title: 'Filters',
    content: 'Filter by department, project, timeframe and more. Filters update the URL so you can share views.',
  },
  {
    target: '[aria-label="Actual spend: show records"]',
    title: 'Drill down',
    content: 'Click a KPI card to open a drawer listing the individual records behind the number.',
  },
  {
    target: '[data-testid="your-focus"]',
    title: 'Your focus',
    content: 'A personalised strip showing what needs your attention right now, based on your role.',
  },
  {
    target: '[aria-label*="Notification"]',
    title: 'Notifications',
    content: 'The bell shows new overdue-task escalations and system events. Read and dismiss them here.',
  },
];

function isTourDisabled(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(TOUR_OFF_PARAM) === 'off') return true;
  } catch {
    // ignore
  }
  if (typeof navigator !== 'undefined' && navigator.webdriver) return true;
  return false;
}

function hasCompletedTour(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function markTourCompleted() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // localStorage unavailable
  }
}

export function useTour() {
  const { user } = useAuth();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  const start = useCallback(() => {
    setStep(0);
    setActive(true);
  }, []);

  useEffect(() => {
    if (!user || isTourDisabled() || hasCompletedTour()) return;
    const timer = setTimeout(() => setActive(true), 500);
    return () => clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    const handler = () => start();
    window.addEventListener('keel-start-tour', handler);
    return () => window.removeEventListener('keel-start-tour', handler);
  }, [start]);

  const next = useCallback(() => {
    if (step < TOUR_STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      setActive(false);
      markTourCompleted();
    }
  }, [step]);

  const skip = useCallback(() => {
    setActive(false);
    markTourCompleted();
  }, []);

  return { active, step, steps: TOUR_STEPS, currentStep: TOUR_STEPS[step], next, skip, start };
}
