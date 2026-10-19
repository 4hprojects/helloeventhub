# HelloEventHub | 1st Menay Bugtong - Wakat Alsem Clan Reunion

> Codex implementation brief | Prepared October 15, 2026
> Existing event URL: https://helloeventhub.online/events/mb-wa-reunion-2026
> Status: organizer-approved content, with clearly identified questions below.

## Goal

Update the **existing HelloEventHub event**, its public event page, invitation/share assets, registration display, and location information using the organizer-confirmed details below. Inspect the repository and existing data before modifying anything. **Do not create a duplicate event or overwrite existing registrations.** Preserve existing project conventions and deployment approach.

## 1. Confirmed event details

| Field | Approved value |
|---|---|
| Official title | **1st Menay Bugtong - Wakat Alsem Clan Reunion** |
| Theme / tagline | **One Family, Many Faces, New Connections** |
| Event date | **Saturday, October 24, 2026** |
| Event proper | **9:00 AM–3:00 PM** |
| Onsite registration begins | **8:00 AM** |
| Timezone | **Asia/Manila (UTC+08:00)** |
| Venue | **Veterans Building, Puguis, La Trinidad, Benguet** |
| Preregistration deadline date | **October 20, 2026** |
| Event route | `/events/mb-wa-reunion-2026` |
| Full event URL | `https://helloeventhub.online/events/mb-wa-reunion-2026` |
| Directions URL | `https://maps.app.goo.gl/6NLwRQT4iLkmXosD6` |

Recommended structured values:

```json
{
  "slug": "mb-wa-reunion-2026",
  "title": "1st Menay Bugtong - Wakat Alsem Clan Reunion",
  "tagline": "One Family, Many Faces, New Connections",
  "startAt": "2026-10-24T09:00:00+08:00",
  "endAt": "2026-10-24T15:00:00+08:00",
  "onsiteRegistrationStartsAt": "2026-10-24T08:00:00+08:00",
  "timezone": "Asia/Manila",
  "preregistrationDeadlineDate": "2026-10-20",
  "venue": "Veterans Building, Puguis, La Trinidad, Benguet",
  "eventUrl": "https://helloeventhub.online/events/mb-wa-reunion-2026",
  "mapsUrl": "https://maps.app.goo.gl/6NLwRQT4iLkmXosD6"
}
```

Use this only as a **data mapping guide**, not an instruction to replace the repository's existing schema. The exact cutoff **time** on October 20 has not been confirmed. Do not impose a new time without clarification or a documented existing business rule.

## 2. Public invitation copy

### Main heading

**1st Menay Bugtong - Wakat Alsem Clan Reunion**

### Official tagline

**One Family, Many Faces, New Connections**

### Introduction

You're invited to our first clan reunion! Come meet relatives, discover family connections, and celebrate our shared heritage. Let's build new relationships and make memories together.

### Schedule and venue

**Saturday, October 24, 2026**  
**9:00 AM–3:00 PM**  
Onsite registration begins **8:00 AM**  
**Veterans Building, Puguis, La Trinidad, Benguet**

**Online preregistration deadline: October 20, 2026**

Primary button: **Register / View Event Details**  
Secondary button: **Get Directions**

Suggested footer: **Let's come together, meet our relatives, and create new memories for generations to come!**

Do not invent entrance fees, meal details, hosts, sponsors, a complete program, or contact persons.

## 3. Family heritage data

The event is the **1st**, not the 18th, reunion. The name is **Menay**, not Mignay. The first listed child is **Albina**, not Albin.

These names were supplied by the organizer as the eight children and associated family connections:

| Branch | Name | Associated name(s) |
|---|---|---|
| 1 | Albina | Baon Tinay / Magastino |
| 2 | Magdalena | Palaez Mat-an |
| 3 | Mary | Francisco Marino |
| 4 | Ganzon | Pilar Licdan |
| 5 | Onofre | Belen Wagsi |
| 6 | Toribio | Virginia Villanueva |
| 7 | Mistihil | Zenaida Calado |
| 8 | Denio | Pacita Guzman |

