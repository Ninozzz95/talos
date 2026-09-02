import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const artifacts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../artifacts/phase-03');

async function openLab(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto('/?component=DesignSystem');
  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true');
  return errors;
}

test('PHASE3-TOKEN-CONTRACT-01/PHASE3-BUTTON-02 — geometria, token e screenshot restano nel contratto desktop', async ({ page }, testInfo) => {
  const errors = await openLab(page);
  const metrics = await page.evaluate(() => {
    const primary = document.querySelector('[data-testid="ds-button-primary"]');
    const icon = document.querySelector('[data-testid="ds-icon-button"]');
    const rootStyle = getComputedStyle(document.documentElement);
    const primaryRect = primary.getBoundingClientRect();
    const iconRect = icon.getBoundingClientRect();
    return {
      theme: document.documentElement.dataset.talosTheme,
      accent: rootStyle.getPropertyValue('--talos-accent').trim(),
      motion: rootStyle.getPropertyValue('--talos-motion-duration-control').trim(),
      primaryHeight: primaryRect.height,
      iconWidth: iconRect.width,
      iconHeight: iconRect.height,
      noHorizontalOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth,
    };
  });
  expect(metrics.theme).toBe('calm');
  expect(metrics.accent).not.toBe('');
  expect(metrics.motion).not.toBe('');
  expect(metrics.primaryHeight).toBeGreaterThanOrEqual(40);
  expect(metrics.iconWidth).toBeGreaterThanOrEqual(36);
  expect(metrics.iconHeight).toBeGreaterThanOrEqual(36);
  expect(metrics.noHorizontalOverflow).toBe(true);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: path.join(artifacts, `design-system-${testInfo.project.name}.png`), fullPage: true });
  expect(errors).toEqual([]);
});

test('PHASE3-BUTTON-02/PHASE3-BADGE-03 — azioni, disabilitazione e stato hanno testo accessibile', async ({ page }) => {
  await openLab(page);
  await expect(page.getByRole('button', { name: 'Salva modifica' })).toBeEnabled();
  const disabled = page.getByRole('button', { name: 'Pubblica modifica' });
  await expect(disabled).toBeDisabled();
  await expect(page.locator(`#${await disabled.getAttribute('aria-describedby')}`)).toContainText('Collega un repository');
  await expect(page.getByRole('status', { name: 'Stato sincronizzato' })).toContainText('Sincronizzato');
});

test('PHASE3-TABS-04 — frecce e Home/End muovono il focus, Enter attiva il panel', async ({ page }) => {
  await openLab(page);
  const overview = page.getByRole('tab', { name: 'Panoramica' });
  const activity = page.getByRole('tab', { name: 'Attività' });
  await overview.focus();
  await page.keyboard.press('ArrowRight');
  await expect(activity).toBeFocused();
  await expect(activity).toHaveAttribute('aria-selected', 'false');
  await page.keyboard.press('Enter');
  await expect(activity).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Attività' })).toContainText('Eventi recenti');
  await page.keyboard.press('Home');
  await expect(overview).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Dettagli' })).toBeFocused();
});

test('PHASE3-SWITCH-05 — il controllo resta nominato e il parent conferma lo stato', async ({ page }) => {
  await openLab(page);
  const control = page.getByRole('switch', { name: 'Aggiornamenti automatici' });
  await expect(control).toHaveAttribute('aria-checked', 'false');
  await control.click();
  await expect(control).toHaveAttribute('aria-checked', 'true');
  await control.focus();
  await page.keyboard.press('Space');
  await expect(control).toHaveAttribute('aria-checked', 'false');
  await expect(control).toHaveAccessibleName('Aggiornamenti automatici');
});

test('PHASE3-MENU-06 — menu, tastiera, selezione, Escape e focus return sono coerenti', async ({ page }, testInfo) => {
  await openLab(page);
  const trigger = page.getByRole('button', { name: 'Azioni progetto' });
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const first = page.getByRole('menuitem', { name: 'Apri cartella' });
  await expect(first).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'Archivia progetto' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(first).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('ArrowUp');
  const last = page.getByRole('menuitem', { name: 'Archivia progetto' });
  await expect(last).toBeFocused();
  const menuInsideViewport = await page.getByRole('menu').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
  });
  expect(menuInsideViewport).toBe(true);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: path.join(artifacts, `menu-open-${testInfo.project.name}.png`) });
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid="ds-last-action"]')).toHaveText('Archivia progetto');
});

