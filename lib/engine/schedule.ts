// When a bot should next run. Daily times are in the workspace's own time zone, across clock changes.

export type Schedule = { everyMinutes: number } | { dailyAt: string } | null;

// Minutes the zone is ahead of UTC at that instant (Toronto in winter: -300).
export function zoneOffset(timeZone: string, at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - at.getTime()) / 60000);
}

// The instant when the clock on the wall in `timeZone` reads that date and time.
export function zonedToUtc(timeZone: string, y: number, mo: number, d: number, h: number, mi: number) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let t = guess - zoneOffset(timeZone, new Date(guess)) * 60000;
  t = guess - zoneOffset(timeZone, new Date(t)) * 60000; // second pass settles DST edges
  return new Date(t);
}

export function localDate(timeZone: string, at: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at); // YYYY-MM-DD
}

export function nextRun(schedule: Schedule, timeZone: string, now = new Date()): Date | null {
  if (!schedule) return null;
  if ("everyMinutes" in schedule) return new Date(now.getTime() + schedule.everyMinutes * 60000);
  const [h, mi] = schedule.dailyAt.split(":").map(Number);
  const [y, mo, d] = localDate(timeZone, now).split("-").map(Number);
  let at = zonedToUtc(timeZone, y, mo, d, h, mi);
  if (at <= now) {
    const tomorrow = new Date(Date.UTC(y, mo - 1, d + 1));
    at = zonedToUtc(timeZone, tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), h, mi);
  }
  return at;
}
