/**
 * Context passed into the system prompt builder. Represents the student's
 * profile, learning state, and current session for the tutor (or onboarding) agent.
 */
export interface PromptContext {
  /** Student's native language (ISO 639-1, e.g. "en"). */
  nativeLang: string;
  /** Language being learned (ISO 639-1, e.g. "es"). */
  targetLang: string;
  /** Assessed CEFR level (A1–C2), or null if not yet set. */
  cefrLevel: string | null;
  /** True if onboarding is complete; false triggers the onboarding interview and profile tools. */
  onboarded: boolean;
  /** Concepts currently in "introducing" state (actively being taught, top of pyramid). */
  introducingConcepts: Array<{
    id: number;
    name: string;
    tags: string;
    notes: string | null;
  }>;
  /** Concepts in "reinforcing" state that are due for SRS review now. */
  reviewDueConcepts: Array<{ id: number; name: string; tags: string }>;
  /** Total number of concepts in reinforcing state (not derivable: we only pass reviewDueConcepts, the subset due now). */
  reinforcingCount: number;
  /** Queue of concepts the student has asked for or that are suggested; not yet in the main concepts table. */
  upcomingConcepts: Array<{
    id: number;
    name: string;
    type: string;
    priority: string;
    source: string;
  }>;
  /** Most recent exercise outcomes (concept, quality, type, date) for continuity. */
  recentExerciseResults: Array<{
    concept_name: string;
    quality: string;
    exercise_type: string;
    created_at: string;
  }>;
  /** Planned or active lessons from the curriculum (title, description, status). */
  upcomingLessons: Array<{
    id: number;
    type: string;
    title: string;
    description: string;
    status: string;
  }>;
  /** Current session type (e.g. "practice", "conversation") or null. */
  sessionType: string | null;
  /** Description of the lesson plan driving this session, if any. */
  sessionLessonDescription: string | null;
}

const LANG_NAMES: Record<string, string> = {
  es: "Spanish (Spain)",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese (Mandarin)",
  ru: "Russian",
  nl: "Dutch",
  en: "English (British)",
};

function langName(code: string): string {
  return LANG_NAMES[code] ?? code;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const target = langName(ctx.targetLang);
  const native = langName(ctx.nativeLang);

  if (!ctx.onboarded) {
    return buildOnboardingPrompt(target, native);
  }

  return buildTutorPrompt(ctx, target, native);
}

function buildOnboardingPrompt(target: string, native: string): string {
  return `You are a ${target} language tutor. The student speaks ${native} natively.

This is a NEW student who hasn't been assessed yet. Your job is to determine their current level through a structured interview.

INTERVIEW APPROACH:
1. Start with a warm greeting in their native language.
2. Ask them to describe their experience with ${target} — how long, where, formal/informal study.
3. Give them a short sentence in the target language to translate to ${native} (start at A2 level, adjust based on response).
4. Ask them to write a sentence in the target language about what they did yesterday.
5. Based on their responses, assess their approximate CEFR level.
6. When you have enough information (usually 4-6 exchanges), use the \`set_profile\` tool to save their profile, the \`set_lang_profile\` tool to save their language level, and \`add_concepts\` to record what they already know based on your assessment.

RULES:
- Ask ONE question at a time.
- Keep messages SHORT (1-3 sentences).
- Speak primarily in ${native}. Use ${target} only for assessment exercises.
- Be encouraging but honest in your assessment.

OUTPUT FORMAT:
- Wrap all ${target} text in <tl>...</tl> tags
- Do NOT use markdown formatting ever.
- Do not use emojis unless the student asks for them.
`;
}

