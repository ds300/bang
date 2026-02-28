import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { evalAgentTurn } from "./harness";
import { scenarios } from "./scenarios";

let apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  const devVarsPath = join(import.meta.dirname, "..", ".dev.vars");
  if (existsSync(devVarsPath)) {
    const match = readFileSync(devVarsPath, "utf-8").match(
      /^ANTHROPIC_API_KEY=(.+)$/m,
    );
    if (match) apiKey = match[1]!.trim();
  }
}

if (!apiKey) {
  console.error("ANTHROPIC_API_KEY not found in environment or .dev.vars");
  process.exit(1);
}

const filter = process.argv[2];

const selected = filter
  ? scenarios.filter(
      (s) =>
        s.name.toLowerCase().includes(filter.toLowerCase()) ||
        s.tags.some((t) => t.toLowerCase().includes(filter.toLowerCase())),
    )
  : scenarios;

if (selected.length === 0) {
  console.error(`No scenarios matched filter: "${filter}"`);
  console.error("Available scenarios:");
  for (const s of scenarios) {
    console.error(`  - ${s.name} [${s.tags.join(", ")}]`);
  }
  process.exit(1);
}

console.log(`Running ${selected.length} scenario(s)...\n`);

const resultsDir = join(import.meta.dirname, "results");
mkdirSync(resultsDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const reportPath = join(resultsDir, `${timestamp}.md`);

const sections: string[] = [];
sections.push(`# Eval Report — ${new Date().toISOString().slice(0, 19).replace("T", " ")}\n`);

for (const scenario of selected) {
  console.log(`▸ ${scenario.name}`);
  const startTime = Date.now();

  try {
    const result = await evalAgentTurn(scenario, apiKey);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `  ✓ ${result.iterations} iteration(s), ${result.toolCalls.length} tool call(s), ${elapsed}s\n`,
    );

    let section = `## ${scenario.name}\n\n`;
    section += `**Description:** ${scenario.description}\n\n`;
    section += `**Iterations:** ${result.iterations} | **Time:** ${elapsed}s\n\n`;

    section += `### Rubric\n\n`;
    for (const item of scenario.rubric) {
      section += `- ${item.critical ? "**(critical)** " : ""}${item.description}\n`;
    }
    section += "\n";

    section += `### Tool Calls\n\n`;
    if (result.toolCalls.length === 0) {
      section += "_No tool calls made._\n\n";
    } else {
      for (const tc of result.toolCalls) {
        section += `**${tc.name}**\n\`\`\`json\n${JSON.stringify(tc.input, null, 2)}\n\`\`\`\n\n`;
      }
    }

    section += `### Agent Response\n\n`;
    section += `> ${result.responseText.split("\n").join("\n> ")}\n\n`;

    section += `---\n\n`;
    sections.push(section);
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ Error after ${elapsed}s: ${message}\n`);

    let section = `## ${scenario.name}\n\n`;
    section += `**ERROR:** ${message}\n\n---\n\n`;
    sections.push(section);
  }
}

const report = sections.join("");
writeFileSync(reportPath, report, "utf-8");
console.log(`Report written to ${reportPath}`);
