# Bang

An agentic language tutor that runs locally. Uses Claude to teach languages through structured practice, conversation, and interactive exercises.

## Setup

```bash
npm install
```

Create a `.env` file with your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

## Running

```bash
npm run dev
```

This starts both the Fastify backend (port 3001) and Vite dev server (port 5173). Open http://localhost:5173.

## How it works

- Click **+** to start a new session
- The agent interviews you on first use to assess your level
- Choose between practice, conversation, or learning sessions
- Click any target-language sentence to see a translation
- Click the translation to open a full grammatical breakdown
- Toggle audio with the speaker icon

## Data

Your learning data lives in `data/<lang>/` as markdown files. These are version-controlled and auto-committed after sessions.
