# WiFi Support Agent

A small LLM-assisted chat app that helps a user troubleshoot WiFi connectivity issues and, when appropriate, walks them through rebooting a Linksys router.

## Tech Stack

- Next.js app router
- TypeScript
- React
- Vitest

## Getting Started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open `http://localhost:3000`.

## Planned Architecture

The app uses deterministic conversation state for the support flow and reserves the LLM for natural-language understanding and response phrasing.

```text
user message
-> conversation state
-> qualification/reboot decision
-> LLM-assisted response
-> next state
```

## Project Structure

```text
app/                  Next.js pages and API routes
components/           Chat UI components
lib/conversation/     Conversation state, qualification, and reboot flow
lib/llm/              LLM provider integration
tests/                Unit tests
```

## Development Notes

The current scaffold includes a placeholder chat endpoint. The next milestone is to add the deterministic router reboot conversation model.
