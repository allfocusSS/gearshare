export const CLUB_TIME_ZONE = 'Asia/Almaty'

/** Use calendar parts rather than the browser's timezone or a UTC date slice. */
export function clubToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (name: string) => parts.find((item) => item.type === name)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
