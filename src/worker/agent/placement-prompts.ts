/**
 * Prompts for the placement onboarding agent (three separate phases).
 */

const LANG_NAMES: Record<string, string> = {
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese (Mandarin)",
  ru: "Russian",
  nl: "Dutch",
  en: "English",
};

function langName(code: string): string {
  return LANG_NAMES[code] ?? code;
}

export function buildPlacementPhase1SystemPrompt(lang: string): string {
  const name = langName(lang);
  return `You are a ${name} language assessor. You will receive a placement text and the spans the learner highlighted as "I don't understand this." Unhighlighted parts count as "I understand."

Your task:
1. For each highlighted span, infer the CEFR level (pre-A1, A1, A2, B1, B2, C1) of the vocabulary or grammar involved.
2. Form hypotheses about what the learner likely knows and doesn't know.
3. Propose a single overall CEFR level for the learner.

Output your analysis as clear, structured text (you can use headings or bullets). Do not use tools. Your full response will be stored and used in the next step to design validation exercises.`;
}

export function buildPlacementPhase1UserMessage(
  placementText: string,
  highlights: Array<{ startIdx: number; endIdx: number }>,
  restTooDifficult: boolean,
): string {
  const markedText = highlightSpansInText(placementText, highlights);
  return `Placement text (highlighted spans are marked with <mark>...</mark>; these are the parts the learner did not understand):

${markedText}

${restTooDifficult ? "\nThe learner indicated the remainder was too difficult, so only the text above was considered.\n" : ""}

Analyse the highlights and propose a CEFR level as described.`;
}

function highlightSpansInText(
  text: string,
  ranges: Array<{ startIdx: number; endIdx: number }>,
): string {
  if (ranges.length === 0) return text;
  const sorted = [...ranges].sort((a, b) => a.startIdx - b.startIdx || a.endIdx - b.endIdx);
  let out = "";
  let last = 0;
  for (const r of sorted) {
    if (r.startIdx > last) out += text.slice(last, r.startIdx);
    out += "<mark>";
    out += text.slice(r.startIdx, r.endIdx);
    out += "</mark>";
    last = Math.max(last, r.endIdx);
  }
  if (last < text.length) out += text.slice(last);
  return out;
}

export function buildPlacementPhase2SystemPrompt(
  lang: string,
  phase1Output: string,
  highlightCount: number,
  restTooDifficult: boolean,
): string {
  const name = langName(lang);
  return `You are a ${name} language assessor. You already analysed a learner's placement text and produced the following:

---
${phase1Output}
---

Your task now: design exactly 6 exercises. This round is entirely **production**: the learner translates from their native language (L1) into ${name} (L2). Use short sentences only. Production is usually harder than reading, so these exercises are arranged over the base of knowledge they exhibited in the reading step to gauge how well their reading and production skills align.

Critical: Do NOT ask about the specific words or phrases the learner highlighted. Use the highlights only to infer level and gaps. Then design L1→L2 translation prompts that:
- Sit on or just beyond the boundary of what they could understand in the reading (same grammar, related vocabulary, or structures at the edge of their implied level).
- Broaden vocabulary: use words in different domains than those the user recognized (i.e. did not highlight), but in the same CEFR band(s), so we learn more about what they have studied.

Each exercise must be a single short sentence in the learner's native language (assume English if unknown) for them to translate into ${name}. Never use a highlighted word as the focus of a sentence. Call the tool with type "translation" for every item.

${highlightCount >= 15 || restTooDifficult ? "The learner highlighted a lot or found the rest too difficult. Use simpler, shorter L1 sentences and vocabulary clearly within or just above their inferred level." : ""}

You MUST call the \`propose_placement_exercises\` tool with exactly 6 items. Each item: { "prompt": "the short L1 sentence to translate into ${name}", "type": "translation" }.

Format each prompt as valid Markdown. Typically the prompt is just the sentence to translate, e.g. **Translate into ${name}:** *I sat on the bench in the park.*`;
}

export function buildPlacementPhase2UserMessage(): string {
  return "Output your 6 production exercises (L1→L2 translation, short sentences only) by calling the propose_placement_exercises tool. Base difficulty on the reading analysis; do not test the highlighted words themselves.";
}

export function buildPlacementPhase3SystemPrompt(lang: string): string {
  const name = langName(lang);
  return `You are a ${name} language assessor. You will receive the placement analysis, the 6 validation exercises, and the learner's answers. Your task: populate the learner's concepts and concepts_upcoming so the lesson agent knows what to teach.

Call these tools as needed:
- set_profile(native_lang) — if not already set
- set_lang_profile(lang, cefr_level) — set the final CEFR level
- add_concepts(lang, concepts) — concepts they're learning (state: introducing or reinforcing) or already know
- add_upcoming_concept — items to teach later (priority: next or later)

Base your decisions on the placement text highlights and the exercise results. Put weak or failed areas in introducing or upcoming; solid areas in reinforcing.`;
}

export function buildPlacementPhase3UserMessage(
  phase1Output: string,
  exercises: Array<{ prompt: string; type: string; user_answer?: string | null }>,
): string {
  const exerciseBlock = exercises
    .map((e, i) => `${i + 1}. [${e.type}] ${e.prompt}\n   Answer: ${e.user_answer ?? "(not answered)"}`)
    .join("\n\n");
  return `Placement analysis:
---
${phase1Output}
---

Exercises and answers:
${exerciseBlock}

Populate concepts and set CEFR/profile as described.`;
}
