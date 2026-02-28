# Agent Eval Skill

Run agent evaluation scenarios and grade the results.

## When to Use

Use this skill when the user asks to:
- Run evals / evaluations / tests for the tutor agent
- Check whether the agent behaves correctly in specific scenarios
- Grade eval results
- Iterate on prompt or tool changes based on eval failures

Trigger phrases: "run evals", "eval", "/eval", "run the tests", "evaluate the agent"

## Workflow

### 1. Run the Eval Script

```bash
npx tsx evals/run.ts [filter]
```

- The API key is auto-loaded from `.dev.vars` (fallback to `ANTHROPIC_API_KEY` env var)
- `filter` is an optional substring match on scenario name or tags
- Examples: `npx tsx evals/run.ts subjunctive`, `npx tsx evals/run.ts error-correction`
- Omit the filter to run all scenarios
- The script outputs a markdown report to `evals/results/YYYY-MM-DDTHH-mm-ss.md`
- Each scenario takes ~2-6 seconds (real LLM calls to Sonnet). Full suite ~20-30s.

If the user provides a filter like "eval error correction", extract the filter from their message and pass it to the script.

### 2. Read the Report

Open the most recent file in `evals/results/`. The report contains for each scenario:
- **Description**: what the scenario tests
- **Rubric**: what to check (items marked **(critical)** must pass)
- **Tool Calls**: every tool the agent called, with full JSON inputs
- **Agent Response**: the agent's final text response

### 3. Grade Each Scenario

For each rubric item, assign a score:
- **0 = missed**: the agent didn't do the expected thing at all
- **1 = partial**: the agent did something related but not quite right (e.g. called the right tool but with wrong parameters, or gave a vague response)
- **2 = nailed it**: the agent did exactly the right thing

Include a one-line reason for each grade.

**Grading rules:**
- For "should NOT call X" rubric items: check that the tool was never called. Score 2 if absent, 0 if present.
- For "should call X" rubric items: check both the tool name and the input parameters. Score 2 if tool called with reasonable params, 1 if tool called but params are off, 0 if not called.
- For response-quality rubric items (e.g. "respond in Spanish", "keep it brief"): read the Agent Response section and judge.

### 4. Summarize

Present results in a table:

| Scenario | Critical | Other | Pass? |
|----------|----------|-------|-------|
| Name | X/Y | X/Y | YES/NO |

A scenario **passes** if:
- ALL critical rubric items score >= 1
- Total score across all items >= 50% of maximum

### 5. Iterate on Failures

If any scenario fails:

1. Identify the root cause from the tool calls and agent response
2. Determine whether the fix belongs in:
   - `src/worker/agent/prompts.ts` (system prompt wording, instructions)
   - `src/worker/agent/tools.ts` (tool descriptions, parameter schemas)
   - `evals/scenarios.ts` (scenario itself was unrealistic or rubric was too strict)
3. Propose the specific change
4. After making the change, re-run the failing scenario to verify the fix: `npx tsx evals/run.ts "scenario name"`

## File Locations

- Eval harness: `evals/harness.ts`
- Scenarios: `evals/scenarios.ts`
- Runner: `evals/run.ts`
- Reports: `evals/results/*.md`
- System prompt: `src/worker/agent/prompts.ts`
- Tool definitions: `src/worker/agent/tools.ts`
- Production agent loop: `src/worker/agent/harness.ts`

## Adding New Scenarios

Edit `evals/scenarios.ts`. Each scenario needs:
- `name`: short descriptive name
- `tags`: array of tags for filtering (e.g. `["error-correction", "concept-proposal"]`)
- `description`: what the scenario tests
- `context`: a `PromptContext` object that builds the system prompt
- `messages`: array of `{role, content}` message pairs (handwritten)
- `rubric`: array of `{description, critical}` items

Use the existing scenarios as templates. The `B1_SPANISH_BASE` spread object in `scenarios.ts` provides common context fields.
