export interface TestScenario {
  name: string;
  description: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export const TEST_SCENARIOS: TestScenario[] = [
  {
    name: "New session",
    description: "Agent receives 'Start a new session' — should plan exercises and present the first one",
    messages: [
      { role: "user", content: "Start a new session." },
    ],
  },
  {
    name: "Incorrect answer",
    description: "User gives a wrong translation — agent should help them figure out the error, not just give the answer",
    messages: [
      { role: "user", content: "Start a new session." },
      {
        role: "assistant",
        content: "Ejercicio 1 de 10 — Traducción\n\nTraduce al español:\n\n<nl>\"I hope that she comes to the party.\"</nl>",
      },
      { role: "user", content: "Espero que ella viene a la fiesta." },
    ],
  },
  {
    name: "Correct answer",
    description: "User gives a correct translation — agent should respond with ✓ and move on immediately",
    messages: [
      { role: "user", content: "Start a new session." },
      {
        role: "assistant",
        content: "Ejercicio 1 de 10 — Traducción\n\nTraduce al español:\n\n<nl>\"I hope that she comes to the party.\"</nl>",
      },
      { role: "user", content: "Espero que ella venga a la fiesta." },
    ],
  },
  {
    name: "Request listening only",
    description: "User requests only listening exercises — agent should respect this and use <listen> tags",
    messages: [
      { role: "user", content: "Start a new session. I only want listening exercises today." },
    ],
  },
  {
    name: "Request translation only",
    description: "User requests only translation exercises — agent should present only translation prompts",
    messages: [
      { role: "user", content: "Start a new session. Only translation exercises please." },
    ],
  },
];
