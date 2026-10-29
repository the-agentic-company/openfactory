import type { Agent } from '@openfactory/core';

export function nextScheduledAt(schedule: Agent['schedule'], after: Date): string | null {
  if (schedule.type === 'webhook' || schedule.type === 'manual') {
    return null;
  }
  if (schedule.type === 'interval') {
    return new Date(after.getTime() + schedule.everyMs).toISOString();
  }
  const [hours, minutes] = schedule.timeOfDay.split(':').map(Number);
  for (let day = 0; day <= 7; day++) {
    const candidate = new Date(after);
    candidate.setDate(candidate.getDate() + day);
    candidate.setHours(hours, minutes, 0, 0);
    if (
      candidate > after &&
      (!schedule.weekdays?.length || schedule.weekdays.includes(candidate.getDay()))
    ) {
      return candidate.toISOString();
    }
  }
  throw new Error('No matching day in the schedule.');
}
