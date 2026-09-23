import { suggestHourModel } from '@/backend/models/suggest-hour.model';

/**
 * Store that increments one `suggest_hours` document.
 */
export interface SuggestHourCounter {
  /**
   * Applies the hour increment and returns the stored document.
   * @param filter - Hour key to update.
   * @param update - Increment of `count` by 1.
   * @param options - Upsert flag and the request to return the updated document.
   * @returns The stored hour document, or null when the write did not return one.
   */
  findOneAndUpdate(
    filter: { hour: string },
    update: { $inc: { count: number } },
    options: { upsert: boolean; returnDocument: 'after' },
  ): Promise<{ count: number } | null>;
}

/**
 * Formats a server-local clock hour as `YYYY-MM-DDTHH`.
 * @param now - Instant used for the local year, month, day, and hour. Defaults to the current time.
 * @returns The hour key stored on `suggest_hours`.
 */
export function suggestHourKey(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}T${hour}`;
}

/**
 * Wraps the Mongoose model behind the counter used before a provider call.
 * @param model - Compiled `suggest_hours` model. Defaults to the active connection's model.
 * @returns A counter whose increment returns the stored count.
 */
export function asSuggestHourCounter(model: ReturnType<typeof suggestHourModel> = suggestHourModel()): SuggestHourCounter {
  return {
    async findOneAndUpdate(filter, update, options) {
      const doc = await model.findOneAndUpdate(filter, update, options);
      if (!doc) {
        return null;
      }
      return { count: doc.count };
    },
  };
}

/**
 * Increments the server-local hour and reports whether the count is still inside the cap.
 * @param hours - `suggest_hours` counter.
 * @param max - `security.maxSuggestPerHour`.
 * @param now - Clock used for the hour key. Defaults to the current local time.
 * @returns True when the stored count is still within `max`.
 * @throws {Error} When the hour document cannot be stored.
 */
export async function reserveSuggestHour(hours: SuggestHourCounter, max: number, now = new Date()): Promise<boolean> {
  // 1. Increment before any provider call, including a later provider failure.
  const count = await incrementHour(hours, suggestHourKey(now));

  // 2. A count above the cap must not call the provider.
  return count <= max;
}

/**
 * Increments one hour, retrying once when two upserts race.
 * @param hours - `suggest_hours` counter.
 * @param hour - Server-local `YYYY-MM-DDTHH` key.
 * @returns The stored count after the increment.
 * @throws {Error} When the write does not return an integer count.
 */
async function incrementHour(hours: SuggestHourCounter, hour: string): Promise<number> {
  try {
    return await writeHour(hours, hour, true);
  } catch (error) {
    if (!isDuplicateKey(error)) {
      throw error;
    }
    return writeHour(hours, hour, false);
  }
}

/**
 * Writes the increment for one hour.
 * @param hours - `suggest_hours` counter.
 * @param hour - Server-local hour key.
 * @param upsert - Create the hour document when it is missing.
 * @returns The stored count.
 * @throws {Error} When the write does not return an integer count.
 */
async function writeHour(hours: SuggestHourCounter, hour: string, upsert: boolean): Promise<number> {
  const doc = await hours.findOneAndUpdate({ hour }, { $inc: { count: 1 } }, { upsert, returnDocument: 'after' });
  if (!doc || !Number.isInteger(doc.count)) {
    throw new Error('Suggest hour was not stored.');
  }
  return doc.count;
}

/**
 * Detects a Mongo duplicate-key error, including one wrapped by Mongoose.
 * @param error - Caught write error.
 * @param depth - How many `cause` links have been followed.
 * @returns True when the code is 11000.
 */
function isDuplicateKey(error: unknown, depth = 0): boolean {
  if (depth > 3 || typeof error !== 'object' || error === null) {
    return false;
  }
  const record = error as { code?: unknown; cause?: unknown };
  if (record.code === 11000) {
    return true;
  }
  return isDuplicateKey(record.cause, depth + 1);
}
