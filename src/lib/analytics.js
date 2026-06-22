import client from '@/api/client';

/** Fire-and-forget client event for product analytics. */
export function trackClientEvent(eventType, metadata = {}) {
  if (typeof window === 'undefined') return;
  void client.post('/study/events', { event_type: eventType, metadata }).catch(() => {
    /* non-blocking */
  });
}
