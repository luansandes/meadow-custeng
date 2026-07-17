# Meadow Vet Care services chatbot

This repository contains a GitHub Pages chat interface and a Vercel serverless API. The API answers only from the configured Google Sheet.

## Chat logic

The chatbot intentionally keeps its logic small and inspectable:

- `chatbot-instructions.md` is the editable source of truth for the assistant's instructions. Change it and deploy to update its behavior.
- `lib/chat-logic.js` downloads the Google Sheet's CSV on every chat request, defines the JSON response schema, limits chat history, and turns LLM-selected IDs into safe source chips.
- `lib/live-context.js` fetches the latest Dublin weather and Irish public-holiday calendar on every message. If either provider is unavailable, the chatbot continues without that live data.
- `api/chat.js` validates the request and calls the OpenAI Responses API. It sends the complete sheet catalog, live Dublin context, and recent conversation to the LLM; there is no hidden keyword-ranking or embedding layer.
- `index.html` stores the most recent eight user/assistant messages in the browser tab's `sessionStorage`. No chat history is stored in a database or on the server.

## Deploy

1. Push this repository to `luansandes/meadow-custeng` on the `master` branch.
2. In GitHub **Settings → Pages**, select **GitHub Actions** as the source. The included workflow deploys only `index.html`.
3. In Vercel, import the same repository with the repository root as the project root.
4. Add these Vercel environment variables for Production (and Preview if desired):
   - `OPENAI_API_KEY`: your OpenAI API key
   - `OPENAI_MODEL`: `gpt-5.6-luna`
   - `ALLOWED_ORIGIN`: `https://luansandes.github.io`
5. Deploy Vercel. The production API is currently configured as `https://meadow-custeng-2tue.vercel.app`; if you change that deployment URL, update `API_BASE_URL` in `index.html`, then commit and push.

The browser is allowed to call only from `https://luansandes.github.io`; Vercel keeps the OpenAI key private. Keep the Google Sheet shared as **Anyone with the link → Viewer**. The sheet, Irish public-holiday calendar, and Dublin weather are checked afresh for every message.

## Local verification

Use Node.js 20 or newer, then run:

```sh
npm test
```

To test the deployed API, send a JSON POST request to `/api/chat` with a `message` string. A successful response contains `answer` and `sources`.
