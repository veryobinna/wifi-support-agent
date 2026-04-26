# WiFi Support Agent

A small LLM-assisted chat app that helps a user troubleshoot WiFi connectivity issues and, when appropriate, walks them through rebooting a Linksys router.

## Tech Stack

- Next.js app router
- TypeScript
- React
- Vitest
- Optional OpenAI Responses API integration

## Getting Started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open `http://localhost:3000`.

`OPENAI_API_KEY` is optional. Without it, the app uses deterministic local fallback behavior so the workflow and tests still run.

## Architecture

The app is a deterministic support workflow with LLM assistance. The state machine owns the conversation flow, qualification updates, reboot decisions, reboot step order, and exits. The LLM is used only to interpret raw language into structured intent and to phrase/answer responses inside the current state.

```text
raw user message
-> classifyUserIntent
-> advanceConversation(session, intent)
-> generateAssistantResponse
-> API response
```

`UserIntent` describes what the user said, not how to mutate state. For example, the classifier can return `answer: general_connectivity`, but only the state machine decides which qualification field to update.

If no API key is configured, a small fallback classifier handles local/demo intent parsing. Unit tests pass `UserIntent` objects directly to the engine and do not call the LLM.

## Observability

The API emits one structured JSON log per chat turn to help debug intent-classification and state-transition issues. Each event includes the classified intent, previous and next state, previous and next question id, deterministic draft response, and whether the classifier and response layer used the LLM path or fallback path.

User text is not logged by default. Set `LOG_USER_TEXT=true` in `.env.local` if you need raw user input in the logs while debugging locally.

## Project Structure

```text
app/                  Next.js pages and API routes
components/           Chat UI components
lib/conversation/     Conversation state, qualification, and reboot flow
lib/llm/              Intent classifier and response generation
lib/observability/    Structured logging for debugging turn behavior
tests/                Unit tests
```

## Development Notes

Run validation with Node 20 or newer:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```
