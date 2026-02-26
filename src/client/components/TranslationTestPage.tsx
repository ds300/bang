/**
 * Translation test page: exercises TranslatableContent with sample text.
 * See TranslatableContent.tsx for the full tooltip/selection design.
 */

import { Link } from "react-router-dom";
import { parseMessageSegments } from "@/lib/sentences";
import { apiFetch } from "@/lib/api";
import { TranslatableContent } from "@/components/TranslatableContent";
import { ArrowLeft } from "lucide-react";

const SAMPLE_CONTENT = `
<tl>El sol brillaba sobre el antiguo pueblo. Las calles estaban vacías y el viento traía olor a pan recién hecho desde la panadería.</tl>

<tl>En la plaza principal, una fuente de piedra llevaba siglos sin agua.

Los niños jugaban a la sombra de los árboles mientras las abuelas hablaban en los bancos.</tl>

<nl>This is a short **native-language** sentence so the formatter handles mixed segments.</nl>

<tl>Por la tarde, cuando el calor amainaba, los vecinos salían a sus balcones. La vida seguía su curso, lenta y tranquila, como siempre había sido.</tl>
`.trim();

const LANG = "es";

export function TranslationTestPage() {
  const segments = parseMessageSegments(SAMPLE_CONTENT, "tl");

  const handleTranslate = async (
    context: string,
    signal?: AbortSignal
  ) => {
    const res = await apiFetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang: LANG, context }),
      signal,
    });
    const data = await res.json();
    return data.translation ?? null;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-2xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <div className="rounded-2xl border bg-card px-6 py-5 shadow-sm">
          <h1 className="text-lg font-semibold mb-4">Translation test</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Select text to see translation. Same segment formatter as message
            bubbles.
          </p>
          <TranslatableContent
            lang={LANG}
            markdown={segments.map((seg) => seg.text).join("\n\n")}
            onTranslate={handleTranslate}
            className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          />
        </div>
      </div>
    </div>
  );
}