test('PHASE3-TOOLTIP-07 — focus ed Escape governano un tooltip non interattivo e posizionato', async ({ page }) => {
  await openLab(page);
  const trigger = page.getByRole('button', { name: 'Informazioni sincronizzazione' });
  await trigger.focus();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-describedby', await tooltip.getAttribute('id'));
  const insideViewport = await tooltip.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
  });
  expect(insideViewport).toBe(true);
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('PHASE3-SHEET-08 — sheet usa focus trap, sfondo inerte, Escape e ritorno focus', async ({ page }, testInfo) => {
  await openLab(page);
  const trigger = page.getByRole('button', { name: 'Apri dettagli ambiente' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Dettagli ambiente' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Chiudi' })).toBeFocused();
  await expect(page.locator('.design-system-lab')).toHaveAttribute('aria-hidden', 'true');
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: path.join(artifacts, `sheet-open-${testInfo.project.name}.png`), fullPage: true });
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Applica' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('PHASE3-SHEET-MOTION-15 — lo sheet produce pixel distinti prima, durante e dopo la transizione', async ({ page }, testInfo) => {
  await openLab(page);
  await mkdir(artifacts, { recursive: true });
  const before = await page.screenshot({ path: path.join(artifacts, `sheet-motion-before-${testInfo.project.name}.png`) });
  await page.getByRole('button', { name: 'Apri dettagli ambiente' }).click();
  const dialog = page.getByRole('dialog', { name: 'Dettagli ambiente' });
  const motion = await dialog.evaluate((element) => {
    const animation = element.getAnimations().find((candidate) => candidate.effect?.getTiming().duration > 0);
    if (!animation) return null;
    const duration = Number(animation.effect.getTiming().duration);
    animation.pause();
    animation.currentTime = duration / 2;
    return { duration, playState: animation.playState };
  });
  expect(motion?.duration).toBeGreaterThan(0);
  expect(motion?.playState).toBe('paused');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const midpoint = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const hit = document.elementFromPoint(rect.left + Math.min(20, rect.width / 2), rect.top + Math.min(20, rect.height / 2));
    return {
      opacity: Number(style.opacity),
      transform: style.transform,
      intersects: rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight,
      hitInside: element.contains(hit),
    };
  });
  expect(midpoint.opacity).toBeGreaterThan(0);
  expect(midpoint.opacity).toBeLessThan(1);
  expect(midpoint.transform).not.toBe('none');
  expect(midpoint.intersects).toBe(true);
  expect(midpoint.hitInside).toBe(true);
  const during = await page.screenshot({ path: path.join(artifacts, `sheet-motion-during-${testInfo.project.name}.png`) });
  await dialog.evaluate((element) => {
    const animation = element.getAnimations().find((candidate) => candidate.effect?.getTiming().duration > 0);
    animation.currentTime = Number(animation.effect.getTiming().duration);
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const after = await page.screenshot({ path: path.join(artifacts, `sheet-motion-after-${testInfo.project.name}.png`) });
  const decode = (bytes) => PNG.sync.read(bytes);
  const beforePng = decode(before);
  const duringPng = decode(during);
  const afterPng = decode(after);
  const changedBeforeDuring = pixelmatch(beforePng.data, duringPng.data, null, beforePng.width, beforePng.height, { threshold: 0.1 });
  const changedDuringAfter = pixelmatch(duringPng.data, afterPng.data, null, duringPng.width, duringPng.height, { threshold: 0.1 });
  expect(changedBeforeDuring).toBeGreaterThan(500);
  expect(changedDuringAfter).toBeGreaterThan(100);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('PHASE3-MOTION-COLORS-09 — reduced motion e forced colors mantengono controllo e focus leggibili', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await openLab(page);
  const control = page.getByRole('switch', { name: 'Aggiornamenti automatici' });
  await control.focus();
  const style = await control.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      transitionDuration: computed.transitionDuration,
      borderStyle: computed.borderStyle,
      outlineStyle: computed.outlineStyle,
    };
  });
  expect(['0s', '0.001ms', '0.01ms']).toContain(style.transitionDuration);
  expect(style.borderStyle).not.toBe('none');
  expect(style.outlineStyle).not.toBe('none');
});
