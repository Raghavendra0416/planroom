import { describe, expect, it } from 'vitest';
import * as copy from '@/frontend/copy';

const expected = {
  homeTitle: 'Planroom',
  homeLead:
    'Teachers write the lesson. The head of department reads it, sends it back, or signs it off.',
  step1: 'Write the plan.',
  step2: 'Send it for review.',
  step3: 'Fix what came back, or leave it approved.',
  signIn: 'Sign in',
  signOut: 'Sign out',
  loginDemo: 'Try it as a teacher or as HOD. Accounts are on this page.',
  navPlans: 'Plans',
  navQueue: 'Review queue',
  newPlan: 'New plan',
  saveDraft: 'Save draft',
  saveSubmit: 'Save and submit',
  suggest: 'Suggest objectives',
  aiOff: 'Suggestions are off. You can still save this plan.',
  aiMissingKey: 'Suggestions will be back soon. You can still save this plan.',
  aiCap: 'No suggestions left this hour. Try again later.',
  aiFail: 'Could not draft objectives. Write them yourself.',
  emptyList: 'No plans yet.',
  emptyQueue: 'Nothing waiting.',
  filterNone: 'No plans match those filters.',
  submit: 'Submit for review',
  sendBack: 'Send back',
  approve: 'Approve',
  reopen: 'Reopen',
  comment: 'Comment',
  remove: 'Remove',
  notFound: 'That page is not here.',
  forbidden: 'You cannot open this plan.',
  queueForbidden: 'The review queue is for the head of department.',
  genericError: 'This page failed to load.',
  retry: 'Try again',
  globalError: 'Planroom could not load. Reload the page.',
  status: 'Status',
  statusDraft: 'Draft',
  statusSubmitted: 'In review',
  statusChanges: 'Sent back',
  statusApproved: 'Approved',
  submitNote: 'Submitted for review.',
  approveNote: 'This plan is approved.',
  emptyNote: 'Write a note first.',
  sortUpdated: 'Last updated',
  sortCreated: 'Date added',
  fieldTitle: 'Title',
  fieldSubject: 'Subject',
  fieldGrade: 'Grade',
  fieldDuration: 'Duration in minutes',
  fieldTopic: 'Topic',
  fieldObjectives: 'Objectives',
  fieldActivities: 'Activities',
  fieldResources: 'Resources',
  subjectEnglish: 'English',
  subjectMaths: 'Maths',
  subjectScience: 'Science',
  subjectSocial: 'Social science',
  subjectComputer: 'Computer',
  subjectArts: 'Arts',
  subjectOther: 'Other',
  signInFail: 'That email and password did not match.',
  duplicateEmail: 'That email already has an account. Sign in.',
  registerFail: 'Could not create the account.',
  saveFail: 'Could not save this plan.',
  submitFail: 'Could not send this plan for review.',
  sendBackFail: 'Could not send this plan back.',
  approveFail: 'Could not approve this plan.',
  reopenFail: 'Could not reopen this plan.',
  commentFail: 'Could not save that comment.',
  removeFail: 'Could not remove this plan.',
  insertAll: 'Insert all',
  insertOne: 'Insert one',
  dismiss: 'Dismiss',
  register: 'Register',
  teacherDemo: 'teacher@planroom.demo',
  hodDemo: 'hod@planroom.demo',
  github: 'GitHub',
  linkedin: 'LinkedIn',
} as const;

describe('copy', () => {
  it('exports the home lead, status labels, and global error sentence', () => {
    expect(copy.homeLead).toBe(expected.homeLead);
    expect(copy.statusDraft).toBe('Draft');
    expect(copy.statusSubmitted).toBe('In review');
    expect(copy.statusChanges).toBe('Sent back');
    expect(copy.statusApproved).toBe('Approved');
    expect(copy.globalError).toBe('Planroom could not load. Reload the page.');
  });

  it('exports every product string verbatim', () => {
    expect(Object.fromEntries(Object.entries(copy))).toEqual({ ...expected });
  });

  it('does not use seamless, leverage, or empower', () => {
    for (const value of Object.values(copy)) {
      expect(typeof value).toBe('string');
      const text = value.toLowerCase();
      expect(text).not.toContain('seamless');
      expect(text).not.toContain('leverage');
      expect(text).not.toContain('empower');
    }
  });
});
