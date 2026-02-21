/**
 * Processes session data after 30 seconds of idle time.
 * Tracks which messages have been processed and only handles new ones.
 */

import { commitAndPush, hasChanges } from "./git.js";

type ProcessCallback = () => Promise<void>;

let idleTimer: ReturnType<typeof setTimeout> | null = null;
let processedMessageCount = 0;

const IDLE_TIMEOUT_MS = 30_000;

export function resetIdleTimer(onIdle: ProcessCallback) {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(async () => {
    try {
      await onIdle();
      if (await hasChanges()) {
        await commitAndPush("Auto-save session progress");
      }
    } catch (err) {
      console.error("Idle processing error:", err);
    }
  }, IDLE_TIMEOUT_MS);
}

export function cancelIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

export function getProcessedMessageCount() {
  return processedMessageCount;
}

export function setProcessedMessageCount(count: number) {
  processedMessageCount = count;
}

export function resetProcessedMessageCount() {
  processedMessageCount = 0;
}
