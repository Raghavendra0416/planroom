import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PlanManager } from '@/backend/managers/plan.manager';
import { ReviewManager } from '@/backend/managers/review.manager';
import { lessonPlanModel } from '@/backend/models/lesson-plan.model';
import { reviewNoteModel } from '@/backend/models/review-note.model';
import type { Actor, PlanInput, Subject } from '@/backend/models/types';
import { connectMongo, disconnectMongo } from '@/backend/server';
import { ConflictError, ValidationError } from '@/backend/utils/errors';

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

describe('status machine', () => {
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
    vi.restoreAllMocks();
    await lessonPlanModel().deleteMany({});
    await reviewNoteModel().deleteMany({});
  });

  it('does not let a draft jump to approved and writes no note', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const hod = actor('HOD', 'Hale');
    const { plans, reviews } = managers();
    const created = await plans.create(teacher, { title: 'Draft only title' });

    await expect(reviews.approve(hod, created.id)).rejects.toBeInstanceOf(ConflictError);

    const stored = await lessonPlanModel().findById(created.id).lean();
    expect(stored?.status).toBe('DRAFT');
    expect(await reviewNoteModel().countDocuments({ planId: created.id })).toBe(0);
  });

  it('approves a submitted plan and stores the approval note', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const hod = actor('HOD', 'Hale');
    const { plans, reviews } = managers();
    const created = await plans.create(teacher, { ...completePlan, intent: 'submit' });

    const approved = await reviews.approve(hod, created.id);

    expect(approved.status).toBe('APPROVED');
    const notes = await reviewNoteModel().find({ planId: created.id, kind: 'APPROVED' }).lean();
    expect(notes).toHaveLength(1);
    expect(notes[0]?.body).toBe('This plan is approved.');
    expect(notes[0]?.authorId.toString()).toBe(hod.id);
  });

  it('sends a submitted plan back with the trimmed note', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const hod = actor('HOD', 'Hale');
    const { plans, reviews } = managers();
    const created = await plans.create(teacher, { ...completePlan, intent: 'submit' });

    const sentBack = await reviews.requestChanges(hod, created.id, '  Add an exit ticket.  ');

    expect(sentBack.status).toBe('CHANGES_REQUESTED');
    const notes = await reviewNoteModel().find({ planId: created.id, kind: 'CHANGES_REQUESTED' }).lean();
    expect(notes).toHaveLength(1);
    expect(notes[0]?.body).toBe('Add an exit ticket.');
    expect(notes[0]?.authorId.toString()).toBe(hod.id);
  });

  it('rejects submit from approved and writes no note', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const hod = actor('HOD', 'Hale');
    const { plans, reviews } = managers();
    const created = await plans.create(teacher, { ...completePlan, intent: 'submit' });
    await reviews.approve(hod, created.id);
    const before = await reviewNoteModel().countDocuments({ planId: created.id });

    await expect(plans.submit(teacher, created.id)).rejects.toBeInstanceOf(ConflictError);

    expect(await reviewNoteModel().countDocuments({ planId: created.id })).toBe(before);
    const stored = await lessonPlanModel().findById(created.id).lean();
    expect(stored?.status).toBe('APPROVED');
  });

  it('does not let a sent-back plan jump to approved and writes no note', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const hod = actor('HOD', 'Hale');
    const { plans, reviews } = managers();
    const created = await plans.create(teacher, { ...completePlan, intent: 'submit' });
    await reviews.requestChanges(hod, created.id, 'Name the success check.');
    const before = await reviewNoteModel().countDocuments({ planId: created.id });

    await expect(reviews.approve(hod, created.id)).rejects.toBeInstanceOf(ConflictError);

    expect(await reviewNoteModel().countDocuments({ planId: created.id })).toBe(before);
    const stored = await lessonPlanModel().findById(created.id).lean();
    expect(stored?.status).toBe('CHANGES_REQUESTED');
    expect(await reviewNoteModel().countDocuments({ planId: created.id, kind: 'APPROVED' })).toBe(0);
  });

  it('reopens an approved plan into sent back and stores the trimmed note', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const hod = actor('HOD', 'Hale');
    const { plans, reviews } = managers();
    const created = await plans.create(teacher, { ...completePlan, intent: 'submit' });
    await reviews.approve(hod, created.id);

    const reopened = await reviews.reopen(hod, created.id, '  Add a plenary. ');

    expect(reopened.status).toBe('CHANGES_REQUESTED');
    const notes = await reviewNoteModel().find({ planId: created.id, kind: 'REOPENED' }).lean();
    expect(notes).toHaveLength(1);
    expect(notes[0]?.body).toBe('Add a plenary.');
  });

  it('submits a sent-back plan and stores a second submitted note', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const hod = actor('HOD', 'Hale');
    const { plans, reviews } = managers();
    const created = await plans.create(teacher, { ...completePlan, intent: 'submit' });
    await reviews.requestChanges(hod, created.id, 'Shorten the starter.');

    const submitted = await plans.submit(teacher, created.id);

    expect(submitted.status).toBe('SUBMITTED');
    const notes = await reviewNoteModel().find({ planId: created.id, kind: 'SUBMITTED' }).lean();
    expect(notes).toHaveLength(2);
    expect(notes.every((note) => note.body === 'Submitted for review.')).toBe(true);
  });

  it('rejects request changes from draft and writes no note', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const hod = actor('HOD', 'Hale');
    const { plans, reviews } = managers();
    const created = await plans.create(teacher, completePlan);

    await expect(reviews.requestChanges(hod, created.id, 'Not yet.')).rejects.toBeInstanceOf(ConflictError);

    const stored = await lessonPlanModel().findById(created.id).lean();
    expect(stored?.status).toBe('DRAFT');
    expect(await reviewNoteModel().countDocuments({ planId: created.id })).toBe(0);
  });

  it('refuses an empty send-back note and leaves the plan submitted', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const hod = actor('HOD', 'Hale');
    const { plans, reviews } = managers();
    const created = await plans.create(teacher, { ...completePlan, intent: 'submit' });

    const caught = await reviews.requestChanges(hod, created.id, '   ').catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught).toMatchObject({ fields: { note: 'Write a note first.' } });
    const stored = await lessonPlanModel().findById(created.id).lean();
    expect(stored?.status).toBe('SUBMITTED');
    expect(await reviewNoteModel().countDocuments({ planId: created.id, kind: 'CHANGES_REQUESTED' })).toBe(0);
  });

  it('puts the previous status back when the approval note insert fails', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const hod = actor('HOD', 'Hale');
    const { plans, reviews } = managers();
    const created = await plans.create(teacher, { ...completePlan, intent: 'submit' });
    let during: string | undefined;
    vi.spyOn(reviewNoteModel(), 'create').mockImplementation(async () => {
      during = (await lessonPlanModel().findById(created.id).lean())?.status;
      throw new Error('note failed');
    });

    await expect(reviews.approve(hod, created.id)).rejects.toThrow('note failed');

    expect(during).toBe('APPROVED');
    const stored = await lessonPlanModel().findById(created.id).lean();
    expect(stored?.status).toBe('SUBMITTED');
    expect(await reviewNoteModel().countDocuments({ planId: created.id, kind: 'APPROVED' })).toBe(0);
  });

  it('puts the previous status back when the submitted note insert fails', async () => {
    const teacher = actor('TEACHER', 'Ada');
    const { plans } = managers();
    const created = await plans.create(teacher, completePlan);
    let during: string | undefined;
    vi.spyOn(reviewNoteModel(), 'create').mockImplementation(async () => {
      during = (await lessonPlanModel().findById(created.id).lean())?.status;
      throw new Error('note failed');
    });

    await expect(plans.submit(teacher, created.id)).rejects.toThrow('note failed');

    expect(during).toBe('SUBMITTED');
    const stored = await lessonPlanModel().findById(created.id).lean();
    expect(stored?.status).toBe('DRAFT');
    expect(await reviewNoteModel().countDocuments({ planId: created.id })).toBe(0);
  });
});
