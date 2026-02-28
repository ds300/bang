import type { EvalScenario } from "./harness";

const B1_SPANISH_BASE = {
  nativeLang: "en",
  targetLang: "es",
  cefrLevel: "B1" as const,
  onboarded: true,
  reinforcingCount: 5,
  recentExerciseResults: [] as Array<{
    concept_name: string;
    quality: string;
    exercise_type: string;
    created_at: string;
  }>,
  upcomingLessons: [] as Array<{
    id: number;
    type: string;
    title: string;
    description: string;
    status: string;
  }>,
  sessionType: "practice" as string | null,
  sessionLessonDescription: null as string | null,
};

export const scenarios: EvalScenario[] = [
  // ── 1. B1 subjunctive gap ──────────────────────────────────────────────
  {
    name: "B1 subjunctive gap",
    tags: ["error-correction", "concept-proposal"],
    description:
      'B1 student translates "I hope she comes tomorrow" as "Espero que viene mañana" ' +
      "(indicative instead of subjunctive). Subjunctive is NOT in any concept list. " +
      "The agent should notice the gap and propose adding it.",
    context: {
      ...B1_SPANISH_BASE,
      introducingConcepts: [
        {
          id: 1,
          name: "preterite vs imperfect",
          tags: "grammar|past-tense",
          notes: null,
        },
        {
          id: 2,
          name: "direct object pronouns",
          tags: "grammar|pronouns",
          notes: null,
        },
      ],
      reviewDueConcepts: [
        { id: 3, name: "ser vs estar", tags: "grammar|verbs" },
      ],
      upcomingConcepts: [
        {
          id: 1,
          name: "por vs para",
          type: "grammar",
          priority: "soon",
          source: "curriculum",
        },
      ],
      recentExerciseResults: [
        {
          concept_name: "preterite vs imperfect",
          quality: "pass",
          exercise_type: "translation",
          created_at: new Date().toISOString(),
        },
      ],
    },
    messages: [
      {
        role: "assistant",
        content:
          "✓\n\nMuy bien. Siguiente ejercicio.\n\nTraduce al español: <nl>I hope she comes tomorrow.</nl>",
      },
      {
        role: "user",
        content: "Espero que viene mañana.",
      },
    ],
    rubric: [
      {
        description:
          "Agent should call add_upcoming_concept with a name related to the subjunctive mood " +
          '(e.g. "present subjunctive", "subjuntivo", "subjunctive after esperar que") ' +
          "and source=ai_suggestion.",
        critical: true,
      },
      {
        description:
          "Agent should help the student figure out the error without giving the answer directly.",
        critical: false,
      },
      {
        description: "Agent should respond in Spanish.",
        critical: false,
      },
    ],
  },

  // ── 2. A2 typo — no concept needed ─────────────────────────────────────
  {
    name: "A2 typo — no concept needed",
    tags: ["error-correction", "negative-case"],
    description:
      'A2 student translates "I have two cats" as "Tengi dos gatos" (typo on tengo). ' +
      "The agent should NOT add a concept — this is a typo, not a knowledge gap.",
    context: {
      nativeLang: "en",
      targetLang: "es",
      cefrLevel: "A2",
      onboarded: true,
      introducingConcepts: [
        {
          id: 1,
          name: "present tense regular -ar verbs",
          tags: "grammar|verbs|present",
          notes: null,
        },
        {
          id: 2,
          name: "gender and number agreement",
          tags: "grammar|adjectives",
          notes: null,
        },
      ],
      reviewDueConcepts: [],
      reinforcingCount: 3,
      upcomingConcepts: [
        {
          id: 1,
          name: "present tense irregular verbs",
          type: "grammar",
          priority: "next",
          source: "curriculum",
        },
      ],
      recentExerciseResults: [
        {
          concept_name: "present tense regular -ar verbs",
          quality: "pass",
          exercise_type: "translation",
          created_at: new Date().toISOString(),
        },
      ],
      upcomingLessons: [],
      sessionType: "practice",
      sessionLessonDescription: null,
    },
    messages: [
      {
        role: "assistant",
        content: "Traduce al español: <nl>I have two cats.</nl>",
      },
      {
        role: "user",
        content: "Tengi dos gatos.",
      },
    ],
    rubric: [
      {
        description:
          "Agent should NOT call add_upcoming_concept — this is a typo, not a knowledge gap.",
        critical: true,
      },
      {
        description:
          'Agent should acknowledge the typo briefly and move on (per prompt rule: "Simple typos: acknowledge briefly and move on").',
        critical: false,
      },
      {
        description: "Agent should respond in Spanish.",
        critical: false,
      },
    ],
  },

  // ── 3. B1 ser/estar slip — common L1 interference ─────────────────────
  {
    name: "B1 ser/estar slip — common L1 interference",
    tags: ["error-correction", "negative-case", "linguistic-awareness"],
    description:
      'B1 student translates "I am tired" as "Soy cansado" (ser instead of estar). ' +
      "Ser vs estar is NOT in any concept list — it's too fundamental for B1 to track. " +
      "The agent should correct briefly without overreacting or adding a concept.",
    context: {
      ...B1_SPANISH_BASE,
      introducingConcepts: [
        {
          id: 1,
          name: "preterite vs imperfect",
          tags: "grammar|past-tense",
          notes: null,
        },
        { id: 2, name: "reflexive verbs", tags: "grammar|verbs", notes: null },
      ],
      reviewDueConcepts: [],
      upcomingConcepts: [
        {
          id: 1,
          name: "por vs para",
          type: "grammar",
          priority: "soon",
          source: "curriculum",
        },
      ],
    },
    messages: [
      {
        role: "assistant",
        content: "Traduce al español: <nl>I am tired.</nl>",
      },
      {
        role: "user",
        content: "Soy cansado.",
      },
    ],
    rubric: [
      {
        description:
          "Agent should NOT call add_upcoming_concept — ser vs estar is too fundamental for B1 to treat as a new gap.",
        critical: true,
      },
      {
        description:
          "Agent should correct the error — the student needs to hear it's estar, not ser, for temporary states.",
        critical: true,
      },
      {
        description:
          "Agent should keep it brief and proportional — quick correction, not a full ser/estar lecture.",
        critical: false,
      },
      {
        description: "Agent should respond in Spanish.",
        critical: false,
      },
    ],
  },

  // ── 4. Correct answer — no concept needed ──────────────────────────────
  {
    name: "Correct answer — no concept needed",
    tags: ["positive-case", "exercise-flow"],
    description:
      "B1 student correctly translates a preterite vs imperfect sentence. " +
      "The agent should mark it as passed and move on.",
    context: {
      ...B1_SPANISH_BASE,
      introducingConcepts: [
        {
          id: 1,
          name: "preterite vs imperfect",
          tags: "grammar|past-tense",
          notes: null,
        },
        { id: 2, name: "reflexive verbs", tags: "grammar|verbs", notes: null },
      ],
      reviewDueConcepts: [],
      upcomingConcepts: [
        {
          id: 1,
          name: "por vs para",
          type: "grammar",
          priority: "soon",
          source: "curriculum",
        },
      ],
      recentExerciseResults: [
        {
          concept_name: "reflexive verbs",
          quality: "pass",
          exercise_type: "translation",
          created_at: new Date().toISOString(),
        },
      ],
    },
    messages: [
      {
        role: "assistant",
        content:
          "Traduce al español: <nl>When I was young, I used to go to the beach every summer.</nl>",
      },
      {
        role: "user",
        content: "Cuando era joven, iba a la playa cada verano.",
      },
    ],
    rubric: [
      {
        description:
          "Agent should NOT call add_upcoming_concept — the student got it right.",
        critical: true,
      },
      {
        description:
          "Agent should start its response with the checkmark character (✓) per prompt rules for correct answers.",
        critical: true,
      },
      {
        description:
          "Agent should call record_exercise_result for concept 1 (preterite vs imperfect) with quality pass or easy.",
        critical: false,
      },
      {
        description:
          "Agent should not congratulate or give unnecessary feedback — just move to the next exercise.",
        critical: false,
      },
      {
        description: "Agent should respond in Spanish.",
        critical: false,
      },
    ],
  },

  // ── 5. Student asks to learn something ─────────────────────────────────
  {
    name: "Student asks to learn something",
    tags: ["user-request", "concept-proposal"],
    description:
      'Mid-exercise, A2 student says "I want to learn how to talk about the weather." ' +
      "The agent should add an upcoming concept with source=user_request and steer back to the session.",
    context: {
      nativeLang: "en",
      targetLang: "es",
      cefrLevel: "A2",
      onboarded: true,
      introducingConcepts: [
        {
          id: 1,
          name: "present tense regular -ar verbs",
          tags: "grammar|verbs|present",
          notes: null,
        },
        {
          id: 2,
          name: "gender and number agreement",
          tags: "grammar|adjectives",
          notes: null,
        },
      ],
      reviewDueConcepts: [],
      reinforcingCount: 3,
      upcomingConcepts: [
        {
          id: 1,
          name: "present tense irregular verbs",
          type: "grammar",
          priority: "next",
          source: "curriculum",
        },
      ],
      recentExerciseResults: [
        {
          concept_name: "present tense regular -ar verbs",
          quality: "pass",
          exercise_type: "translation",
          created_at: new Date().toISOString(),
        },
      ],
      upcomingLessons: [],
      sessionType: "practice",
      sessionLessonDescription: null,
    },
    messages: [
      {
        role: "assistant",
        content: "Traduce al español: <nl>She speaks Spanish very well.</nl>",
      },
      {
        role: "user",
        content: "I want to learn how to talk about the weather",
      },
    ],
    rubric: [
      {
        description:
          "Agent should call add_upcoming_concept with a name related to weather vocabulary/expressions " +
          "and source=user_request.",
        critical: true,
      },
      {
        description:
          "Agent should acknowledge the request — the student should feel heard.",
        critical: false,
      },
      {
        description:
          "Agent should steer back to the current session after acknowledging.",
        critical: false,
      },
      {
        description: "Agent should respond in Spanish.",
        critical: false,
      },
    ],
  },

  // ── 6. Student asks for clarification mid-exercise ─────────────────────
  {
    name: "Student asks for clarification mid-exercise",
    tags: ["clarification", "exercise-flow"],
    description:
      "B1 student got preterite/imperfect wrong (fui vs iba), agent hinted at habitual actions, " +
      'student asks "wait, what\'s the difference between fui and iba?" ' +
      "Agent should explain and re-present the exercise.",
    context: {
      ...B1_SPANISH_BASE,
      introducingConcepts: [
        {
          id: 1,
          name: "preterite vs imperfect",
          tags: "grammar|past-tense",
          notes: null,
        },
        { id: 2, name: "reflexive verbs", tags: "grammar|verbs", notes: null },
      ],
      reviewDueConcepts: [],
      upcomingConcepts: [
        {
          id: 1,
          name: "por vs para",
          type: "grammar",
          priority: "soon",
          source: "curriculum",
        },
      ],
    },
    messages: [
      {
        role: "assistant",
        content:
          "Traduce al español: <nl>When I was a child, I used to go to the park every day.</nl>",
      },
      {
        role: "user",
        content: "Cuando era niño, fui al parque cada día.",
      },
      {
        role: "assistant",
        content:
          "Casi. Piensa en la acción de ir al parque — ¿fue algo que pasó una vez, o algo que hacías habitualmente?",
      },
      {
        role: "user",
        content: "wait, what's the difference between fui and iba?",
      },
    ],
    rubric: [
      {
        description:
          "Agent should explain the preterite vs imperfect distinction as it relates to ir " +
          "(fui = completed/one-time, iba = habitual/ongoing).",
        critical: true,
      },
      {
        description:
          "Agent should re-present the original exercise or prompt the student to try again — " +
          "the exercise is still unanswered.",
        critical: true,
      },
      {
        description:
          "Agent should NOT call add_upcoming_concept — preterite vs imperfect is already an introducing concept.",
        critical: false,
      },
      {
        description: "Agent should NOT move on to a different exercise.",
        critical: false,
      },
      {
        description:
          "Agent should respond in Spanish (with possible <nl> tags for English clarifications).",
        critical: false,
      },
    ],
  },

  {
    name: "Student asks for irregular gerunds",
    tags: ["concept-proposal"],
    description:
      "Student asks for irregular gerunds, agent should propose a lesson plan to teach the different classes of irregular gerunds",
    context: {
      nativeLang: "en",
      targetLang: "es",
      cefrLevel: "A2",
      onboarded: true,
      introducingConcepts: [],
      reviewDueConcepts: [],
      reinforcingCount: 0,
      recentExerciseResults: [],
      upcomingConcepts: [],
      upcomingLessons: [],
      sessionType: "practice",
      sessionLessonDescription: null,
    },
    messages: [
      {
        role: "assistant",
        content:
          "Vamos a empezar. ¿Qué tipo de sesión quieres hoy?\n\npractica — ejercicios de traducción, escritura y escucha\nconversacion — hablamos sobre un tema libre\naprendizaje — introducimos conceptos nuevos",
      },
      { role: "user", content: "teach me the irregular gerunds" },
    ],
    rubric: [
      {
        description:
          "Agent should propose a lesson plan to teach the different classes of irregular gerunds",
        critical: true,
      },
    ],
  },
] satisfies EvalScenario[];
