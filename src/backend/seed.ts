import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { lessonPlanModel } from '@/backend/models/lesson-plan.model';
import { reviewNoteModel } from '@/backend/models/review-note.model';
import type { NoteKind, PlanStatus, Role, Subject } from '@/backend/models/types';
import { userModel } from '@/backend/models/user.model';
import { connectMongo, disconnectMongo } from '@/backend/server';
import { hashPassword } from '@/backend/services/password';

interface SeedNote {
  kind: NoteKind;
  body: string;
}

interface SeedPlan {
  title: string;
  subject: Subject;
  grade: number;
  durationMinutes: number;
  topic: string;
  status: PlanStatus;
  resources: string;
  objectives?: string;
  activities?: string;
  note?: SeedNote;
}

interface SeedUser {
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
}

const plans: readonly SeedPlan[] = [
  {
    title: 'Ratio tables',
    subject: 'MATHS',
    grade: 6,
    durationMinutes: 40,
    topic: 'Equivalent ratios',
    status: 'DRAFT',
    resources: '',
  },
  {
    title: 'The water cycle',
    subject: 'SCIENCE',
    grade: 7,
    durationMinutes: 45,
    topic: 'Evaporation and condensation',
    status: 'SUBMITTED',
    objectives: 'Explain evaporation.',
    activities: 'Boil water in a jug.',
    resources: 'Classroom jug',
  },
  {
    title: 'A letter to a friend',
    subject: 'ENGLISH',
    grade: 8,
    durationMinutes: 40,
    topic: 'Audience',
    status: 'CHANGES_REQUESTED',
    objectives: 'Name an audience.',
    activities: 'Write one paragraph.',
    resources: '',
    note: { kind: 'CHANGES_REQUESTED', body: 'Name the audience in the first line.' },
  },
  {
    title: 'Still life in pencil',
    subject: 'ARTS',
    grade: 9,
    durationMinutes: 60,
    topic: 'Pencil shading',
    status: 'APPROVED',
    objectives: 'Compare two still lives.',
    activities: 'Draw one object.',
    resources: '',
    note: { kind: 'APPROVED', body: 'This plan is approved.' },
  },
];

/**
 * Inserts the demo teacher, head of department, four plans, and two notes.
 * A second run matches users by email and plans by title, so rows are not duplicated.
 * @returns A promise that settles when the demo rows have been written.
 * @throws {ConfigurationError} When `MONGODB_URI` is missing or blank.
 */
export async function seed(): Promise<void> {
  // 1. Connect and hash the demo password.
  await connectMongo();
  const passwordHash = await hashPassword(demoPassword());

  // 2. Upsert the teacher and the head of department.
  const teacher = await upsertUser({
    email: 'teacher@planroom.demo',
    name: 'Meera',
    role: 'TEACHER',
    passwordHash,
  });
  const hod = await upsertUser({
    email: 'hod@planroom.demo',
    name: 'Arun',
    role: 'HOD',
    passwordHash,
  });

  // 3. Upsert the four plans by title.
  // 4. Upsert the review notes on the sent-back and approved plans.
  for (const plan of plans) {
    const saved = await upsertPlan(teacher._id, plan);
    if (plan.note) {
      await upsertNote(saved._id, hod._id, plan.note);
    }
  }
}

/**
 * Password shared by the two demo accounts. An empty `DEMO_PASSWORD` means `planroom`.
 * @returns The configured password, or `planroom`.
 */
function demoPassword(): string {
  const configured = process.env.DEMO_PASSWORD;
  if (typeof configured === 'string' && configured.length > 0) {
    return configured;
  }
  return 'planroom';
}

/**
 * Inserts or updates one demo user.
 * @param user - Email, name, role, and password hash.
 * @returns The stored user document.
 */
async function upsertUser(user: SeedUser) {
  const saved = await userModel()
    .findOneAndUpdate(
      { email: user.email },
      {
        $set: {
          email: user.email,
          name: user.name,
          role: user.role,
          passwordHash: user.passwordHash,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true },
    )
    .exec();

  if (!saved) {
    throw new Error(`Could not seed ${user.email}.`);
  }
  return saved;
}

/**
 * Inserts or updates one demo plan. Draft plans do not store objectives or activities.
 * @param authorId - Teacher id.
 * @param plan - Seed fields, matched by title.
 * @returns The stored plan document.
 */
async function upsertPlan(authorId: mongoose.Types.ObjectId, plan: SeedPlan) {
  const set: Record<string, unknown> = {
    title: plan.title,
    subject: plan.subject,
    grade: plan.grade,
    durationMinutes: plan.durationMinutes,
    topic: plan.topic,
    resources: plan.resources,
    status: plan.status,
    authorId,
    deletedAt: null,
  };
  const update: { $set: Record<string, unknown>; $unset?: Record<string, string> } = { $set: set };

  if (plan.objectives === undefined && plan.activities === undefined) {
    update.$unset = { objectives: '', activities: '' };
  } else {
    set.objectives = plan.objectives;
    set.activities = plan.activities;
  }

  const saved = await lessonPlanModel()
    .findOneAndUpdate({ title: plan.title }, update, {
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true,
      runValidators: true,
    })
    .exec();

  if (!saved) {
    throw new Error(`Could not seed ${plan.title}.`);
  }
  return saved;
}

/**
 * Inserts or updates the single note for a plan and kind.
 * @param planId - Plan that owns the note.
 * @param authorId - Head of department id.
 * @param note - Kind and body.
 */
async function upsertNote(
  planId: mongoose.Types.ObjectId,
  authorId: mongoose.Types.ObjectId,
  note: SeedNote,
): Promise<void> {
  await reviewNoteModel()
    .updateOne(
      { planId, kind: note.kind },
      { $set: { body: note.body, authorId, planId, kind: note.kind } },
      { upsert: true, runValidators: true },
    )
    .exec();
}

/**
 * Runs the seed when this file is the process entry, then closes Mongo.
 */
async function main(): Promise<void> {
  try {
    await seed();
  } finally {
    await disconnectMongo();
  }
}

/**
 * Reports whether Node or tsx started this file directly.
 * @returns True when `argv` points at `seed.ts`.
 */
function ranAsScript(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  const entryUrl = pathToFileURL(path.resolve(entry)).href;
  return import.meta.url === entryUrl || entry.replaceAll('\\', '/').endsWith('src/backend/seed.ts');
}

if (ranAsScript()) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
