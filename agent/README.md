# Explore agent backend

A small Node server that runs the ConnectLTV Explore assistant with the
[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk). The browser page is `src/pages/ExplorePage.tsx`
in the main app; this backend holds the keys and the tools.

```
browser (/explore)  --POST /api/explore, SSE-->  this server  --Claude Agent SDK-->  Claude
                                                     |
                                                     +-- tools (the only ones the agent has)
                                                           count_alumni      exact counts for a structured filter
                                                           aggregate_alumni  counts by one dimension (themes, trends)
                                                           search_alumni     a few illustrative people (calls search-v2)
                                                           get_profile       full profile of a person already surfaced
```

## Running locally

```bash
cd agent
npm install
npm start            # http://127.0.0.1:8787 ; the Vite dev server proxies /api/explore to it
# in another terminal, from the repo root:
npm run dev          # then open http://localhost:8080/explore
```

Configuration is read from `supabase/.env` (or the environment): `ANTHROPIC_API_KEY`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`. Optional: `EXPLORE_MODEL` (default `claude-opus-5-5`), `EXPLORE_PORT`,
`EXPLORE_ALLOWED_ORIGINS`. The Anthropic account needs credit; without it every answer fails with
"The assistant is unavailable right now" and the server log says "Credit balance is too low".

## Confidentiality: enforced in the tools, not the prompt

All limits live in `src/config.ts` and are applied in `src/tools.ts`:

| Limit | Value | Where |
|---|---|---|
| People returned by one search | 8 | `search_alumni` |
| Distinct people one conversation can surface | 40 | `search_alumni` |
| Smallest group an aggregate will name | 3 people (smaller groups are combined) | `aggregate_alumni` -> `v2_aggregate` |
| Profiles that can be opened | only people a search already surfaced in this conversation | `get_profile` |
| Email addresses | never sent to the model; redacted from all tool output | `tools.ts` |
| Built-in agent tools (files, shell, web) | all disabled; only the four tools above are allowed | `server.ts` |
| Messages per conversation / requests per minute / budget per message | 30 / 8 / $0.75 | `server.ts` |

The browser receives result cards (the same data the Search page shows) on a separate channel.
Each turn is logged to the `explore_logs` table (question, tool calls, people shown, cost; no user identity).

## Tests

```bash
npm run test:tools   # tool layer and its limits against the live database; no model, no Anthropic credit needed
npm run eval         # full agent eval: aggregate questions with database ground truth + roster-extraction attempts
npm run typecheck
```

## Not done here (decisions for deployment)

- **Hosting.** The Agent SDK needs a long-running Node process; it cannot run in a Supabase edge function.
  Any small Node host works. Set `VITE_EXPLORE_API` in the frontend build to the deployed URL and
  `EXPLORE_ALLOWED_ORIGINS` on the server to the frontend's origin.
- **Authentication.** The server currently binds to 127.0.0.1 and trusts its caller. Before exposing it, add a
  server-side check (for example require the app password and verify it with the `validate-password` function).
  The password gate in the frontend is client-side only and does not protect this endpoint.
- **Conversation state is in memory.** A restart forgets conversations and their people-shown counters;
  that is acceptable for one small instance, not for several behind a load balancer.
