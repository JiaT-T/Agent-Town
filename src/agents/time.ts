export const DAY_MINUTES = 24 * 60;

export function parseTimeToMinutes(time: string): number {
  const [hours = '0', minutes = '0'] = time.split(':');
  return (Number(hours) * 60 + Number(minutes)) % DAY_MINUTES;
}

export function formatTime(minutes: number): string {
  const wrappedMinutes = ((Math.floor(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const hours = Math.floor(wrappedMinutes / 60);
  const mins = wrappedMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export function minutesUntil(fromMinutes: number, toMinutes: number): number {
  return (toMinutes - fromMinutes + DAY_MINUTES) % DAY_MINUTES;
}