```json
[
  {"order":1,"name":"Albina","associatedNames":["Baon Tinay","Magastino"]},
  {"order":2,"name":"Magdalena","associatedNames":["Palaez Mat-an"]},
  {"order":3,"name":"Mary","associatedNames":["Francisco Marino"]},
  {"order":4,"name":"Ganzon","associatedNames":["Pilar Licdan"]},
  {"order":5,"name":"Onofre","associatedNames":["Belen Wagsi"]},
  {"order":6,"name":"Toribio","associatedNames":["Virginia Villanueva"]},
  {"order":7,"name":"Mistihil","associatedNames":["Zenaida Calado"]},
  {"order":8,"name":"Denio","associatedNames":["Pacita Guzman"]}
]
```

**Avoid guessing relationships:** The meaning of the two names beside Albina has not been clarified. Do not label them as spouses, nor convert any associated name into an asserted legal relationship without confirmation. Preserve the supplied spellings. If the existing data model doesn't support lineage, an optional display section can be implemented without redesigning the entire database. Confirm whether these names are meant to appear on the public page before publishing them there.

## 4. QR codes and external links (required)

### Primary QR: event / preregistration

Encode this **exact** URL:

`https://helloeventhub.online/events/mb-wa-reunion-2026`

Label: **Scan to Register & View Event Details**

Display both a QR code and a clickable, selectable text link. The public page must also have a conventional registration button, not only a QR code.

### Secondary QR: Google Maps location

Encode this **exact** URL:

`https://maps.app.goo.gl/6NLwRQT4iLkmXosD6`

Label: **Scan for Directions**

Display a clickable **View on Google Maps** link beside the QR code. Preserve the organizer's venue display text exactly rather than replacing it with an inferred map listing address.

### QR quality controls

- Use a genuine QR encoder library already present in the repo, if possible, or add a maintained dependency as appropriate.
- Favor SVG for the website and high-resolution PNG/SVG for a downloadable pubmat.
- Ensure strong dark-on-light contrast, quiet zone, and adequate size.
- Add descriptive alt text and visible URLs so the feature remains usable on desktop and by assistive technology.
- **Do not rely on AI-generated or illustrated QR patterns in the previous poster.** If integrating that artwork, replace its QR graphics with programmatically generated and decoded QR images.
- Test QR decoding and assert the payload is exactly the intended URL for both codes.
- Verify navigation where a browser/device is available. If unavailable, report that limitation.

## 5. UI and design direction

Design style: welcoming family heritage, not corporate. Recommended palette: **forest green, warm cream, muted gold**. Subtle **pine trees, Benguet mountain silhouettes, and a family tree with eight branches** can support the theme.

Suggested event page hierarchy:

1. Hero: exact event title and tagline, event date and primary CTA.
2. Event essentials: schedule, onsite registration time, venue and directions.
3. About: invitation and purpose of meeting extended relatives.
4. Registration: use the existing HelloEventHub form and confirmation workflow.
5. Family heritage: optional eight-branch display, after verifying publication consent/accuracy.
6. Share panel: both QR codes, corresponding text links and copy-link controls.
7. Existing verified organizer information, if any.

Ensure mobile responsiveness, readable typography, keyboard access, and contrast. Do not let decorative elements crowd the QR codes or main details.

Design asset targets:

- Facebook/Messenger invitation poster: **1080 × 1350 px** (4:5 portrait).
- Open Graph sharing image: **1200 × 630 px**.
- Posters should provide clickable links in their accompanying social caption because URLs inside bitmap images are not themselves clickable.
- The earlier generated artwork is inspiration, not a trusted source for the spelling, genealogy relationships, or QR encoding.

## 6. Registration and event behavior

Retain the existing application architecture, MongoDB data model, permissions, and backend validation unless code inspection identifies a concrete change required.

- Preserve current registered participants and avoid duplicate event creation.
- Keep the event page available to anyone with the event URL, as intended by the project.
- Preserve existing fields for **email, mobile number, and Messenger contact**, where already supported.
- Apply existing duplicate-registration and confirmation-email logic.
- Use the event timezone (`Asia/Manila`) for deadline and schedule rendering.
- Show the **October 20** preregistration deadline without inventing a cutoff hour.
- Ensure on-site check-in/registration workflows reflect the **8:00 AM** start, subject to actual platform behavior and permissions.
- Preserve CSV export, headcount and committee dashboard features if they already exist.
- Avoid exposing private registration records on a public page.
- Don't add a payment feature as part of this change.

