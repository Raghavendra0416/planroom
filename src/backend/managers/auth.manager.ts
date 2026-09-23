import { type userModel } from '@/backend/models/user.model';
import type { Role, UserRecord } from '@/backend/models/types';
import { hashPassword, verifyPassword } from '@/backend/services/password';
import { UnauthenticatedError, ValidationError } from '@/backend/utils/errors';
import { duplicateEmailMessage, parseLogin, parseRegister, signInFailureMessage } from '@/backend/validation/auth';

type UserModel = ReturnType<typeof userModel>;

/**
 * Document fields the auth manager reads back. The password hash stays off `UserRecord`.
 */
interface StoredUser {
  id: string;
  email: string;
  name: string;
  role: string;
  passwordHash?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Registers teachers and checks passwords. The user model is injected.
 */
export class AuthManager {
  /**
   * @param users - User collection model, normally `userModel()`.
   */
  constructor(private readonly users: UserModel) {}

  /**
   * Creates a teacher. Any `role` on the body is ignored.
   * @param body - Register JSON with `email`, `password`, and `name`.
   * @returns The stored user without `passwordHash`.
   * @throws {ValidationError} When a field is invalid or the email already exists.
   */
  async register(body: unknown): Promise<UserRecord> {
    // 1. Check name, email, and password. Ignore any role.
    const parsed = parseRegister(body);
    if (!parsed.ok) {
      throw new ValidationError(parsed.fields);
    }

    // 2. Hash the password.
    const passwordHash = await hashPassword(parsed.value.password);

    // 3. Create a teacher. A duplicate email is a field error.
    try {
      const created = await this.users.create({
        email: parsed.value.email,
        name: parsed.value.name,
        role: 'TEACHER',
        passwordHash,
      });
      return toUserRecord(created);
    } catch (error) {
      if (isDuplicateEmail(error)) {
        throw new ValidationError({ email: duplicateEmailMessage });
      }
      throw error;
    }
  }

  /**
   * Checks an email and password.
   * @param body - Login JSON with `email` and `password`.
   * @returns The matching user without `passwordHash`.
   * @throws {UnauthenticatedError} When the email and password do not match.
   */
  async login(body: unknown): Promise<UserRecord> {
    // 1. Read the email and password.
    const parsed = parseLogin(body);
    if (!parsed) {
      throw new UnauthenticatedError(signInFailureMessage);
    }

    // 2. Load the user and verify the password.
    const existing = await this.users.findOne({ email: parsed.email });
    const passwordHash = existing?.passwordHash;
    const matched =
      typeof passwordHash === 'string' && (await verifyPassword(parsed.password, passwordHash));
    if (!existing || !matched) {
      throw new UnauthenticatedError(signInFailureMessage);
    }

    // 3. Return the account without the password hash.
    return toUserRecord(existing);
  }

  /**
   * Loads one user by id.
   * @param id - 24-hex user id from the session.
   * @returns The user, or null when the id is missing or not a user.
   */
  async getById(id: string): Promise<UserRecord | null> {
    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return null;
    }

    try {
      const existing = await this.users.findById(id);
      return existing ? toUserRecord(existing) : null;
    } catch (error) {
      if (isCastError(error)) {
        return null;
      }
      throw error;
    }
  }
}

/**
 * Copies a user document into the public record.
 * @param doc - Stored user document.
 * @returns The record without `passwordHash`.
 */
function toUserRecord(doc: StoredUser): UserRecord {
  if (doc.role !== 'TEACHER' && doc.role !== 'HOD') {
    throw new Error('Stored role is invalid.');
  }
  if (!(doc.createdAt instanceof Date) || !(doc.updatedAt instanceof Date)) {
    throw new Error('Stored user is missing timestamps.');
  }

  const role: Role = doc.role;
  return {
    id: doc.id,
    email: doc.email,
    name: doc.name,
    role,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * Detects a duplicate email from Mongo's unique index.
 * @param error - Rejection from `create`.
 * @param depth - Cause chain limit.
 * @returns True when the users unique email index rejected the write.
 */
function isDuplicateEmail(error: unknown, depth = 0): boolean {
  if (depth > 3 || !isRecord(error) || error.code !== 11000) {
    if (depth > 3 || !isRecord(error)) {
      return false;
    }
    return isDuplicateEmail(error.cause, depth + 1);
  }

  const keys = isRecord(error.keyPattern) ? error.keyPattern : isRecord(error.keyValue) ? error.keyValue : null;
  if (!keys) {
    return true;
  }
  return 'email' in keys;
}

/**
 * Detects a Mongoose cast failure for a bad id.
 * @param error - Rejection from `findById`.
 * @returns True when the value is named CastError.
 */
function isCastError(error: unknown): boolean {
  return isRecord(error) && error.name === 'CastError';
}

/**
 * Reports whether a value is a non-null object.
 * @param value - Caught error or one of its fields.
 * @returns True for objects, false for arrays and null.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
