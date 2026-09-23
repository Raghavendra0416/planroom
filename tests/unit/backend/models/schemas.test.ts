import { afterEach, describe, expect, it, vi } from 'vitest';
import { lessonPlanModel } from '@/backend/models/lesson-plan.model';
import { reviewNoteModel } from '@/backend/models/review-note.model';
import { suggestHourModel } from '@/backend/models/suggest-hour.model';
import {
  SUBJECTS,
  type Actor,
  type LessonPlanRecord,
  type NoteKind,
  type PlanInput,
  type PlanStatus,
  type ReviewNoteRecord,
  type Role,
  type Subject,
  type UserRecord,
} from '@/backend/models/types';
import { userModel } from '@/backend/models/user.model';
import { connectMongo, disconnectMongo } from '@/backend/server';
import { ConfigurationError } from '@/backend/utils/errors';
import { loadConfig, resetConfigCache } from '@/backend/utils/load-config';

type ExpectTrue<T extends true> = T;

type IndexTuple = readonly [Record<string, unknown>, { unique?: boolean }];

const recordShapes = [
  true as ExpectTrue<'passwordHash' extends keyof UserRecord ? never : true>,
  true as ExpectTrue<UserRecord['id'] extends string ? true : never>,
  true as ExpectTrue<UserRecord['role'] extends Role ? true : never>,
  true as ExpectTrue<Actor['id'] extends string ? true : never>,
  true as ExpectTrue<Actor['role'] extends Role ? true : never>,
  true as ExpectTrue<undefined extends PlanInput['title'] ? true : never>,
  true as ExpectTrue<undefined extends PlanInput['resources'] ? true : never>,
  true as ExpectTrue<undefined extends LessonPlanRecord['title'] ? true : never>,
  true as ExpectTrue<undefined extends LessonPlanRecord['resources'] ? never : true>,
  true as ExpectTrue<LessonPlanRecord['resources'] extends string ? true : never>,
  true as ExpectTrue<null extends LessonPlanRecord['deletedAt'] ? true : never>,
  true as ExpectTrue<string extends LessonPlanRecord['deletedAt'] ? true : never>,
  true as ExpectTrue<LessonPlanRecord['status'] extends PlanStatus ? true : never>,
  true as ExpectTrue<LessonPlanRecord['createdAt'] extends string ? true : never>,
  true as ExpectTrue<LessonPlanRecord['authorId'] extends string ? true : never>,
  true as ExpectTrue<NonNullable<LessonPlanRecord['subject']> extends Subject ? true : never>,
  true as ExpectTrue<ReviewNoteRecord['kind'] extends NoteKind ? true : never>,
  true as ExpectTrue<ReviewNoteRecord['createdAt'] extends string ? true : never>,
  true as ExpectTrue<ReviewNoteRecord['planId'] extends string ? true : never>,
];

function setEnv(name: 'MONGODB_URI', value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env[name];
  } else {
    env[name] = value;
  }
}

async function validationErrors(doc: {
  validate: () => Promise<unknown>;
}): Promise<Record<string, unknown> | undefined> {
  try {
    await doc.validate();
    return undefined;
  } catch (error) {
    const errors = (error as { errors?: Record<string, unknown> }).errors;
    return errors;
  }
}

function expectIndex(
  indexes: readonly IndexTuple[],
  fields: Record<string, unknown>,
  unique = false,
): void {
  const match = indexes.find(([keys]) => JSON.stringify(keys) === JSON.stringify(fields));
  expect(match, `missing index ${JSON.stringify(fields)} in ${JSON.stringify(indexes)}`).toBeDefined();
  expect(Boolean(match?.[1].unique)).toBe(unique);
}

