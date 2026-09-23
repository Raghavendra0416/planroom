import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthManager } from '@/backend/managers/auth.manager';
import { userModel } from '@/backend/models/user.model';
import { connectMongo, disconnectMongo } from '@/backend/server';
import { UnauthenticatedError, ValidationError } from '@/backend/utils/errors';

const duplicateEmail = 'That email already has an account. Sign in.';
const signInFail = 'That email and password did not match.';
const shortPassword = 'Use 8 to 72 characters.';

describe('AuthManager', () => {
  let memory: MongoMemoryServer | undefined;
  let manager!: AuthManager;
  const previousUri = process.env.MONGODB_URI;

  beforeAll(async () => {
    memory = await MongoMemoryServer.create();
    process.env.MONGODB_URI = memory.getUri();
    await connectMongo();
    await userModel().init();
    manager = new AuthManager(userModel());
  }, 180000);

  afterAll(async () => {
    try {
      await disconnectMongo();
    } finally {
      if (memory) {
        await memory.stop();
      }
      if (previousUri === undefined) {
        delete process.env.MONGODB_URI;
      } else {
        process.env.MONGODB_URI = previousUri;
      }
    }
  });

  beforeEach(async () => {
    await userModel().deleteMany({});
  });

  it('registers a teacher, trims the name, and lowercases the email', async () => {
    const user = await manager.register({
      email: ' Teacher@Planroom.demo ',
      password: 'planroom',
      name: ' Meera ',
    });

    expect(user.role).toBe('TEACHER');
    expect(user.email).toBe('teacher@planroom.demo');
    expect(user.name).toBe('Meera');
    expect(user).not.toHaveProperty('passwordHash');

    const stored = await userModel().findOne({ email: 'teacher@planroom.demo' });
    expect(stored?.role).toBe('TEACHER');
    expect(stored?.passwordHash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]+$/);
    expect(await userModel().countDocuments()).toBe(1);
  });

  it('rejects a duplicate email and does not create a second user', async () => {
    await manager.register({
      email: 'teacher@planroom.demo',
      password: 'planroom',
      name: 'Meera',
    });

    const error = await manager
      .register({
        email: 'Teacher@planroom.demo',
        password: 'anotherpass',
        name: 'Someone',
      })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(ValidationError);
    if (error instanceof ValidationError) {
      expect(error.fields.email).toBe(duplicateEmail);
      expect(error.message).toBe(duplicateEmail);
    }
    expect(await userModel().countDocuments()).toBe(1);
  });

  it('rejects a short password and does not create a user', async () => {
    const error = await manager
      .register({
        email: 'teacher@planroom.demo',
        password: 'short',
        name: 'Meera',
      })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(ValidationError);
    if (error instanceof ValidationError) {
      expect(error.fields.password).toBe(shortPassword);
    }
    expect(await userModel().countDocuments()).toBe(0);
  });

  it('rejects an empty name, a bad email, and a too-long password without creating a user', async () => {
    const cases = [
      {
        body: { email: 'teacher@planroom.demo', password: 'planroom', name: '   ' },
        field: 'name',
        message: 'Enter a name.',
      },
      {
        body: { email: 'teacher@planroom', password: 'planroom', name: 'Meera' },
        field: 'email',
        message: 'Enter an email address.',
      },
      {
        body: { email: 'not-an-email', password: 'planroom', name: 'Meera' },
        field: 'email',
        message: 'Enter an email address.',
      },
      {
        body: { email: 'teacher@planroom.demo', password: 'x'.repeat(73), name: 'Meera' },
        field: 'password',
        message: 'Use 8 to 72 characters.',
      },
    ];

    for (const entry of cases) {
      const error = await manager.register(entry.body).then(
        () => undefined,
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(ValidationError);
      if (error instanceof ValidationError) {
        expect(error.fields[entry.field]).toBe(entry.message);
      }
    }

    expect(await userModel().countDocuments()).toBe(0);
  });

  it('signs in with the right password and rejects the wrong one', async () => {
    await manager.register({
      email: 'teacher@planroom.demo',
      password: 'planroom',
      name: 'Meera',
    });

    const signedIn = await manager.login({
      email: ' Teacher@Planroom.demo ',
      password: 'planroom',
    });

    expect(signedIn.email).toBe('teacher@planroom.demo');
    expect(signedIn.role).toBe('TEACHER');
    expect(signedIn.name).toBe('Meera');

    const failure = await manager
      .login({
        email: 'teacher@planroom.demo',
        password: 'not-the-password',
      })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );

    expect(failure).toBeInstanceOf(UnauthenticatedError);
    if (failure instanceof UnauthenticatedError) {
      expect(failure.message).toBe(signInFail);
    }

    const unknown = await manager
      .login({
        email: 'missing@planroom.demo',
        password: 'planroom',
      })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );

    expect(unknown).toBeInstanceOf(UnauthenticatedError);
    if (unknown instanceof UnauthenticatedError) {
      expect(unknown.message).toBe(signInFail);
    }
  });

  it('creates a teacher when the body sends role HOD', async () => {
    const user = await manager.register({
      email: 'new@planroom.demo',
      password: 'planroom',
      name: 'Meera',
      role: 'HOD',
    });

    expect(user.role).toBe('TEACHER');
    const stored = await userModel().findById(user.id);
    expect(stored?.role).toBe('TEACHER');
  });

  it('loads a user by id and returns null when the id is missing', async () => {
    const user = await manager.register({
      email: 'teacher@planroom.demo',
      password: 'planroom',
      name: 'Meera',
    });

    await expect(manager.getById(user.id)).resolves.toMatchObject({
      id: user.id,
      email: 'teacher@planroom.demo',
      role: 'TEACHER',
    });
    await expect(manager.getById('0'.repeat(24))).resolves.toBeNull();
    await expect(manager.getById('not-an-id')).resolves.toBeNull();
  });
});
