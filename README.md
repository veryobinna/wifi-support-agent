# WiFi Support Agent

A small LLM-assisted chat app that helps a user troubleshoot WiFi connectivity issues and, when appropriate, walks them through rebooting a Linksys EA6350 router.

The goal is to produce a reliable support bot — one that asks qualifying questions, exits gracefully when a reboot is not appropriate, guides the user through the exact steps from the router manual, and handles the post-reboot resolution check.

## Tech Stack

- Next.js app router
- TypeScript
- React
- Vitest
- OpenAI Responses API (optional — app runs fully without it)

## Getting Started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

`OPENAI_API_KEY` is optional. Without it, the app uses a keyword-based fallback classifier and deterministic draft responses, so the full conversation flow and all tests work without network access.

## Architecture

The core design decision: the LLM must not own the conversation flow. A support bot that lets a model decide whether to proceed to a reboot, skip a qualification question, or end the conversation is unreliable by design. Instead, a deterministic state machine owns all of that. The LLM has two narrowly scoped jobs:

1. **Intent classification** — interpret raw user text into a typed `UserIntent` (answer, question, completion, greeting, unknown).
2. **Response phrasing** — take a deterministic draft response and make it sound natural, or answer an inline question using manual-grounded context.

```
raw user message
  → classifyUserIntent          (LLM or fallback)
  → advanceConversation(session, intent)   (deterministic)
  → generateAssistantResponse   (LLM or fallback)
  → API response
```

`UserIntent` describes what the user said, not how to mutate state. The classifier can return `answer: general_connectivity` but only the state machine decides which qualification field to update and what happens next.

### Conversation States

```
START
  → QUALIFYING
      → NOT_APPROPRIATE_EXIT   (single device / specific service / ISP outage /
                                 equipment issue / no access / bad timing)
      → REBOOT_INTRO
          → REBOOT_STEP_1 … REBOOT_STEP_6
              → CHECK_RESOLUTION
                  → RESOLVED_EXIT
                  → UNRESOLVED_EXIT
```

### Qualification Logic

Six questions determine whether a reboot is appropriate:

| Question | Disqualifying answer |
|---|---|
| Device impact | Single device only |
| Connectivity scope | Specific app or website only |
| Equipment status | Power or cable issue present |
| Known ISP outage | Yes |
| Can access equipment | No |
| Accepts temporary interruption | No |

All six must pass for the reboot flow to proceed.

### Reboot Steps

The six power-cord steps are sourced directly from the Linksys EA6350 manual. The bot explicitly warns users not to press or hold the Reset button, which distinguishes a reboot from a factory reset.

## Observability

Each API turn emits one structured JSON log line including:
- classified intent
- previous and next conversation state
- previous and next qualification question
- deterministic draft response
- whether the classifier and response layer used the LLM or fallback path, and why

```json
{
  "event": "conversation.turn",
  "intent": { "type": "answer", "value": "general_connectivity" },
  "previousState": "START",
  "nextState": "QUALIFYING",
  "classifierSource": "llm",
  "classifierReason": "llm_success",
  "responseSource": "llm",
  "responseReason": "llm_success"
}
```

User text is not logged by default. Set `LOG_USER_TEXT=true` in `.env.local` for local debugging.

Assistant text is also omitted by default. Set `LOG_ASSISTANT_TEXT=true` if you need to compare the deterministic draft with the final assistant response during local debugging.

Append `?review=1` to the app URL to enable a reviewer debug panel. It shows the current session state, qualification answers, and the latest turn metadata without changing the conversation flow.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | No | Enables LLM intent classification and response generation |
| `OPENAI_MODEL` | No | Override the model (default: `gpt-4o-mini`) |
| `LOG_USER_TEXT` | No | Set to `true` to include raw user input in turn logs |
| `LOG_ASSISTANT_TEXT` | No | Set to `true` to include the final assistant message in turn logs |

## Project Structure

```
app/                  Next.js pages and API routes
components/           Chat UI components
lib/conversation/     State machine, qualification, reboot steps, intent types
lib/llm/              Intent classifier, fallback classifier, response generation
lib/observability/    Structured turn logging
tests/                Unit tests
```

## Running Validation

Requires Node 20 or newer.

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

All tests run without network access and do not require an API key.

The test suite includes a deterministic golden transcript harness for end-to-end workflow regression coverage. Those fixtures check named support transcripts against expected state progression and terminal outcomes without calling the LLM.
