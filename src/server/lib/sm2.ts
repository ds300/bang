/**
 * SM-2 spaced repetition algorithm.
 * https://en.wikipedia.org/wiki/SuperMemo#SM-2
 */

export interface SM2State {
  /** Number of consecutive correct responses */
  repetitions: number;
  /** Easiness factor (minimum 1.3) */
  easiness: number;
  /** Current interval in days */
  interval: number;
  /** Date of next review (ISO string) */
  nextReview: string;
}

export interface SM2Result extends SM2State {
  /** Whether the item was recalled successfully (quality >= 3) */
  recalled: boolean;
}

/**
 * Compute the next SM-2 state given a quality response.
 * @param quality 0-5 rating (0 = complete blackout, 5 = perfect response)
 * @param prev previous state, or undefined for a new item
 */
export function computeSM2(
  quality: number,
  prev?: Partial<SM2State>,
): SM2Result {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let repetitions = prev?.repetitions ?? 0;
  let easiness = prev?.easiness ?? 2.5;
  let interval = prev?.interval ?? 0;

  easiness = Math.max(
    1.3,
    easiness + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
  );

  if (q < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(interval * easiness);
    }
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  return {
    repetitions,
    easiness: Math.round(easiness * 100) / 100,
    interval,
    nextReview: nextReview.toISOString().slice(0, 10),
    recalled: q >= 3,
  };
}
