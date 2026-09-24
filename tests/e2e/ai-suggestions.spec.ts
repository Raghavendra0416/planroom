import { expect, test, type Page } from '@playwright/test';

const TEACHER = 'teacher@planroom.demo';
const PASSWORD = 'planroom';

const SUGGESTIONS = {
  objectives: ['Identify fractions.', 'Explain halves.', 'Compare parts.'],
  activities: ['Sort fraction cards in pairs.', 'Shade halves on a number line.', 'Compare fraction pairs.'],
  resources: ['Fraction cards.', 'Worksheets.', 'Rulers.'],
};

const MORE_OBJECTIVES = ['Name unit fractions.', 'Order unit fractions.', 'Build fraction walls.'];

test('one AI request renders 3 per field below each field with insert, dismiss, and more', async ({ page }) => {
  let postCount = 0;
  const morePosts: Array<Record<string, unknown>> = [];
  await mockSuggestions(page, SUGGESTIONS, MORE_OBJECTIVES, () => {
    postCount += 1;
  }, morePosts);

  await signIn(page, TEACHER);
  await page.getByRole('link', { name: 'New plan' }).click();
  await expect(page).toHaveURL(/\/plans\/new$/);
  await fillContext(page);

  await page.getByRole('button', { name: 'Draft lesson with AI' }).click();
  expect(postCount).toBe(1);

  const objectives = page.locator('.category-suggestions[data-category="objectives"]');
  const activities = page.locator('.category-suggestions[data-category="activities"]');
  const resources = page.locator('.category-suggestions[data-category="resources"]');
  await expect(objectives.getByRole('listitem')).toHaveCount(3);
  await expect(activities.getByRole('listitem')).toHaveCount(3);
  await expect(resources.getByRole('listitem')).toHaveCount(3);

  await expectFieldOrder(page, 'Objectives', objectives);
  await expectFieldOrder(page, 'Activities', activities);
  await expectFieldOrder(page, 'Resources', resources);

  await objectives.getByRole('button', { name: 'Insert' }).first().click();
  await expect(page.getByLabel('Objectives')).toHaveValue('Identify fractions.');
  await expect(objectives.getByRole('listitem')).toHaveCount(2);

  await resources.getByRole('button', { name: 'Dismiss' }).first().click();
  await expect(page.getByLabel('Resources')).toHaveValue('');
  await expect(resources.getByRole('listitem')).toHaveCount(2);

  await activities.getByRole('button', { name: 'Insert all activities' }).click();
  await expect(page.getByLabel('Activities')).toHaveValue(SUGGESTIONS.activities.join('\n'));
  await expect(activities).toHaveCount(0);

  await objectives.getByRole('button', { name: 'Suggest more objectives' }).click();
  await expect(objectives.getByRole('listitem')).toHaveCount(3);
  await expect(objectives.getByText('Name unit fractions.')).toBeVisible();
  expect(morePosts).toHaveLength(1);
  const moreBody = morePosts[0] as { category?: string; exclude?: string[] };
  expect(moreBody.category).toBe('objectives');
  expect(moreBody.exclude).toEqual(expect.arrayContaining(['Identify fractions.', 'Explain halves.', 'Compare parts.']));
});

test('dismiss all per category and globally, double-click inserts once, over-limit stays', async ({ page }) => {
  await mockSuggestions(page, SUGGESTIONS, MORE_OBJECTIVES);

  await signIn(page, TEACHER);
  await page.getByRole('link', { name: 'New plan' }).click();
  await expect(page).toHaveURL(/\/plans\/new$/);
  await fillContext(page);

  await page.getByRole('button', { name: 'Draft lesson with AI' }).click();
  const objectives = page.locator('.category-suggestions[data-category="objectives"]');
  const resources = page.locator('.category-suggestions[data-category="resources"]');
  await expect(objectives.getByRole('listitem')).toHaveCount(3);

  await objectives.getByRole('button', { name: 'Insert' }).first().dblclick();
  await expect(page.getByLabel('Objectives')).toHaveValue('Identify fractions.');
  await expect(objectives.getByRole('listitem')).toHaveCount(2);

  await page.getByLabel('Objectives').fill('x'.repeat(2000));
  await objectives.getByRole('button', { name: 'Insert' }).first().click();
  await expect(page.getByText('Objectives must be 1 to 2000 characters.')).toBeVisible();
  await expect(objectives.getByRole('listitem')).toHaveCount(2);

  await resources.getByRole('button', { name: 'Dismiss all resources' }).click();
  await expect(resources).toHaveCount(0);
  await expect(page.getByLabel('Resources')).toHaveValue('');

  await page.getByRole('button', { name: 'Dismiss all suggestions' }).click();
  await expect(page.locator('.category-suggestions')).toHaveCount(0);
});

/**
 * Mocks AI availability, generation, and follow-ups so the test never calls a provider.
 * @param page - Playwright page.
 * @param suggestions - Deterministic initial suggestions.
 * @param more - Deterministic follow-up objectives.
 * @param onPost - Optional hook counting initial POST requests.
 * @param morePosts - Optional sink recording follow-up request bodies.
 */
async function mockSuggestions(
  page: Page,
  suggestions: typeof SUGGESTIONS,
  more: string[],
  onPost?: () => void,
  morePosts?: Array<Record<string, unknown>>,
): Promise<void> {
  await page.route('**/api/ai/suggestions', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { ok: true, data: { enabled: true, available: true } } });
      return;
    }
    onPost?.();
    await route.fulfill({ json: { ok: true, data: suggestions } });
  });
  await page.route('**/api/ai/suggestions/more', async (route) => {
    morePosts?.push((route.request().postDataJSON() ?? {}) as Record<string, unknown>);
    await route.fulfill({ json: { ok: true, data: { suggestions: more } } });
  });
}

/**
 * Asserts the suggestion block sits directly below its field.
 * @param page - Playwright page on the new-plan form.
 * @param field - Accessible name of the textarea.
 * @param block - Suggestion block locator for that category.
 */
async function expectFieldOrder(page: Page, field: string, block: ReturnType<Page['locator']>): Promise<void> {
  const order = await page.evaluate(
    ({ label, selector }) => {
      const field = document.querySelector(`#${label}`);
      const suggestions = document.querySelector(selector);
      if (!(field instanceof HTMLElement) || !(suggestions instanceof HTMLElement)) {
        return null;
      }
      const fieldRect = field.getBoundingClientRect();
      const suggestionsRect = suggestions.getBoundingClientRect();
      return { fieldTop: fieldRect.top, suggestionsTop: suggestionsRect.top };
    },
    { label: field === 'Objectives' ? 'plan-objectives' : field === 'Activities' ? 'plan-activities' : 'plan-resources', selector: `.category-suggestions[data-category="${field.toLowerCase()}"]` },
  );
  expect(order).not.toBeNull();
  expect(order?.suggestionsTop).toBeGreaterThan(order?.fieldTop ?? 0);
  await expect(block).toBeVisible();
}

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
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

/**
 * Fills the class context the AI prompt uses.
 * @param page - Playwright page on the new-plan form.
 */
async function fillContext(page: Page): Promise<void> {
  await page.getByLabel('Title').fill(`AI lesson ${Date.now()}`);
  await choose(page, 'Subject', 'Science');
  await choose(page, 'Grade', '8');
  await choose(page, 'Duration in minutes', '40');
  await page.getByLabel('Topic').fill('Fractions of a river sample');
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
