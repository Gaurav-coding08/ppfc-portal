import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { storageStatePath } from '../support/accounts.ts';

// Responsive + accessibility regression net (feature 18 Part C). Every page
// is opened at the four design-system breakpoints and checked for:
//   1. no horizontal page scroll (wide tables must scroll inside their card);
//   2. every visible button, link and form control has an accessible name
//      (icon-only buttons need aria-label; inputs need a label);
//   3. text contrast meets WCAG AA (4.5:1, or 3:1 for large text).
// A full-page screenshot per page/width lands in test-results/layout/ for a
// visual review.
const WIDTHS = [1440, 1024, 768, 390] as const;

const ADMIN_PAGES = [
  '/dashboard',
  '/projects',
  '/projects/1?tab=overview',
  '/projects/1?tab=tasks',
  '/projects/1?tab=milestones',
  '/projects/1?tab=risks',
  '/projects/1?tab=change-requests',
  '/projects/1?tab=finance',
  '/projects/1?tab=members',
  '/projects/1?tab=activity',
  '/my-tasks',
  '/risks',
  '/risks/high-exposure',
  '/change-requests',
  '/change-requests/1',
  '/finance/alerts',
  '/finance/comparison?projectIds=1,2,3',
  '/finance/categories',
  '/admin/users',
  '/admin/audit-log',
  '/admin/automation',
  '/notifications',
];

// Returns a description of every visible interactive element without an
// accessible name. Approximates the accname rules that matter here: text
// content, aria-label, aria-labelledby, title, <label for>, wrapping label.
async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector =
      'button, a[href], input:not([type=hidden]), select, textarea, [role=combobox], [role=slider]';
    const problems: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || el.closest('[aria-hidden=true]')) continue;
      const labelledBy = el
        .getAttribute('aria-labelledby')
        ?.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join('');
      const forLabel = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : '';
      const name = [
        el.getAttribute('aria-label'),
        labelledBy,
        el.getAttribute('title'),
        forLabel,
        el.closest('label')?.textContent,
        el instanceof HTMLInputElement ? el.placeholder : '',
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) ? '' : el.textContent,
      ]
        .join('')
        .trim();
      if (!name) problems.push(el.outerHTML.slice(0, 160));
    }
    return problems;
  });
}

// Every visible text element whose contrast against its effective
// background is below WCAG AA. Colours are resolved through a 1×1 canvas so
// any CSS colour syntax (Tailwind v4 emits oklch) becomes sRGB; translucent
// backgrounds are composited over their ancestors. Disabled controls and
// chart SVG text are exempt (WCAG excludes inactive UI; chart ticks use
// fill, not color).
async function lowContrastText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    const rgba = (css: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r!, g!, b!, a! / 255];
    };
    const over = (top: number[], bottom: number[]) =>
      top.slice(0, 3).map((c, i) => c * top[3]! + bottom[i]! * (1 - top[3]!));
    const background = (el: Element | null): number[] => {
      if (!el) return [255, 255, 255];
      const bg = rgba(getComputedStyle(el).backgroundColor);
      if (bg[3] === 1) return bg.slice(0, 3);
      const below = background(el.parentElement);
      return bg[3] === 0 ? below : over(bg, below);
    };
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };

    const problems: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const hasText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim(),
      );
      if (!hasText || el.closest('svg, [aria-hidden=true], :disabled, [data-disabled]')) continue;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (
        rect.width === 0 ||
        rect.height === 0 ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0
      )
        continue;

      const bg = background(el);
      const fg = over(rgba(style.color), bg);
      const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
      const ratio = (hi! + 0.05) / (lo! + 0.05);
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) {
        problems.push(
          `${ratio.toFixed(2)}:1 "${el.textContent!.trim().slice(0, 40)}" (${style.color} on rgb(${bg.map(Math.round).join(',')}))`,
        );
      }
    }
    return [...new Set(problems)];
  });
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  // Skeletons are replaced once each query resolves.
  await expect(page.locator('[data-slot=skeleton]')).toHaveCount(0, { timeout: 10_000 });
}

async function checkPage(page: Page, url: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(url);
  await settle(page);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect.soft(overflow, `${url} @ ${width}px scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(0);
  expect.soft(await unnamedControls(page), `${url} @ ${width}px has unnamed controls`).toEqual([]);
  expect.soft(await lowContrastText(page), `${url} @ ${width}px has low-contrast text`).toEqual([]);

  const file = `${url.replace(/[/?=&,]+/g, '_').replace(/^_/, '')}-${width}.png`;
  await page.screenshot({ path: path.join(test.info().project.outputDir, 'layout', file), fullPage: true });
}

test.describe('as admin (every page)', () => {
  test.use({ storageState: storageStatePath('admin') });
  for (const width of WIDTHS) {
    test(`all pages fit and are labelled at ${width}px`, async ({ page }) => {
      for (const url of ADMIN_PAGES) await checkPage(page, url, width);
    });
  }
});

test.describe('login page', () => {
  for (const width of WIDTHS) {
    test(`login fits and is labelled at ${width}px`, async ({ page }) => {
      await checkPage(page, '/login', width);
    });
  }
});
