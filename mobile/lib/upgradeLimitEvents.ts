export type UpgradeLimitPayload = { reason?: string };

let listener: ((payload: UpgradeLimitPayload) => void) | null = null;

export function emitUpgradeLimit(payload: UpgradeLimitPayload) {
  listener?.(payload);
}

export function subscribeUpgradeLimit(next: (payload: UpgradeLimitPayload) => void) {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}
