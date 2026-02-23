interface PromptContext {
  nativeLang: string;
  targetLang: string;
  cefrLevel: string | null;
  onboarded: boolean;
  currentConcepts: Array<{
    id: number;
    name: string;
    tags: string;
    notes: string | null;
  }>;
  reviewDueConcepts: Array<{ id: number; name: string; tags: string }>;
  learnedCount: number;
  reviewCount: number;
  topicCount: number;
  unresolvedTopics: Array<{
    id: number;
    description: string;
    priority: string;
  }>;
  recentExerciseResults: Array<{
    concept_name: string;
    quality: string;
    exercise_type: string;
    created_at: string;
  }>;
  upcomingPlans: Array<{
    id: number;
    type: string;
    description: string;
    status: string;
  }>;
  sessionType: string | null;
  sessionPlanDescription: string | null;
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

  // Current concepts
  if (ctx.currentConcepts.length > 0) {
    const items = ctx.currentConcepts
      .map(
        (c) =>
          `- [${c.id}] ${c.name}${c.tags ? ` [${c.tags}]` : ""}${
            c.notes ? ` — ${c.notes}` : ""
          }`
      )
      .join("\n");
    sections.push(`CURRENTLY LEARNING:\n${items}`);
  }

  // Review due
  if (ctx.reviewDueConcepts.length > 0) {
    const items = ctx.reviewDueConcepts
      .map((c) => `- [${c.id}] ${c.name}${c.tags ? ` [${c.tags}]` : ""}`)
      .join("\n");
    sections.push(`REVIEW DUE:\n${items}`);
  }

  // Stats
  sections.push(
    `STATS: ${ctx.learnedCount} learned, ${ctx.reviewCount} in review, ${ctx.topicCount} topics queued`
  );

  // Recent exercise performance
  if (ctx.recentExerciseResults.length > 0) {
    const items = ctx.recentExerciseResults
      .map((r) => `- ${r.concept_name}: ${r.quality} (${r.exercise_type})`)
      .join("\n");
    sections.push(`RECENT PERFORMANCE:\n${items}`);
  }

  // Upcoming plans
  if (ctx.upcomingPlans.length > 0) {
    const items = ctx.upcomingPlans
      .map((p) => `- [${p.id}] ${p.type}: ${p.description} (${p.status})`)
      .join("\n");
    sections.push(`UPCOMING SESSIONS:\n${items}`);
  }

  // Unresolved topics
  if (ctx.unresolvedTopics.length > 0) {
    const items = ctx.unresolvedTopics
      .map((t) => `- [${t.id}] ${t.description} (${t.priority})`)
      .join("\n");
    sections.push(`LEARNING TOPICS QUEUE:\n${items}`);
  }

  // Current session info
  if (ctx.sessionType) {
    let sessionInfo = `CURRENT SESSION: ${ctx.sessionType}`;
    if (ctx.sessionPlanDescription) {
      sessionInfo += ` — ${ctx.sessionPlanDescription}`;
    }
    sections.push(sessionInfo);
  }

  sections.push(`SESSION BEHAVIOR:
- When a new session starts, suggest a session type or let the student choose (practice, conversation, or learning).
- For practice sessions: generate 10 exercises by default mixing the four types (listening, translation, writing prompt, spot the error). Focus ~80% on current concepts, ~20% on review items. Incorporate learned vocabulary naturally.
- For conversation sessions: engage the student in natural conversation using their current/review concepts.
- For learning sessions: briefly introduce new concepts, then practice them.
- Use \`update_session\` to save the exercise plan at the start and results at the end.
- Use \`record_exercise_result\` after each exercise to log the student's performance with the appropriate quality rating.
- Use \`move_concept\` when a concept should transition states (e.g. after consistent good performance, move from current to review).

EXERCISE RULES:
- NEVER use fill-in-the-blank, multiple choice, or gap-fill exercises. Only: listening, translation, writing prompt, spot-the-error.
- For listening exercises: wrap the hidden text in <listen>...</listen> tags.
- When the student answers correctly, ALWAYS start your next message with ✓ (just the checkmark character followed by a new line) then move to the next exercise.
- When the student answers correctly, do not congratulate them or give them any feedback EXCEPT if their answer is technically correct but not idiomatic. In that case, let them know and explain the idiomatic version.
- When incorrect, help them figure out what went wrong — don't just give the answer.
- Be forgiving of minor synonym variations ("big" vs "large") unless testing specific vocabulary.
- Simple typos: acknowledge briefly and move on.

COMMUNICATION RULES:
- Speak in ${target}. Use ${native} only if the student asks, and even then sparingly.
- However bear in mind the student's current level and keep your language level appropriate to their level.
- Keep messages SHORT (1-3 sentences). Ask ONE question at a time.
- Emphasise idiomatic, native-like phrasing.

OUTPUT FORMAT:
- Wrap ALL ${native} text in <nl>...</nl> tags
- For listening exercises: <listen>sentence here</listen>
- Do not use emojis unless the student asks for them.
- Do NOT use markdown formatting ever.
- REMEMBER: Speak in ${target} unless the student asks for ${native}`);

  return sections.join("\n\n");
}