describe('record shapes', () => {
  const previousUri = process.env.MONGODB_URI;

  afterEach(async () => {
    vi.restoreAllMocks();
    setEnv('MONGODB_URI', previousUri);
    resetConfigCache();
    await disconnectMongo();
  });

  it('keeps password hashes off user JSON and uses string ids and ISO dates', () => {
    const emptyPlan: PlanInput = {};

    expect(recordShapes.every(Boolean)).toBe(true);
    expect(emptyPlan).toEqual({});
    expect(SUBJECTS).toEqual([
      'ENGLISH',
      'MATHS',
      'SCIENCE',
      'SOCIAL_SCIENCE',
      'COMPUTER',
      'ARTS',
      'OTHER',
    ]);
  });
});

describe('user schema', () => {
  it('stores users with a unique email index and a role index', async () => {
    const model = userModel();
    const schema = model.schema;
    const indexes = schema.indexes() as IndexTuple[];

    expect(model.modelName).toBe('User');
    expect(model).toBe(userModel());
    expect(schema.options.collection).toBe('users');
    expect(schema.path('email')?.instance).toBe('String');
    expect(schema.path('email')?.options).toMatchObject({
      required: true,
      lowercase: true,
      trim: true,
    });
    expect(schema.path('name')?.options).toMatchObject({ required: true, trim: true, maxlength: 80 });
    expect(schema.path('role')?.options).toMatchObject({
      enum: ['TEACHER', 'HOD'],
      default: 'TEACHER',
    });
    expect(schema.path('passwordHash')?.options.required).toBe(true);
    expect(schema.path('createdAt')?.instance).toBe('Date');
    expect(schema.path('updatedAt')?.instance).toBe('Date');
    expect(indexes).toHaveLength(2);
    expectIndex(indexes, { email: 1 }, true);
    expectIndex(indexes, { role: 1 }, false);

    const user = new model({
      email: '  Teacher@School.edu ',
      name: '  Ada ',
      passwordHash: 'hash',
    });

    expect(user.email).toBe('teacher@school.edu');
    expect(user.name).toBe('Ada');
    expect(user.role).toBe('TEACHER');
    expect(await validationErrors(user)).toBeUndefined();
    expect(
      (await validationErrors(new model({ email: 'ada@school.edu', name: 'A'.repeat(81), passwordHash: 'hash' })))
        ?.name,
    ).toBeDefined();
    expect(
      (await validationErrors(new model({ email: 'ada@school.edu', name: 'Ada' })))?.passwordHash,
    ).toBeDefined();
  });
});