## 7. Metadata and discoverability

Proposed SEO title:

`1st Menay Bugtong - Wakat Alsem Clan Reunion | HelloEventHub`

Proposed meta description:

`Join the 1st Menay Bugtong - Wakat Alsem Clan Reunion on October 24, 2026 at Veterans Building, Puguis, La Trinidad, Benguet. One Family, Many Faces, New Connections.`

Canonical URL:

`https://helloeventhub.online/events/mb-wa-reunion-2026`

Implement/update Open Graph title, description, URL, image, and Twitter card using existing site conventions. For JSON-LD `Event`, include only verified dates, name, and `Place` information. Do not invent an organizer, ticket cost, or availability.

## 8. Codex implementation sequence

### P0: Inspect current implementation

- Locate the existing event with slug `mb-wa-reunion-2026`.
- Identify authoritative event storage, API endpoints, components, poster/share assets, QR utilities, date handling and deployment workflow.
- Identify conflicts with confirmed details, existing participants or stored data before writing.

### P1: Update event data and public UI

- Update only the existing event record and affected page display.
- Correct title, edition, tagline, date, schedule, registration opening, venue, cutoff date and URLs.
- Preserve other verified existing event data and registrants.
- Make migrations/seed operations safe and idempotent.

### P2: Add and verify both QR codes

- Add genuine QR generation and correctly labeled links.
- Validate exact URL payloads with automated tests where possible.

### P3: Improve invitation and sharing

- Add or update social-preview metadata and appropriate images.
- If a poster download feature exists, update the poster using verified QR assets and legible event information.
- Avoid forcing a new poster-generation pipeline unless warranted by the repo.

### P4: QA and deployment

- Run available lint/typecheck/test/build commands.
- Review both mobile and desktop presentations, date/time formatting, registration and check-in flows.
- Verify event URL, Maps link, QR decodes, privacy, SEO metadata and Messenger/Facebook preview if possible.
- Deploy using the current HelloDeploy flow only after validation.
- Report any checks that could not be completed.

## 9. Acceptance checklist

- [ ] Page refers to the **1st** reunion, with **Menay**, not older mistaken variants.
- [ ] Tagline exactly matches **One Family, Many Faces, New Connections**.
- [ ] Date is **Saturday, October 24, 2026**.
- [ ] Main program shows **9:00 AM–3:00 PM**, onsite registration **8:00 AM**.
- [ ] Venue is **Veterans Building, Puguis, La Trinidad, Benguet**.
- [ ] Preregistration deadline displays **October 20, 2026** without unconfirmed time.
- [ ] Existing event slug and registrations are preserved.
- [ ] Registration button/link resolves to the intended event route.
- [ ] Google Maps button/link uses the exact supplied URL.
- [ ] Both QR codes decode to the correct exact target URLs.
- [ ] If heritage list is public, all eight names match organizer spellings, including **Albina**.
- [ ] Unconfirmed genealogy relationships are not asserted as facts.
- [ ] Mobile and desktop layouts are readable and accessible.
- [ ] Site metadata and social preview use updated event details.
- [ ] Existing application checks pass and no duplicate event is produced.

## 10. Open decisions (do not invent)

1. Preregistration cutoff **hour** on October 20 and policy for late signups/walk-ins.
2. Whether family heritage names and associated connections should appear publicly, and final verification of **Albina — Baon Tinay / Magastino**.
3. Any confirmed admission fee, meals, activity timetable, organizer contacts, logos or sponsor information.
4. Whether the invitation artwork should be displayed on the event page, offered as a download, or used only in social posts.

## 11. Required Codex handoff report

After implementation, provide:

1. Files and data records changed, with why.
2. Any database migrations/seeds executed and data integrity safeguards.
3. Dependencies added, if any.
4. Tests/commands run, passing and failing results.
5. Preview or deployment URL and verified behavior.
6. Outstanding organizer decisions and follow-up tasks.

## Reference URLs

- Event and registration: https://helloeventhub.online/events/mb-wa-reunion-2026
- Google Maps: https://maps.app.goo.gl/6NLwRQT4iLkmXosD6