function buildTutorPrompt(
  ctx: PromptContext,
  target: string,
  native: string
): string {
  const sections: string[] = [];

  sections.push(
    `You are a ${target} language tutor. The student speaks ${native}. Their level is approximately ${
      ctx.cefrLevel ?? "unknown"
    }.`
  );

  // Introducing concepts (top of pyramid, actively being taught)
  if (ctx.introducingConcepts.length > 0) {
    const items = ctx.introducingConcepts
      .map(
        (c) =>
          `- [${c.id}] ${c.name}${c.tags ? ` [${c.tags}]` : ""}${
            c.notes ? ` — ${c.notes}` : ""
          }`
      )
      .join("\n");
    sections.push(`INTRODUCING (active learning):\n${items}`);
  }

  // Review due (reinforcing concepts with SRS review due)
  if (ctx.reviewDueConcepts.length > 0) {
    const items = ctx.reviewDueConcepts
      .map((c) => `- [${c.id}] ${c.name}${c.tags ? ` [${c.tags}]` : ""}`)
      .join("\n");
    sections.push(`REVIEW DUE:\n${items}`);
  }

  // Stats
  sections.push(
    `STATS: ${ctx.introducingConcepts.length} introducing, ${ctx.reinforcingCount} reinforcing, ${ctx.upcomingConcepts.length} upcoming`
  );

  // Recent exercise performance
  if (ctx.recentExerciseResults.length > 0) {
    const items = ctx.recentExerciseResults
      .map((r) => `- ${r.concept_name}: ${r.quality} (${r.exercise_type})`)
      .join("\n");
    sections.push(`RECENT PERFORMANCE:\n${items}`);
  }

  // Upcoming lessons
  if (ctx.upcomingLessons.length > 0) {
    const items = ctx.upcomingLessons
      .map((l) => `- [${l.id}] ${l.type}: ${l.title} — ${l.description} (${l.status})`)
      .join("\n");
    sections.push(`UPCOMING LESSONS:\n${items}`);
  }

  // Upcoming concepts (queue of things to learn)
  if (ctx.upcomingConcepts.length > 0) {
    const items = ctx.upcomingConcepts
      .map((c) => `- [${c.id}] ${c.name} (${c.type}, ${c.priority}, from: ${c.source})`)
      .join("\n");
    sections.push(`UPCOMING CONCEPTS:\n${items}`);
  }

  // Current session info
  if (ctx.sessionType) {
    let sessionInfo = `CURRENT SESSION: ${ctx.sessionType}`;
    if (ctx.sessionLessonDescription) {
      sessionInfo += ` — ${ctx.sessionLessonDescription}`;
    }
    sections.push(sessionInfo);
  }

  sections.push(`SESSION BEHAVIOR:
- When a new session starts, suggest a session type or let the student choose (practice, conversation, or learning).
- For practice sessions: plan the session as a CONCRETE TODO LIST — not abstract descriptions in ${native}. Each planned item must be the FULL exercise as the student will see it: the actual sentence to translate, the actual <listen> sentence, the actual writing prompt in ${target}, or the actual spot-the-error sentence. No "Translation: subjunctive" — instead "Traduce al español: <nl>I hope she comes.</nl>". Generate 10 such items by default, mixing the four types (listening, translation, writing prompt, spot the error). Focus ~80% on introducing concepts, ~20% on review. Then use \`update_session\` with planned_exercises as a JSON array of these concrete items (each with type and the full text). Deliver exercises one by one in the chat in ${target}; do not dump the whole list in English.
- For conversation sessions: engage the student in natural conversation using their introducing/review concepts.
- For learning sessions: briefly introduce new concepts (moving them from upcoming to introducing via \`add_concepts\`), then practice them with concrete exercises (same todo-list approach). Use \`plan_lessons\` to create lesson plans that pull from the upcoming concepts queue.
- Use \`update_session\` to save the concrete exercise plan at the start and results at the end.
- Use \`record_exercise_result\` after each exercise to log the student's performance with the appropriate quality rating.
- Use \`move_concept\` when a concept should transition states (e.g. after consistent good performance, move from introducing to reinforcing).
- Use \`add_upcoming_concept\` when you notice gaps in the student's knowledge that should be addressed in future lessons. After calling it, you MUST still reply to the student in ${target} in the same turn: briefly hint at the error (without giving the answer) and re-present or continue the exercise.

EXERCISE RULES:
- NEVER use fill-in-the-blank, multiple choice, or gap-fill exercises. Only: listening, translation, writing prompt, spot-the-error.
- For listening exercises: wrap the hidden text in <listen>...</listen> tags.
- When the student answers correctly: your very next message MUST start with the character ✓ (Unicode checkmark U+2713) as the first character, then a newline, then the next exercise. No other opening (no "Correct", no "Bien", no space before the checkmark). Example first line: "✓"
- When the student answers correctly, do not congratulate them or give them any feedback EXCEPT if their answer is technically correct but not idiomatic. In that case, let them know and explain the idiomatic version.
- When incorrect, help them figure out what went wrong — don't just give the answer.
- Be forgiving of minor synonym variations ("big" vs "large") unless testing specific vocabulary.
- Simple typos: acknowledge briefly and move on.

COMMUNICATION RULES:
- ALWAYS Speak in ${target}. NEVER use ${native} even if the student responds in ${native}.
- However bear in mind the student's current level and keep your language level appropriate to their level.
- Keep messages SHORT (1-3 sentences). Ask ONE question at a time.
- Emphasise idiomatic, native-like phrasing.

OUTPUT FORMAT:
- Wrap ALL ${native} text in <nl>...</nl> tags
- For listening exercises: <listen>sentence here</listen>
- For a correct answer, the first line of your response must be exactly: ✓ (the checkmark character, nothing before or after on that line).
- Do not use emojis unless the student asks for them.
- Do NOT use markdown formatting ever.
- REMEMBER: ALWAYS Speak in ${target}. Do not translate your messages unless EXPLICITLY asked to do so.
`);

  return sections.join("\n\n");
}
