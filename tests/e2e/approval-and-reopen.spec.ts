import { expect, test, type Page } from '@playwright/test';

const TEACHER = 'teacher@planroom.demo';
const HOD = 'hod@planroom.demo';
const PASSWORD = 'planroom';

test('HOD approves a plan, reopens it, comments on it, and teacher resubmits', async ({ page }) => {
  const title = `Photosynthesis Lab ${Date.now()}`;
  const reopenNote = 'Include safety goggles in the resources.';
  const commentNote = 'Good choice of specimen.';

  // 1. Teacher creates and submits a plan
  await signIn(page, TEACHER);
  await page.getByRole('link', { name: 'New plan' }).click();
  await expect(page).toHaveURL(/\/plans\/new$/);

  await page.getByLabel('Title').fill(title);
  await choose(page, 'Subject', 'Science');
  await choose(page, 'Grade', '7');
  await choose(page, 'Duration in minutes', '45');
  await page.getByLabel('Topic').fill('Light reaction in chloroplasts');
  await page.getByLabel('Objectives').fill('Observe starch production in elodea.');
  await page.getByLabel('Activities').fill('Test leaves with iodine solution.');
  await page.getByLabel('Resources').fill('Elodea, test tubes, iodine, light source');

  await page.getByRole('button', { name: 'Save and submit' }).click();
  await expect(page).toHaveURL(/\/plans\/[a-f0-9]{24}$/);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('In review', { exact: true })).toBeVisible();

  // 2. Sign out
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // 3. HOD signs in and approves the plan
  await signIn(page, HOD);
  await page.getByRole('link', { name: 'Review queue' }).click();
  await page.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('In review', { exact: true })).toBeVisible();

  // Click Approve
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Approved', { exact: true })).toBeVisible();
  await expect(page.getByText('This plan is approved.', { exact: true })).toBeVisible();

  // 4. HOD adds a comment
  await page.getByRole('button', { name: 'Comment' }).click();
  const commentDialog = page.getByRole('dialog', { name: 'Comment' });
  await commentDialog.getByRole('textbox').fill(commentNote);
  await commentDialog.getByRole('button', { name: 'Comment' }).click();
  await expect(commentDialog).toBeHidden();
  await expect(page.getByText(commentNote, { exact: true })).toBeVisible();

  // 5. HOD reopens the approved plan
  await page.getByRole('button', { name: 'Reopen' }).click();
  const reopenDialog = page.getByRole('dialog', { name: 'Reopen' });
  await reopenDialog.getByRole('textbox').fill(reopenNote);
  await reopenDialog.getByRole('button', { name: 'Reopen' }).click();
  await expect(reopenDialog).toBeHidden();
  await expect(page.getByText('Sent back', { exact: true })).toBeVisible();
  await expect(page.getByText(reopenNote, { exact: true })).toBeVisible();

  // 6. Sign out HOD
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // 7. Teacher signs in to see Sent back status and edits it
  await signIn(page, TEACHER);
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(/\/plans\/[a-f0-9]{24}$/);
  await expect(page.getByText('Sent back', { exact: true })).toBeVisible();
  await page.getByRole('heading', { name: title }).getByRole('link', { name: title }).click();
  await expect(page).toHaveURL(/\/plans\/[a-f0-9]{24}\/edit$/);

  // Update resources per HOD note and resubmit
  await page.getByLabel('Resources').fill('Elodea, test tubes, iodine, light source, safety goggles');
  await page.getByRole('button', { name: 'Save and submit' }).click();

  await expect(page).toHaveURL(/\/plans\/[a-f0-9]{24}$/);
  await expect(page.getByText('In review', { exact: true })).toBeVisible();
});

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

async function choose(page: Page, field: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: field }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
