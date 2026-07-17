# Meadow Vet Care services chatbot

This repository contains a GitHub Pages chat interface and a Vercel serverless API. The API answers only from the committed `Meadow Vet Care — Services.csv` file.

## Deploy

1. Push this repository to `luansandes/meadow-custeng` on the `master` branch.
2. In GitHub **Settings → Pages**, select **GitHub Actions** as the source. The included workflow deploys only `index.html`.
3. In Vercel, import the same repository with the repository root as the project root.
4. Add these Vercel environment variables for Production (and Preview if desired):
   - `OPENAI_API_KEY`: your OpenAI API key
   - `OPENAI_MODEL`: `gpt-5.6-luna`
   - `ALLOWED_ORIGIN`: `https://luansandes.github.io`
5. Deploy Vercel. Copy its production URL and replace `https://YOUR-VERCEL-PROJECT.vercel.app` in `index.html` with that URL. Commit and push the change.

The browser is allowed to call only from `https://luansandes.github.io`; Vercel keeps the OpenAI key private. Updating the committed CSV and deploying again updates the chatbot knowledge.

## Local verification

Use Node.js 20 or newer, then run:

```sh
npm test
```

To test the deployed API, send a JSON POST request to `/api/chat` with a `question` string. A successful response contains `answer` and `sources`.
