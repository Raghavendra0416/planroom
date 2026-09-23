import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lessonPlanModel } from '@/backend/models/lesson-plan.model';
import { reviewNoteModel } from '@/backend/models/review-note.model';
import { userModel } from '@/backend/models/user.model';
import { seed } from '@/backend/seed';
import { disconnectMongo } from '@/backend/server';
import { verifyPassword } from '@/backend/services/password';

describe('seed', () => {
  let memory: MongoMemoryServer | undefined;
  const previousUri = process.env.MONGODB_URI;
  const previousPassword = process.env.DEMO_PASSWORD;

  beforeAll(async () => {
    memory = await MongoMemoryServer.create();
    process.env.MONGODB_URI = memory.getUri();
    process.env.DEMO_PASSWORD = '';
    await seed();
    await seed();
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
      if (previousPassword === undefined) {
        delete process.env.DEMO_PASSWORD;
      } else {
        process.env.DEMO_PASSWORD = previousPassword;
      }
    }
  });

  it('upserts two users, four plans, and two notes without duplicating them', async () => {
    const users = await userModel().find().lean();
    const plans = await lessonPlanModel().find().lean();
    const notes = await reviewNoteModel().find().lean();
    const teacher = users.find((user) => user.email === 'teacher@planroom.demo');
    const hod = users.find((user) => user.email === 'hod@planroom.demo');
    const draft = plans.find((plan) => plan.title === 'Ratio tables');
    const water = plans.find((plan) => plan.title === 'The water cycle');
    const letter = plans.find((plan) => plan.title === 'A letter to a friend');
    const still = plans.find((plan) => plan.title === 'Still life in pencil');
    const letterNote = notes.find((note) => note.kind === 'CHANGES_REQUESTED');
    const stillNote = notes.find((note) => note.kind === 'APPROVED');

    expect(users).toHaveLength(2);
    expect(plans).toHaveLength(4);
    expect(notes).toHaveLength(2);
    expect(teacher).toMatchObject({ name: 'Meera', role: 'TEACHER' });
    expect(hod).toMatchObject({ name: 'Arun', role: 'HOD' });
    expect(teacher?.passwordHash).toBe(hod?.passwordHash);
    await expect(verifyPassword('planroom', teacher?.passwordHash ?? '')).resolves.toBe(true);

    expect(draft).toMatchObject({
      subject: 'MATHS',
      grade: 6,
      durationMinutes: 40,
      topic: 'Equivalent ratios',
      status: 'DRAFT',
      resources: '',
      deletedAt: null,
    });
    expect(draft?.objectives).toBeUndefined();
    expect(draft?.activities).toBeUndefined();
    expect(String(draft?.authorId)).toBe(String(teacher?._id));

    expect(water).toMatchObject({
      subject: 'SCIENCE',
      grade: 7,
      durationMinutes: 45,
      topic: 'Evaporation and condensation',
      status: 'SUBMITTED',
      objectives: 'Explain evaporation.',
      activities: 'Boil water in a jug.',
      resources: 'Classroom jug',
    });
    expect(letter).toMatchObject({
      subject: 'ENGLISH',
      grade: 8,
      status: 'CHANGES_REQUESTED',
      objectives: 'Name an audience.',
      activities: 'Write one paragraph.',
      resources: '',
    });
    expect(still).toMatchObject({
      subject: 'ARTS',
      grade: 9,
      durationMinutes: 60,
      topic: 'Pencil shading',
      status: 'APPROVED',
      objectives: 'Compare two still lives.',
      activities: 'Draw one object.',
      resources: '',
    });
    expect(letterNote).toMatchObject({ body: 'Name the audience in the first line.' });
    expect(stillNote).toMatchObject({ body: 'This plan is approved.' });
    expect(String(letterNote?.planId)).toBe(String(letter?._id));
    expect(String(stillNote?.planId)).toBe(String(still?._id));
    expect(String(letterNote?.authorId)).toBe(String(hod?._id));
    expect(String(stillNote?.authorId)).toBe(String(hod?._id));
  });
});
