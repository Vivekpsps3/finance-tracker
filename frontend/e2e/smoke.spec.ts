import { test, expect } from '@playwright/test';

test('login page is visible for anonymous users', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Finance' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