describe('lesson plan schema', () => {
  it('stores lesson plans with the spec indexes and omits empty optional text', async () => {
    const model = lessonPlanModel();
    const schema = model.schema;
    const indexes = schema.indexes() as IndexTuple[];
    const authorId = new model.base.Types.ObjectId();

    expect(model.modelName).toBe('LessonPlan');
    expect(schema.options.collection).toBe('lesson_plans');
    expect(schema.path('title')?.isRequired).not.toBe(true);
    expect(schema.path('topic')?.isRequired).not.toBe(true);
    expect(schema.path('objectives')?.isRequired).not.toBe(true);
    expect(schema.path('activities')?.isRequired).not.toBe(true);
    expect(schema.path('grade')?.isRequired).not.toBe(true);
    expect(schema.path('durationMinutes')?.isRequired).not.toBe(true);
    expect(schema.path('subject')?.isRequired).not.toBe(true);
    expect(schema.path('subject')?.options.enum).toEqual([...SUBJECTS]);
    expect(schema.path('grade')?.options).toMatchObject({ min: 6, max: 12 });
    expect(schema.path('grade')?.instance).toBe('Number');
    expect(schema.path('durationMinutes')?.instance).toBe('Number');
    expect(schema.path('resources')?.options.default).toBe('');
    expect(schema.path('status')?.options).toMatchObject({
      enum: ['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED'],
      default: 'DRAFT',
    });
    expect(schema.path('authorId')?.instance).toBe('ObjectId');
    expect(schema.path('authorId')?.options).toMatchObject({ ref: 'User', required: true });
    expect(schema.path('deletedAt')?.instance).toBe('Date');
    expect(schema.path('deletedAt')?.options.default).toBeNull();
    expect(schema.path('createdAt')?.instance).toBe('Date');
    expect(schema.path('updatedAt')?.instance).toBe('Date');
    expect(indexes).toHaveLength(4);
    expectIndex(indexes, { authorId: 1, status: 1 });
    expectIndex(indexes, { status: 1, updatedAt: -1 });
    expectIndex(indexes, { deletedAt: 1, status: 1 });
    expectIndex(indexes, { title: 'text', topic: 'text' });

    const emptyText = new model({
      authorId,
      title: '',
      topic: '',
      objectives: '',
      activities: '',
    });

    expect(emptyText.title).toBeUndefined();
    expect(emptyText.topic).toBeUndefined();
    expect(emptyText.objectives).toBeUndefined();
    expect(emptyText.activities).toBeUndefined();
    expect(emptyText.resources).toBe('');
    expect(emptyText.status).toBe('DRAFT');
    expect(emptyText.deletedAt).toBeNull();
    expect(emptyText.toObject().title).toBeUndefined();
    expect(await validationErrors(emptyText)).toBeUndefined();

    const kept = new model({ authorId, title: 'Fractions', resources: 'slate' });
    expect(kept.title).toBe('Fractions');
    expect(kept.resources).toBe('slate');
    expect((await validationErrors(new model({ authorId, grade: 5 })))?.grade).toBeDefined();
    expect((await validationErrors(new model({ authorId, grade: 13 })))?.grade).toBeDefined();
    expect((await validationErrors(new model({ authorId, grade: 6 })))?.grade).toBeUndefined();
    expect((await validationErrors(new model({ authorId, subject: 'HISTORY' })))?.subject).toBeDefined();
    expect((await validationErrors(new model({})))?.authorId).toBeDefined();
  });
});

describe('review note schema', () => {
  it('stores review notes with createdAt only and a 1000-character body', async () => {
    const model = reviewNoteModel();
    const schema = model.schema;
    const indexes = schema.indexes() as IndexTuple[];
    const planId = new model.base.Types.ObjectId();
    const authorId = new model.base.Types.ObjectId();

    expect(model.modelName).toBe('ReviewNote');
    expect(schema.options.collection).toBe('review_notes');
    expect(schema.path('planId')?.options).toMatchObject({ ref: 'LessonPlan', required: true });
    expect(schema.path('planId')?.instance).toBe('ObjectId');
    expect(schema.path('authorId')?.options).toMatchObject({ ref: 'User', required: true });
    expect(schema.path('body')?.options).toMatchObject({ required: true, maxlength: 1000 });
    expect(schema.path('kind')?.options.enum).toEqual([
      'COMMENT',
      'SUBMITTED',
      'CHANGES_REQUESTED',
      'APPROVED',
      'REOPENED',
    ]);
    expect(schema.path('kind')?.options.required).not.toBe(true);
    expect(schema.path('createdAt')?.instance).toBe('Date');
    expect(schema.path('updatedAt')).toBeUndefined();
    expect(indexes).toHaveLength(2);
    expectIndex(indexes, { planId: 1, createdAt: 1 });
    expectIndex(indexes, { authorId: 1 });

    const note = new model({ planId, authorId, body: 'Ship it.', kind: 'COMMENT' });
    expect(await validationErrors(note)).toBeUndefined();
    expect(
      (await validationErrors(new model({ planId, authorId, body: 'x'.repeat(1001), kind: 'COMMENT' })))?.body,
    ).toBeDefined();
    expect((await validationErrors(new model({ planId, authorId, body: 'x', kind: 'NOPE' })))?.kind).toBeDefined();
    expect((await validationErrors(new model({ authorId, body: 'x', kind: 'COMMENT' })))?.planId).toBeDefined();
  });
});

