export type ExerciseQuality = "fail" | "hard" | "pass" | "easy";

const QUALITY_MAP: Record<ExerciseQuality, number> = {
  fail: 1,
  hard: 3,
  pass: 4,
  easy: 5,
};

interface SM2State {
  repetitions: number;
  easiness: number;
  interval: number;
}

interface SM2Result extends SM2State {
  nextReview: string;
  recalled: boolean;
}

export function computeSM2(
  quality: ExerciseQuality,
  prev?: Partial<SM2State>,
): SM2Result {
  const q = QUALITY_MAP[quality];
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
