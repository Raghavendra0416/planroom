import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PlanManager } from '@/backend/managers/plan.manager';
import { ReviewManager } from '@/backend/managers/review.manager';
import { lessonPlanModel } from '@/backend/models/lesson-plan.model';
import { reviewNoteModel } from '@/backend/models/review-note.model';
import type { Actor, PlanInput, Subject } from '@/backend/models/types';
import { connectMongo, disconnectMongo } from '@/backend/server';
import { ForbiddenError, NotFoundError, ValidationError } from '@/backend/utils/errors';
import { completePlanSchema, draftPlanSchema } from '@/backend/validation/plan';

const completePlan: PlanInput & { subject: Subject } = {
  title: 'Fractions on a line',
  subject: 'MATHS',
  grade: 6,
  durationMinutes: 45,
  topic: 'Adding fractions',
  objectives: 'Add halves and quarters.',
  activities: 'Worked examples on the slate.',
  resources: 'Slate',
};

const draftRejections: Array<[string, unknown, string]> = [
  ['title', 'ab', 'Title must be 3 to 80 characters.'],
  ['title', 'a'.repeat(81), 'Title must be 3 to 80 characters.'],
  ['subject', 'HISTORY', 'Choose a subject.'],
  ['grade', 5, 'Grade must be from 6 to 12.'],
  ['grade', 13, 'Grade must be from 6 to 12.'],
  ['grade', 6.5, 'Grade must be from 6 to 12.'],
  ['durationMinutes', 10, 'Duration must be 15 to 120 minutes, in steps of 5.'],
  ['durationMinutes', 16, 'Duration must be 15 to 120 minutes, in steps of 5.'],
  ['durationMinutes', 125, 'Duration must be 15 to 120 minutes, in steps of 5.'],
  ['topic', 'ab', 'Topic must be 3 to 120 characters.'],
  ['topic', 'a'.repeat(121), 'Topic must be 3 to 120 characters.'],
  ['objectives', '', 'Objectives must be 1 to 2000 characters.'],
  ['objectives', 'a'.repeat(2001), 'Objectives must be 1 to 2000 characters.'],
  ['activities', '', 'Activities must be 1 to 4000 characters.'],
  ['activities', 'a'.repeat(4001), 'Activities must be 1 to 4000 characters.'],
  ['resources', 'x'.repeat(2001), 'Resources must be at most 2000 characters.'],
];

function actor(role: Actor['role'], name: string): Actor {
  return {
    id: new mongoose.Types.ObjectId().toHexString(),
    role,
    email: `${name}@school.edu`,
    name,
  };
}

function managers(): { plans: PlanManager; reviews: ReviewManager } {
  return {
    plans: new PlanManager(lessonPlanModel(), reviewNoteModel()),
    reviews: new ReviewManager(lessonPlanModel(), reviewNoteModel()),
  };
}

async function rawPlan(id: string): Promise<Record<string, unknown> | null> {
  const doc = await lessonPlanModel().collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
  return doc;
}

describe('plan schemas', () => {
  it.each(draftRejections)('rejects a draft %s that does not fit', (field, value, message) => {
    const result = draftPlanSchema.safeParse({ [field]: value });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === field && issue.message === message)).toBe(true);
    }
  });

  it('accepts a draft boundary and strips owner fields', () => {
    const parsed = draftPlanSchema.parse({
      title: 'a'.repeat(80),
      subject: 'SOCIAL_SCIENCE',
      grade: 12,
      durationMinutes: 120,
      topic: 'b'.repeat(120),
      objectives: 'c'.repeat(2000),
      activities: 'd'.repeat(4000),
      resources: 'e'.repeat(2000),
      authorId: 'other-author',
      status: 'APPROVED',
      deletedAt: new Date(),
      intent: 'submit',
    });

    expect(parsed).toEqual({
      title: 'a'.repeat(80),
      subject: 'SOCIAL_SCIENCE',
      grade: 12,
      durationMinutes: 120,
      topic: 'b'.repeat(120),
      objectives: 'c'.repeat(2000),
      activities: 'd'.repeat(4000),
      resources: 'e'.repeat(2000),
    });
    expect(parsed).not.toHaveProperty('authorId');
    expect(parsed).not.toHaveProperty('status');
    expect(parsed).not.toHaveProperty('deletedAt');
  });

  it('requires a complete plan and defaults omitted resources to an empty string', () => {
    const missing = completePlanSchema.safeParse({});

    expect(missing.success).toBe(false);
    if (!missing.success) {
      const fields = Object.fromEntries(
        missing.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
      );
      expect(fields.title).toBe('Title must be 3 to 80 characters.');
      expect(fields.subject).toBe('Choose a subject.');
      expect(fields.grade).toBe('Grade must be from 6 to 12.');
      expect(fields.durationMinutes).toBe('Duration must be 15 to 120 minutes, in steps of 5.');
      expect(fields.topic).toBe('Topic must be 3 to 120 characters.');
      expect(fields.objectives).toBe('Objectives must be 1 to 2000 characters.');
      expect(fields.activities).toBe('Activities must be 1 to 4000 characters.');
      expect(fields.resources).toBeUndefined();
    }

    const { resources, ...withoutResources } = completePlan;
    expect(resources).toBe('Slate');
    const parsed = completePlanSchema.parse({
      ...withoutResources,
      authorId: 'other-author',
      status: 'DRAFT',
      deletedAt: null,
    });

    expect(parsed).toEqual({ ...withoutResources, resources: '' });
    expect(parsed).not.toHaveProperty('authorId');
    expect(parsed).not.toHaveProperty('status');
    expect(parsed).not.toHaveProperty('deletedAt');
  });
});

