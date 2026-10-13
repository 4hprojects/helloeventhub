# Venue check-in runbook (P1)

**Goal:** keep check-in working at the venue on Oct 24 even with no internet. One committee laptop runs the **venue server**; up to 5 phones, tablets or laptops connect to it over the venue Wi-Fi with a browser. When internet is available it syncs with helloeventhub.online.

**Primary method:** manual search by name or reference. QR scanning is not shipped. **Last resort:** the printed list.

## What you need

- Main laptop (charged, plus charger and power strip) with Node 22+, the repo, and full-disk encryption on.
- A Wi-Fi router that works on its own, with no internet uplink. All stations join it.
- Up to 4 more devices with a modern browser.
- Printed roster (from the venue server, or Admin → Exports → Venue roster), blank walk-in sheets, pens.

## One-time setup (by Oct 21)

```bash
cd HelloEventHub
npm install && npm run build -w apps/venue
cp apps/venue/.env.example apps/venue/.env
```

1. Cloud: **Admin → Venue → Create device token** (name it "Main venue laptop"). Copy the three lines into `apps/venue/.env` (`CLOUD_BASE_URL`, `CLOUD_EVENT_ID`, `CLOUD_DEVICE_TOKEN`). The token is shown once.
2. Create a lead and operators (PINs of 6–12 digits, one per person):
   ```bash
   cd apps/venue
   npm run cli -- operator-add --name "Ana" --role lead
   npm run cli -- operator-add --name "Ben"
   ```
3. While online, preload the roster:
   ```bash
   npm run cli -- sync      # must show "verified": true
   npm run cli -- status
   ```
4. Start the server with `npm start`. It prints the address the stations should open, e.g. `http://192.168.1.10:8080`.

## Rehearsal (by Oct 23) — check every box

- [ ] Router on, **WAN cable unplugged**. Two stations sign in and search.
- [ ] Both stations check in the **same person** at the same time. Exactly one is accepted and the other shows "already checked in".
- [ ] Register a walk-in household. It appears in search as checked in.
- [ ] Restart the laptop or stop and start the server. The counts are unchanged.
- [ ] `npm run cli -- backup` writes a file in `backups/`. Copy it to a USB stick.
- [ ] Plug the WAN back in and press **Sync now** (lead). "Waiting to sync" drops to 0, and the cloud dashboard "Checked in" matches.
- [ ] Print the list (header → **Print list**).
- [ ] Assign roles: station operators, lead (sync and review), reconciliation owner.

Automated version of this rehearsal for developers: `node scripts/venue-simulation.mjs` (against a local or staging cloud). The isolated version runs after the browser scenarios in `npm run test:e2e:self-contained` and is a required CI release gate. Set `KEEP_VENUE_SIM_DATA=true` only when the temporary SQLite data is needed for debugging.

## Event morning (Oct 24, from 07:00)

1. Laptop on power. Run `npm run cli -- sync` while internet is available, and confirm the roster is verified.
2. `npm start`. Each station opens the URL, signs in and enters a station name ("Table 1").
3. Check the status bar: green "Cloud connected", or amber "No internet — saving locally". Both are fine.

## During the event

- Search by first or last name, household name, or `HEH-` reference. Use **Household → Check in all** for families.
- "Already checked in at 8:42 (Table 2)" means it was not counted again. Wave them through.
- **Cancelled** people can't be checked in. Send them to the lead.
- Walk-ins: search first, then **Walk-in**. Contact details are optional; only collect them if the organizers need them.
- The lead watches "waiting to sync" and "need review". Syncing also runs automatically every 30 s when internet is up.

## Fixing things at the venue (works offline)

Open **Household** on anyone in the family:

| Situation | Do this | What happens online |
|---|---|---|
| Name misspelled, wrong adult/child, RSVP changed | **Edit** → Save | Sent at the next sync. If an organizer changed the same person online in the meantime, the venue edit is **not** applied; it shows under "need review" for the organizers. |
| An extra family member came (not pre-registered) | **Add person to this household** | Added to that same registration (marked walk-in) and checked in. |
| Someone was checked in by mistake | Lead: **Undo** (give a reason) | If it hadn't synced yet, nothing is sent. Otherwise the cloud check-in is removed. Check-ins made on another device or online can't be undone here; ask the organizers. |
| How many from each branch are here? | Expand **By branch** under the search box | Arrived vs expected per branch, from the laptop's data. |

Everything is saved on the laptop before the screen confirms it. Syncing runs automatically every 30 s whenever internet is available. The lead can press **Sync now**.

## If something fails

| Problem | Do this |
|---|---|
| A station can't reach the server | Check it is on the venue Wi-Fi. Other stations keep working. |
| Laptop or server down | Switch to the printed list. Write name, time and station on paper. Enter the records later as walk-ins or check-ins. |
| Power loss | Restart the laptop and run `npm start`. Every confirmed check-in was saved to disk before it showed as done. |
| Data damaged | Stop the server, copy the newest `backups/venue-*.sqlite` to `data/venue.sqlite`, then start again. |
| Device token leaked or laptop lost | Cloud: Admin → Venue → **Revoke**. Then create a new token. |

## After the event

1. With internet on, run `npm run cli -- sync` until `pendingSync` is 0 and `needsReview` is listed.
2. The lead hands the **Needs review** list to the organizers, who fix those records in the cloud admin.
3. Organizers export the final report (Admin → Exports).
4. Once reconciled and signed off, delete the venue copies: `rm -rf apps/venue/data apps/venue/backups`, plus the USB copies. Revoke the device token.