describe('suggest hour schema', () => {
  it('stores one integer count per YYYY-MM-DDTHH hour', async () => {
    const model = suggestHourModel();
    const schema = model.schema;
    const indexes = schema.indexes() as IndexTuple[];

    expect(model.modelName).toBe('SuggestHour');
    expect(schema.options.collection).toBe('suggest_hours');
    expect(schema.path('hour')?.instance).toBe('String');
    expect(schema.path('hour')?.options.required).toBe(true);
    expect(schema.path('count')?.instance).toBe('Number');
    expect(schema.path('count')?.options.required).toBe(true);
    expect(schema.path('createdAt')).toBeUndefined();
    expect(schema.path('updatedAt')).toBeUndefined();
    expect(indexes).toHaveLength(1);
    expectIndex(indexes, { hour: 1 }, true);

    expect(await validationErrors(new model({ hour: '2026-09-22T09', count: 2 }))).toBeUndefined();
    expect(await validationErrors(new model({ hour: '2026-09-22T09', count: 0 }))).toBeUndefined();
    expect((await validationErrors(new model({ hour: '2026-09-22T09', count: 1.5 })))?.count).toBeDefined();
    expect((await validationErrors(new model({ hour: '2026-09-22', count: 1 })))?.hour).toBeDefined();
    expect((await validationErrors(new model({ hour: '2026-09-22T9', count: 1 })))?.hour).toBeDefined();
    expect((await validationErrors(new model({ count: 1 })))?.hour).toBeDefined();
    expect((await validationErrors(new model({ hour: '2026-09-22T09' })))?.count).toBeDefined();
  });
});

describe('connectMongo', () => {
  const previousUri = process.env.MONGODB_URI;

  afterEach(async () => {
    vi.restoreAllMocks();
    setEnv('MONGODB_URI', previousUri);
    resetConfigCache();
    await disconnectMongo();
  });

  it('throws ConfigurationError when MONGODB_URI is missing and does not connect', async () => {
    const mongoose = (await import('mongoose')).default;
    const connect = vi.spyOn(mongoose, 'connect');
    setEnv('MONGODB_URI', undefined);

    await expect(connectMongo()).rejects.toBeInstanceOf(ConfigurationError);
    await expect(connectMongo()).rejects.toThrow(/MONGODB_URI/);
    expect(connect).not.toHaveBeenCalled();
    expect(mongoose.connection.readyState).toBe(0);
  });

  it('throws ConfigurationError when MONGODB_URI is blank and does not connect', async () => {
    const mongoose = (await import('mongoose')).default;
    const connect = vi.spyOn(mongoose, 'connect');

    for (const blank of ['', '   ']) {
      setEnv('MONGODB_URI', blank);
      await expect(connectMongo()).rejects.toBeInstanceOf(ConfigurationError);
    }

    expect(connect).not.toHaveBeenCalled();
    expect(mongoose.connection.readyState).toBe(0);
  });

  it('reuses one connection, lets config db.name win, and reconnects after disconnect', async () => {
    const mongoose = (await import('mongoose')).default;
    let resolveConnect: ((value: typeof mongoose) => void) | undefined;
    const gate = new Promise<typeof mongoose>((resolve) => {
      resolveConnect = resolve;
    });
    const connect = vi.spyOn(mongoose, 'connect').mockReturnValue(gate);
    const disconnect = vi.spyOn(mongoose, 'disconnect').mockResolvedValue();
    setEnv('MONGODB_URI', 'mongodb://127.0.0.1:27017/other');
    resetConfigCache();

    const first = connectMongo();
    const second = connectMongo();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(loadConfig().db.name).toBe('planroom');
    expect(connect).toHaveBeenCalledWith('mongodb://127.0.0.1:27017/other', { dbName: 'planroom' });
    resolveConnect?.(mongoose);
    await Promise.all([first, second]);

    await disconnectMongo();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(mongoose.connection.readyState).toBe(0);

    await connectMongo();
    expect(connect).toHaveBeenCalledTimes(2);
  });
});