describe('plan manager', () => {
  const previousUri = process.env.MONGODB_URI;
  let memory: MongoMemoryServer | undefined;

  beforeAll(async () => {
    memory = await MongoMemoryServer.create();
    process.env.MONGODB_URI = memory.getUri();
    await connectMongo();
  }, 180_000);

  afterAll(async () => {
    await disconnectMongo();
    await memory?.stop();
    if (previousUri === undefined) {
      delete process.env.MONGODB_URI;
    } else {
      process.env.MONGODB_URI = previousUri;
    }
  });

  beforeEach(async () => {
    await lessonPlanModel().deleteMany({});
    await reviewNoteModel().deleteMany({});
  });

  it('rejects a teacher approve and leaves the plan submitted with no approval note', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const { plans, reviews } = managers();
    const created = await plans.create(teacher, { ...completePlan, intent: 'submit' });

    await expect(reviews.approve(teacher, created.id)).rejects.toBeInstanceOf(ForbiddenError);

    const stored = await lessonPlanModel().findById(created.id).lean();
    expect(stored?.status).toBe('SUBMITTED');
    expect(await reviewNoteModel().countDocuments({ planId: created.id, kind: 'APPROVED' })).toBe(0);
  });

  it('returns a submitted plan to draft when the owner edits it and writes no note', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const { plans } = managers();
    const created = await plans.create(teacher, { ...completePlan, intent: 'submit' });
    const before = await reviewNoteModel().countDocuments({ planId: created.id });

    const saved = await plans.save(teacher, created.id, { title: 'A different title' });

    expect(saved.status).toBe('DRAFT');
    expect(saved.title).toBe('A different title');
    expect(saved.objectives).toBeUndefined();
    const stored = await lessonPlanModel().findById(created.id).lean();
    expect(stored?.status).toBe('DRAFT');
    expect(stored?.title).toBe('A different title');
    expect(await reviewNoteModel().countDocuments({ planId: created.id })).toBe(before);
  });

  it('rejects a submitted edit with a bad field and keeps the plan submitted', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const { plans } = managers();
    const created = await plans.create(teacher, { ...completePlan, intent: 'submit' });

    const caught = await plans.save(teacher, created.id, { title: 'A' }).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ValidationError);
    const stored = await lessonPlanModel().findById(created.id).lean();
    expect(stored?.status).toBe('SUBMITTED');
    expect(stored?.title).toBe(completePlan.title);
  });

  it('rejects a submitted edit from a non-owner and an HOD', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const other = actor('TEACHER', 'Bea');
    const hod = actor('HOD', 'Hale');
    const { plans } = managers();
    const created = await plans.create(teacher, { ...completePlan, intent: 'submit' });

    await expect(plans.save(other, created.id, { title: 'Bea rewrite' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(plans.save(hod, created.id, { title: 'HOD rewrite' })).rejects.toBeInstanceOf(ForbiddenError);

    const stored = await lessonPlanModel().findById(created.id).lean();
    expect(stored?.status).toBe('SUBMITTED');
    expect(stored?.title).toBe(completePlan.title);
  });

  it('rejects an approved edit from the owner and keeps the plan approved', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const hod = actor('HOD', 'Hale');
    const { plans, reviews } = managers();
    const created = await plans.create(teacher, { ...completePlan, intent: 'submit' });
    await reviews.approve(hod, created.id);

    await expect(plans.save(teacher, created.id, { title: 'After approval' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    const stored = await lessonPlanModel().findById(created.id).lean();
    expect(stored?.status).toBe('APPROVED');
    expect(stored?.title).toBe(completePlan.title);
  });

  it('rejects an HOD create and stores no plan', async () => {
    const hod = actor('HOD', 'Hale');
    const { plans } = managers();

    const caught = await plans.create(hod, { title: 'HOD draft' }).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ForbiddenError);
    expect(await lessonPlanModel().countDocuments()).toBe(0);
  });

  it('rejects an HOD approving a teacher plan authored by the HOD id and leaves it submitted', async () => {
    const teacher = actor('TEACHER', 'Tess');
    const hod = actor('HOD', 'Hale');
    const { plans, reviews } = managers();
    const created = await plans.create(teacher, { ...completePlan, intent: 'submit' });
    await lessonPlanModel().updateOne({ _id: created.id }, { $set: { authorId: hod.id } });

    await expect(reviews.approve(hod, created.id)).rejects.toBeInstanceOf(ForbiddenError);

    const stored = await lessonPlanModel().findById(created.id).lean();
    expect(stored?.status).toBe('SUBMITTED');
    expect(await reviewNoteModel().countDocuments({ planId: created.id, kind: 'APPROVED' })).toBe(0);
  });

  it('excludes another teacher from the list and shows every non-deleted plan to an HOD', async () => {
    const ada = actor('TEACHER', 'Ada');
    const bea = actor('TEACHER', 'Bea');
    const hod = actor('HOD', 'Hale');
    const { plans } = managers();
    const adaPlan = await plans.create(ada, { title: 'Ada rivers' });
    const beaPlan = await plans.create(bea, { title: 'Bea poems' });

    const adaList = await plans.list(ada, {});
    const hodList = await plans.list(hod, {});

    expect(adaList.map((plan) => plan.id)).toEqual([adaPlan.id]);
    expect(hodList.map((plan) => plan.id).sort()).toEqual([adaPlan.id, beaPlan.id].sort());
  });

  it('does not list a soft-deleted plan', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const hod = actor('HOD', 'Hale');
    const { plans } = managers();
    const created = await plans.create(teacher, { title: 'Keep me out' });

    await plans.remove(teacher, created.id);

    expect(await plans.list(teacher, {})).toEqual([]);
    expect(await plans.list(hod, { q: 'Keep' })).toEqual([]);
    await expect(plans.get(teacher, created.id)).rejects.toThrow('That page is not here.');
  });

  it('lets a draft save omit objectives and unsets the omitted fields', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const { plans } = managers();
    const created = await plans.create(teacher, completePlan);

    const saved = await plans.save(teacher, created.id, { title: 'Fractions on a line' });

    expect(saved.status).toBe('DRAFT');
    expect(saved.title).toBe('Fractions on a line');
    expect(saved.objectives).toBeUndefined();
    expect(saved.subject).toBeUndefined();
    expect(saved.activities).toBeUndefined();
    expect(saved.grade).toBeUndefined();
    expect(saved.durationMinutes).toBeUndefined();
    expect(saved.topic).toBeUndefined();
    expect(saved.resources).toBe('');
    expect(saved.authorId).toBe(teacher.id);
    const raw = await rawPlan(created.id);
    expect(raw?.objectives).toBeUndefined();
    expect(raw?.status).toBe('DRAFT');
    expect(raw?.resources).toBeUndefined();
  });

  it('rejects a present title of 1 character and does not store it', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const { plans } = managers();
    const created = await plans.create(teacher, { title: 'Maps of rivers' });

    const caught = await plans.save(teacher, created.id, { title: 'A' }).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught).toMatchObject({ fields: { title: 'Title must be 3 to 80 characters.' } });
    const stored = await lessonPlanModel().findById(created.id).lean();
    expect(stored?.title).toBe('Maps of rivers');
  });

  it('does not leave a plan when save and submit is incomplete', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const { plans } = managers();

    const caught = await plans
      .create(teacher, { intent: 'submit', title: 'Fractions' })
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ValidationError);
    expect(await lessonPlanModel().countDocuments()).toBe(0);
    expect(await reviewNoteModel().countDocuments()).toBe(0);
  });

  it('does not store a one-character title on create', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const { plans } = managers();

    const caught = await plans.create(teacher, { title: 'A' }).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught).toMatchObject({ fields: { title: 'Title must be 3 to 80 characters.' } });
    expect(await lessonPlanModel().countDocuments()).toBe(0);
  });

  it('creates a draft for the actor and ignores a client author and status', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const { plans } = managers();
    const otherId = new mongoose.Types.ObjectId().toHexString();

    const created = await plans.create(teacher, {
      title: 'Maps of rivers',
      authorId: otherId,
      status: 'APPROVED',
      deletedAt: new Date(),
    });

    expect(created.status).toBe('DRAFT');
    expect(created.authorId).toBe(teacher.id);
    expect(created.deletedAt).toBeNull();
    expect(created.resources).toBe('');
    expect(typeof created.createdAt).toBe('string');
    expect(typeof created.updatedAt).toBe('string');
  });

  it('submits a complete new plan and stores one submitted note', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const { plans } = managers();

    const created = await plans.create(teacher, { ...completePlan, intent: 'submit' });

    expect(created.status).toBe('SUBMITTED');
    expect(created.authorId).toBe(teacher.id);
    const notes = await reviewNoteModel().find({ planId: created.id }).lean();
    expect(notes).toHaveLength(1);
    expect(notes[0]?.kind).toBe('SUBMITTED');
    expect(notes[0]?.body).toBe('Submitted for review.');
    expect(notes[0]?.authorId.toString()).toBe(teacher.id);
  });

  it('leaves an incomplete existing draft unsubmitted and writes no note', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const { plans } = managers();
    const created = await plans.create(teacher, { title: 'Only a title here' });

    await expect(plans.submit(teacher, created.id)).rejects.toBeInstanceOf(ValidationError);

    const stored = await lessonPlanModel().findById(created.id).lean();
    expect(stored?.status).toBe('DRAFT');
    expect(stored?.title).toBe('Only a title here');
    expect(await reviewNoteModel().countDocuments({ planId: created.id })).toBe(0);
  });

  it('rejects a sent-back save that is incomplete and keeps the stored plan', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const hod = actor('HOD', 'Hale');
    const { plans, reviews } = managers();
    const created = await plans.create(teacher, { ...completePlan, intent: 'submit' });
    await reviews.requestChanges(hod, created.id, 'Add a check for understanding.');

    await expect(plans.save(teacher, created.id, { title: 'Still incomplete' })).rejects.toBeInstanceOf(
      ValidationError,
    );

    const stored = await lessonPlanModel().findById(created.id).lean();
    expect(stored?.status).toBe('CHANGES_REQUESTED');
    expect(stored?.title).toBe(completePlan.title);
    expect(stored?.objectives).toBe(completePlan.objectives);
  });

  it('keeps sent-back status when the owner saves a complete plan', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const hod = actor('HOD', 'Hale');
    const { plans, reviews } = managers();
    const created = await plans.create(teacher, { ...completePlan, intent: 'submit' });
    await reviews.requestChanges(hod, created.id, 'Add a check for understanding.');
    const before = await reviewNoteModel().countDocuments({ planId: created.id });

    const saved = await plans.save(teacher, created.id, { ...completePlan, title: 'Fractions revised' });

    expect(saved.status).toBe('CHANGES_REQUESTED');
    expect(saved.title).toBe('Fractions revised');
    expect(await reviewNoteModel().countDocuments({ planId: created.id })).toBe(before);
  });

  it('ignores a client authorId on save', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const { plans } = managers();
    const created = await plans.create(teacher, completePlan);
    const otherId = new mongoose.Types.ObjectId().toHexString();

    const saved = await plans.save(teacher, created.id, {
      ...completePlan,
      authorId: otherId,
      status: 'APPROVED',
      deletedAt: new Date(),
    });

    expect(saved.authorId).toBe(teacher.id);
    expect(saved.status).toBe('DRAFT');
    expect(saved.deletedAt).toBeNull();
  });

  it('rejects an HOD edit of another user plan and leaves the body', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const hod = actor('HOD', 'Hale');
    const { plans } = managers();
    const created = await plans.create(teacher, { title: 'Ada draft title' });

    await expect(plans.save(hod, created.id, { title: 'HOD rewrite' })).rejects.toBeInstanceOf(ForbiddenError);

    const stored = await lessonPlanModel().findById(created.id).lean();
    expect(stored?.title).toBe('Ada draft title');
  });

  it('forbids a teacher from opening someone else plan', async () => {
    const ada = actor('TEACHER', 'Ada');
    const bea = actor('TEACHER', 'Bea');
    const hod = actor('HOD', 'Hale');
    const { plans } = managers();
    const created = await plans.create(ada, completePlan);

    await expect(plans.get(bea, created.id)).rejects.toThrow('You cannot open this plan.');

    const opened = await plans.get(hod, created.id);
    expect(opened.id).toBe(created.id);
    expect(opened.objectives).toBe(completePlan.objectives);
  });

  it('uses the not-found sentence for a missing plan', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const { plans } = managers();
    const missingId = new mongoose.Types.ObjectId().toHexString();

    await expect(plans.get(teacher, missingId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(plans.get(teacher, missingId)).rejects.toThrow('That page is not here.');
    await expect(plans.get(teacher, 'not-an-id')).rejects.toThrow('That page is not here.');
  });

  it('matches an escaped case-insensitive substring of title or topic and ignores an empty query', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const { plans } = managers();
    const dotted = await plans.create(teacher, { title: 'a.b', topic: 'Literal dot' });
    await plans.create(teacher, { title: 'axb', topic: 'Not the dot' });
    await plans.create(teacher, { title: 'River maps', topic: 'Estuaries' });

    const byTitle = await plans.list(teacher, { q: 'A.B' });
    const byTopic = await plans.list(teacher, { q: 'estuar' });
    const all = await plans.list(teacher, { q: '' });

    expect(byTitle.map((plan) => plan.id)).toEqual([dotted.id]);
    expect(byTopic.map((plan) => plan.title)).toEqual(['River maps']);
    expect(all).toHaveLength(3);
  });

  it('sorts newest first and falls back to updatedAt', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const { plans } = managers();
    const older = await plans.create(teacher, { title: 'Older title' });
    const newer = await plans.create(teacher, { title: 'Newer title' });
    await lessonPlanModel().collection.updateOne(
      { _id: new mongoose.Types.ObjectId(older.id) },
      {
        $set: {
          createdAt: new Date('2020-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        },
      },
    );
    await lessonPlanModel().collection.updateOne(
      { _id: new mongoose.Types.ObjectId(newer.id) },
      {
        $set: {
          createdAt: new Date('2021-01-01T00:00:00.000Z'),
          updatedAt: new Date('2023-01-01T00:00:00.000Z'),
        },
      },
    );

    const byUpdated = await plans.list(teacher, {});
    const byCreated = await plans.list(teacher, { sort: 'createdAt' });
    const fallback = await plans.list(teacher, { sort: 'title' });

    expect(byUpdated.map((plan) => plan.id)).toEqual([older.id, newer.id]);
    expect(byCreated.map((plan) => plan.id)).toEqual([newer.id, older.id]);
    expect(fallback.map((plan) => plan.id)).toEqual([older.id, newer.id]);
  });

  it('filters list rows by status, subject, and grade without leaving the actor scope', async () => {
    const ada = actor('TEACHER', 'Ada');
    const bea = actor('TEACHER', 'Bea');
    const { plans } = managers();
    await plans.create(ada, { title: 'Ada draft', subject: 'ENGLISH', grade: 7 });
    const submitted = await plans.create(ada, { ...completePlan, intent: 'submit' });
    await plans.create(bea, { ...completePlan, title: 'Bea submitted plan', intent: 'submit' });

    const onlySubmitted = await plans.list(ada, { status: 'SUBMITTED', subject: 'MATHS', grade: '6' });

    expect(onlySubmitted.map((plan) => plan.id)).toEqual([submitted.id]);
  });

  it('lets a teacher remove their own unapproved plan and lets an HOD remove an approved one', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const other = actor('TEACHER', 'Bea');
    const hod = actor('HOD', 'Hale');
    const { plans, reviews } = managers();
    const draft = await plans.create(teacher, { title: 'Removable draft' });
    const approved = await plans.create(teacher, { ...completePlan, title: 'Approved plan', intent: 'submit' });
    await reviews.approve(hod, approved.id);

    await expect(plans.remove(other, draft.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(plans.remove(teacher, approved.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await lessonPlanModel().findById(approved.id).lean())?.deletedAt).toBeNull();

    const removed = await plans.remove(hod, approved.id);
    expect(typeof removed.deletedAt).toBe('string');
    await plans.remove(teacher, draft.id);
    await expect(plans.get(hod, approved.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await plans.list(teacher, {})).toEqual([]);
  });

  it('lets an HOD comment without changing status and refuses a teacher comment', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const hod = actor('HOD', 'Hale');
    const { plans, reviews } = managers();
    const created = await plans.create(teacher, completePlan);

    const note = await reviews.comment(hod, created.id, '  Looks fine. ');

    expect(note.kind).toBe('COMMENT');
    expect(note.body).toBe('Looks fine.');
    expect(note.authorId).toBe(hod.id);
    expect(note.authorName).toBe('Hale');
    expect(note.authorRole).toBe('HOD');
    expect(note.planId).toBe(created.id);
    expect((await plans.get(teacher, created.id)).status).toBe('DRAFT');
    await expect(reviews.comment(teacher, created.id, 'Hello')).rejects.toBeInstanceOf(ForbiddenError);
    expect(await reviewNoteModel().countDocuments({ planId: created.id })).toBe(1);
  });

  it('refuses an empty or oversized comment and stores nothing', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const hod = actor('HOD', 'Hale');
    const { plans, reviews } = managers();
    const created = await plans.create(teacher, { title: 'Comment target' });

    const empty = await reviews.comment(hod, created.id, '   ').catch((error: unknown) => error);
    const long = await reviews.comment(hod, created.id, 'a'.repeat(1001)).catch((error: unknown) => error);

    expect(empty).toBeInstanceOf(ValidationError);
    expect(empty).toMatchObject({ fields: { note: 'Write a note first.' } });
    expect(long).toBeInstanceOf(ValidationError);
    expect(long).toMatchObject({ fields: { note: 'A note must be at most 1000 characters.' } });
    expect(await reviewNoteModel().countDocuments({ planId: created.id })).toBe(0);
    expect((await lessonPlanModel().findById(created.id).lean())?.status).toBe('DRAFT');
  });

  it('returns notes oldest first after the same read check as get', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const other = actor('TEACHER', 'Bea');
    const hod = actor('HOD', 'Hale');
    const { plans, reviews } = managers();
    const created = await plans.create(teacher, completePlan);
    const first = await reviews.comment(hod, created.id, 'First note');
    const second = await reviews.comment(hod, created.id, 'Second note');
    await reviewNoteModel().collection.updateOne(
      { _id: new mongoose.Types.ObjectId(first.id) },
      { $set: { createdAt: new Date('2020-01-01T00:00:00.000Z') } },
    );
    await reviewNoteModel().collection.updateOne(
      { _id: new mongoose.Types.ObjectId(second.id) },
      { $set: { createdAt: new Date('2021-01-01T00:00:00.000Z') } },
    );

    const notes = await reviews.listNotes(teacher, created.id);

    expect(notes.map((note) => note.body)).toEqual(['First note', 'Second note']);
    expect(notes.every((note) => note.kind === 'COMMENT')).toBe(true);
    await expect(reviews.listNotes(other, created.id)).rejects.toThrow('You cannot open this plan.');
    await plans.remove(teacher, created.id);
    await expect(reviews.listNotes(hod, created.id)).rejects.toThrow('That page is not here.');
  });

  it('refuses teacher request-changes and reopen attempts', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const hod = actor('HOD', 'Hale');
    const { plans, reviews } = managers();
    const submitted = await plans.create(teacher, { ...completePlan, intent: 'submit' });
    await expect(reviews.requestChanges(teacher, submitted.id, 'No.')).rejects.toBeInstanceOf(ForbiddenError);
    await reviews.approve(hod, submitted.id);
    await expect(reviews.reopen(teacher, submitted.id, 'Again.')).rejects.toBeInstanceOf(ForbiddenError);
    const stored = await lessonPlanModel().findById(submitted.id).lean();
    expect(stored?.status).toBe('APPROVED');
    expect(await reviewNoteModel().countDocuments({ planId: submitted.id, kind: 'REOPENED' })).toBe(0);
    expect(await reviewNoteModel().countDocuments({ planId: submitted.id, kind: 'CHANGES_REQUESTED' })).toBe(0);
  });
});
