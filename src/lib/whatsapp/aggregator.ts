export interface NotificationEvent {
  userId: string;
  phoneE164: string;
  category: "match" | "message" | "payment" | "admin";
  conversationId?: string;
  title: string;
  body: string;
}

const AGGREGATION_WINDOW = 60_000;
const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; event: NotificationEvent }>();

function key(event: NotificationEvent): string {
  return event.category === "message" && event.conversationId
    ? `${event.userId}:${event.conversationId}`
    : `${event.userId}:${event.category}`;
}

export function scheduleNotification(
  event: NotificationEvent,
  send: (e: NotificationEvent) => Promise<void>,
): void {
  const k = key(event);
  const existing = pending.get(k);
  if (existing) {
    clearTimeout(existing.timer);
    existing.event = event;
    existing.timer = setTimeout(() => {
      pending.delete(k);
      send(event);
    }, AGGREGATION_WINDOW);
    return;
  }
  const timer = setTimeout(() => {
    pending.delete(k);
    send(event);
  }, AGGREGATION_WINDOW);
  pending.set(k, { timer, event });
}
