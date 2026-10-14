import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeName } from '@heh/contracts';
import { Attendee, Event, EventCategory, Registration } from '../src/db/models.js';
import { migrateReunionEvent, REUNION_EVENT_VALUES } from '../src/services/reunionMigration.js';
import { FAMILY_BRANCHES } from '../src/services/seedData.js';
import { registrationPayload, setupTestApp, submit, teardownTestApp, type TestCtx } from './helpers.js';

describe('2026 reunion migration', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    ctx = await setupTestApp();
  });
  afterAll(teardownTestApp);

  it('merges legacy Albina categories without changing people or creating another event', async () => {
    const event = await Event.findOne({ publicId: ctx.eventId });
    const primary = await EventCategory.findOne({ eventId: event!._id }).sort({ sortOrder: 1 });
    primary!.label = '1a. Albin – Baon Tinay';
    primary!.labelNormalized = normalizeName(primary!.label);
    await primary!.save();
    const secondary = await EventCategory.create({
      organizationId: event!.organizationId,
      eventId: event!._id,
      label: '1b. Albin – Magastino',
      labelNormalized: normalizeName('1b. Albin – Magastino'),
      sortOrder: 5,
      active: true,
      provisional: false,
    });
    await submit(ctx, registrationPayload({ eventCategoryId: primary!.publicId })).expect(201);
    await submit(
      ctx,
      registrationPayload({
        eventCategoryId: secondary.publicId,
        attendees: [
          {
            fullName: 'Branch Override',
            ageCategory: 'adult',
            rsvp: 'confirmed',
            categoryId: secondary.publicId,
          },
        ],
      }),
    ).expect(201);
    const before = {
      events: await Event.countDocuments({ slug: ctx.eventSlug }),
      registrations: await Registration.countDocuments({ eventId: event!._id }),
      attendees: await Attendee.countDocuments({ eventId: event!._id }),
    };

    const preview = await migrateReunionEvent();
    expect(preview.dryRun).toBe(true);
    expect(preview.categoriesMerged).toBe(1);
    expect(await EventCategory.countDocuments({ _id: secondary._id })).toBe(1);

    const applied = await migrateReunionEvent({ dryRun: false });
    expect(applied.registrationsAfter).toBe(before.registrations);
    expect(applied.attendeesAfter).toBe(before.attendees);
    expect(await Event.countDocuments({ slug: ctx.eventSlug })).toBe(before.events);
    const updated = await Event.findById(event!._id).lean();
    expect(updated).toMatchObject(REUNION_EVENT_VALUES);
    const categories = await EventCategory.find({ eventId: event!._id }).sort({ sortOrder: 1 }).lean();
    expect(categories.map((category) => category.label)).toEqual(FAMILY_BRANCHES);
    expect(await EventCategory.countDocuments({ _id: secondary._id })).toBe(0);
    const validIds = new Set(categories.map((category) => String(category._id)));
    expect(
      (await Registration.find({ eventId: event!._id }).lean()).every(
        (registration) => !registration.eventCategoryId || validIds.has(String(registration.eventCategoryId)),
      ),
    ).toBe(true);
    expect(
      (await Attendee.find({ eventId: event!._id }).lean()).every(
        (attendee) => !attendee.categoryId || validIds.has(String(attendee.categoryId)),
      ),
    ).toBe(true);

    const repeat = await migrateReunionEvent({ dryRun: false });
    expect(repeat.categoriesMerged).toBe(0);
    expect(repeat.categoriesCreated).toBe(0);
    expect(await Event.countDocuments({ slug: ctx.eventSlug })).toBe(1);
  });
});
