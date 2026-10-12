/** Convert an ISO instant to a value for <input type="datetime-local"> in the given zone. */
export function toZonedInput(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Interpret a datetime-local value as wall-clock time in the given zone and return an ISO instant. */
export function fromZonedInput(local: string, timeZone: string): string | null {
  if (!local) return null;
  const [d, t] = local.split('T');
  const [y, m, day] = d!.split('-').map(Number);
  const [hh, mm] = t!.split(':').map(Number);
  const guess = new Date(Date.UTC(y!, m! - 1, day!, hh!, mm!));
  const offset = zoneOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offset * 60000).toISOString();
}
