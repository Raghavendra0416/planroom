import mongoose from 'mongoose';
import { ConfigurationError } from '@/backend/utils/errors';
import { loadConfig } from '@/backend/utils/load-config';

let pending: Promise<typeof mongoose> | null = null;
let needsClose = false;

/**
 * Opens or reuses the shared MongoDB connection, using `loadConfig().db.name` as the database.
 * @returns The connected Mongoose singleton.
 * @throws {ConfigurationError} When `MONGODB_URI` is missing or blank.
 */
export async function connectMongo(): Promise<typeof mongoose> {
  const uri = readMongoUri();

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (pending) {
    return pending;
  }

  const dbName = loadConfig().db.name;
  needsClose = true;
  const attempt = mongoose.connect(uri, { dbName }).then(
    (connected) => {
      if (pending === attempt) {
        pending = null;
      }
      return connected;
    },
    (error: unknown) => {
      if (pending === attempt) {
        pending = null;
      }
      throw error;
    },
  );
  pending = attempt;
  return attempt;
}

/**
 * Closes the shared MongoDB connection so a later connect can open a new one.
 * @returns A promise that settles when the singleton is closed.
 */
export async function disconnectMongo(): Promise<void> {
  const current = pending;
  pending = null;
  const close = needsClose || mongoose.connection.readyState !== 0;
  needsClose = false;

  if (current) {
    try {
      await current;
    } catch {
      // The attempt failed. Still close a socket it may have opened.
    }
  }

  if (close) {
    await mongoose.disconnect();
  }
}

/**
 * Reads a non-blank MongoDB URI from the environment.
 * @returns The trimmed `MONGODB_URI`.
 * @throws {ConfigurationError} When `MONGODB_URI` is missing or blank.
 */
function readMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (typeof uri !== 'string' || uri.trim() === '') {
    throw new ConfigurationError('MONGODB_URI is required.');
  }
  return uri.trim();
}
