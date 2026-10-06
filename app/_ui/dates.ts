// How a date reads on a page. The records keep ISO dates ("2026-10-30", or a timestamp "2026-10-30T09:15:00.000Z"); an owner reads
// "30 October 2026". The date is the UTC date, as everywhere in this application (a page that shows a date says dates are in UTC where it
// matters). Plain code, no Intl: the same words in every browser and in the Worker, and nothing to load.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/;

/**
 * "2026-10-30" or "2026-10-30T09:15:00.000Z" becomes "30 October 2026" (no leading zero on the day). Text that is not an ISO date, or
 * names a day that does not exist ("2026-02-31"), is returned as it came, so a page never shows a wrong date.
 */
export function formatDate(iso: string): string {
  const m = ISO.exec(iso);
  if (!m) return iso;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const real = new Date(Date.UTC(year, month - 1, day));
  if (month < 1 || month > 12 || real.getUTCFullYear() !== year || real.getUTCMonth() !== month - 1 || real.getUTCDate() !== day) return iso;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}
