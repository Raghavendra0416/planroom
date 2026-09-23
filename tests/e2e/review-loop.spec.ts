import { expect, test, type Page } from '@playwright/test';

const TEACHER = 'teacher@planroom.demo';
const HOD = 'hod@planroom.demo';
const PASSWORD = 'planroom';

test('teacher submits a complete plan and the head of department sends it back', async ({ page }) => {
  const title = `River ratios ${Date.now()}`;
  const note = 'Add a worked example before the practice.';

  await signIn(page, TEACHER);
  await page.getByRole('link', { name: 'New plan' }).click();
  await expect(page).toHaveURL(/\/plans\/new$/);

  await page.getByLabel('Title').fill(title);
  await choose(page, 'Subject', 'Science');
  await choose(page, 'Grade', '8');
  await choose(page, 'Duration in minutes', '40');
  await page.getByLabel('Topic').fill('Equivalent ratios on a river');
  await page.getByLabel('Objectives').fill('Compare two ratios.');
  await page.getByLabel('Activities').fill('Build a ratio table.');
  await page.getByLabel('Resources').fill('Squared paper');

  await page.getByRole('button', { name: 'Save and submit' }).click();
  await expect(page).toHaveURL(/\/plans\/[a-f0-9]{24}$/);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('In review', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);

  await signIn(page, HOD);
  await page.getByRole('link', { name: 'Review queue' }).click();
  await page.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('In review', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Send back' }).click();
  const dialog = page.getByRole('dialog', { name: 'Send back' });
  await dialog.getByRole('textbox').fill(note);
  await dialog.getByRole('button', { name: 'Send back' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText('Sent back', { exact: true })).toBeVisible();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
});

/**
 * Signs in with a demo account and waits until the plan register is open.
 * @param page - Playwright page.
 * @param email - Demo email.
 */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/plans$/);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

/**
 * Picks one option from a paper select.
 * @param page - Playwright page.
 * @param field - Accessible name of the select.
 * @param option - Visible option text.
 */
async function choose(page: Page, field: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: field }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
