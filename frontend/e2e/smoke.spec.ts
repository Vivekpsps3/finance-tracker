import { test, expect } from '@playwright/test';

test('dashboard page header is visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});