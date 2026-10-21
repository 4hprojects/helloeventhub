import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeName } from '@heh/contracts';
import { Attendee, Event, EventCategory, Registration } from '../src/db/models.js';
import { migrateReunionEvent, REUNION_DEFAULT_IF_MISSING, REUNION_EVENT_VALUES } from '../src/services/reunionMigration.js';
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
    const oldMagdalena = await EventCategory.findOne({ eventId: event!._id }).sort({ sortOrder: 1 }).skip(1);
    oldMagdalena!.label = '2. Magdalena — Palag Mat-an';
    oldMagdalena!.labelNormalized = normalizeName(oldMagdalena!.label);
    await oldMagdalena!.save();
    const previousOrder = [
      '4. Toribio — Virginia Villanueva',
      '5. Ganzon — Pilar Licdan',
      '6. Onofre — Belen Wagsi',
    ];
    const oldOrderIds: Record<string, string> = {};
    const oldOrder = await EventCategory.find({ eventId: event!._id }).sort({ sortOrder: 1 }).skip(3).limit(3);
    for (const [index, category] of oldOrder.entries()) {
      category.label = previousOrder[index]!;
      category.labelNormalized = normalizeName(category.label);
      await category.save();
      oldOrderIds[category.label.split(' ')[1]!] = String(category._id);
    }
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

    // A cutoff that is already set in production must survive the migration.
    const existingCutoff = new Date('2026-10-18T23:59:00+08:00');
    await Event.updateOne({ _id: event!._id }, { $set: { title: 'Old title', venueName: null, preregSnapshotAt: existingCutoff } });

    const preview = await migrateReunionEvent();
    expect(preview.dryRun).toBe(true);
    expect(preview.categoriesMerged).toBe(1);
    expect(preview.eventFieldChanges).toEqual(
      expect.arrayContaining([
        { field: 'title', from: 'Old title', to: REUNION_EVENT_VALUES.title, action: 'set' },
        { field: 'venueName', from: null, to: 'Veterans Building', action: 'set' },
        { field: 'preregSnapshotAt', from: existingCutoff, to: existingCutoff, action: 'kept' },
      ]),
    );
    expect(preview.branchLabelChanges).toEqual(
      expect.arrayContaining([{ from: '4. Toribio — Virginia Villanueva', to: '6. Toribio — Virginia Villanueva' }]),
    );
    expect((await Event.findById(event!._id).lean())!.title).toBe('Old title');
    expect(await EventCategory.countDocuments({ _id: secondary._id })).toBe(1);

    const applied = await migrateReunionEvent({ dryRun: false });
    expect(applied.registrationsAfter).toBe(before.registrations);
    expect(applied.attendeesAfter).toBe(before.attendees);
    expect(await Event.countDocuments({ slug: ctx.eventSlug })).toBe(before.events);
    const updated = await Event.findById(event!._id).lean();
    expect(updated).toMatchObject(REUNION_EVENT_VALUES);
    expect(updated!.preregSnapshotAt).toEqual(existingCutoff);
    const categories = await EventCategory.find({ eventId: event!._id }).sort({ sortOrder: 1 }).lean();
    expect(categories.map((category) => category.label)).toEqual(FAMILY_BRANCHES);
    expect(await EventCategory.countDocuments({ _id: secondary._id })).toBe(0);
    expect(String(categories[3]!._id)).toBe(oldOrderIds.Ganzon);
    expect(String(categories[4]!._id)).toBe(oldOrderIds.Onofre);
    expect(String(categories[5]!._id)).toBe(oldOrderIds.Toribio);
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
    expect(repeat.eventFieldChanges.filter((c) => c.action === 'set')).toEqual([]);
    expect(repeat.branchLabelChanges).toEqual([]);
    expect(await Event.countDocuments({ slug: ctx.eventSlug })).toBe(1);
  });

  it('sets the default cutoff only when the event has none', async () => {
    await Event.updateOne({ publicId: ctx.eventId }, { $unset: { preregSnapshotAt: 1 } });
    const preview = await migrateReunionEvent();
    expect(preview.eventFieldChanges).toContainEqual({
      field: 'preregSnapshotAt',
      from: null,
      to: REUNION_DEFAULT_IF_MISSING.preregSnapshotAt,
      action: 'set',
    });
    await migrateReunionEvent({ dryRun: false });
    const updated = await Event.findOne({ publicId: ctx.eventId }).lean();
    expect(updated!.preregSnapshotAt).toEqual(REUNION_DEFAULT_IF_MISSING.preregSnapshotAt);
  });
});
