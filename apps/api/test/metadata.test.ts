import { describe, expect, it } from 'vitest';
import { injectEventMetadata } from '../src/app.js';
import type { EventDoc } from '../src/db/models.js';

describe('event metadata HTML', () => {
  it('injects crawler-visible canonical, social and JSON-LD event metadata', () => {
    const template =
      '<html><head><meta name="description" content="default" /><meta property="og:title" content="default" /><meta property="og:description" content="default" /><meta property="og:image" content="/default.png" /><title>HelloEventHub</title></head><body></body></html>';
    const event = {
      slug: 'mb-wa-reunion-2026',
      title: '1st Menay Bugtong - Wakat Alsem Clan Reunion',
      tagline: 'One Family, Many Faces, New Connections',
      venueName: 'Veterans Building',
      venueAddress: 'Puguis, La Trinidad, Benguet',
      startsAt: new Date('2026-10-24T09:00:00+08:00'),
      endsAt: new Date('2026-10-24T15:00:00+08:00'),
    } as EventDoc;
    const html = injectEventMetadata(template, event, 'https://helloeventhub.online');
    expect(html).toContain('<title>1st Menay Bugtong - Wakat Alsem Clan Reunion | HelloEventHub</title>');
    expect(html).toContain(
      'property="og:url" content="https://helloeventhub.online/events/mb-wa-reunion-2026"',
    );
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('/events/mb-wa-reunion-2026/social-preview.png');
    expect(html).toContain('application/ld+json');
    expect(html).not.toContain('organizer');
    expect(html).not.toContain('offers');
  });
});
