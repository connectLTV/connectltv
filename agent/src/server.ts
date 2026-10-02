// Explore agent backend: one HTTP endpoint that streams an agent turn to the browser as server-sent events.
//
//   POST /api/explore  { message: string, conversation_id?: string }
//   -> SSE events: session, text (delta), tool, people, done, error
//
// The agent is a Claude Agent SDK session whose ONLY tools are the four alumni tools in tools.ts
// (all built-in tools are disabled). Conversations are resumed by SDK session id.
import { query } from "@anthropic-ai/claude-agent-sdk";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { assertConfig, config } from "./config.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { buildToolServer, newSessionState, SessionState, TOOL_NAMES } from "./tools.js";

assertConfig();

interface Conversation {
  state: SessionState;
  sdkSessionId?: string;
  turns: number;
  busy: boolean;
  lastUsed: number;
}
const conversations = new Map<string, Conversation>();
const requestLog = new Map<string, number[]>(); // client address -> request timestamps

// The SDK runs its agent loop in a subprocess; give it an empty working directory so there is nothing to read.
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "connectltv-explore-"));
const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

const rateLimited = (address: string): boolean => {
  const now = Date.now();
  const recent = (requestLog.get(address) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  requestLog.set(address, recent);
  return recent.length > config.maxRequestsPerMinute;
};

setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000; // forget conversations idle for two hours
  for (const [id, c] of conversations) if (c.lastUsed < cutoff && !c.busy) conversations.delete(id);
}, 10 * 60 * 1000).unref();

const cors = (req: http.IncomingMessage, res: http.ServerResponse) => {
  const origin = req.headers.origin || "";
  if (config.allowedOrigins.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
};

const readJson = (req: http.IncomingMessage): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20_000) reject(new Error("request too large"));
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });

const toolLabel = (name: string, input: Record<string, unknown>): string => {
  switch (name.replace("mcp__alumni__", "")) {
    case "count_alumni":
      return "Counting alumni";
    case "aggregate_alumni":
      return `Breaking down by ${String(input.dimension || "").replace(/_/g, " ")}`;
    case "search_alumni":
      return `Searching: ${String(input.query || "")}`;
    case "get_profile":
      return "Reading a profile";
    default:
      return name;
  }
};

const handleExplore = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  const address = req.socket.remoteAddress || "unknown";
  if (rateLimited(address)) {
    res.writeHead(429, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Too many requests. Please wait a minute." }));
    return;
  }
  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: String(e) }));
    return;
  }
  const message = String(body.message || "").trim().slice(0, config.maxMessageChars);
  if (!message) {
    res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "message is required" }));
    return;
  }
  const conversationId = typeof body.conversation_id === "string" && conversations.has(body.conversation_id) ? body.conversation_id : crypto.randomUUID();
  const conversation = conversations.get(conversationId) ?? { state: newSessionState(), turns: 0, busy: false, lastUsed: Date.now() };
  conversations.set(conversationId, conversation);

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = (event: Record<string, unknown>) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  send({ type: "session", conversation_id: conversationId });

  if (conversation.busy) {
    send({ type: "error", message: "The previous message is still being answered." });
    res.end();
    return;
  }
  if (conversation.turns >= config.maxTurnsPerSession) {
    send({ type: "error", message: "This conversation has reached its length limit. Please start a new one." });
    res.end();
    return;
  }

  conversation.busy = true;
  conversation.turns += 1;
  conversation.lastUsed = Date.now();
  const started = Date.now();
  const toolCallsBefore = conversation.state.toolCalls.length;
  const peopleBefore = conversation.state.shown.size;
  const abort = new AbortController();
  res.on("close", () => abort.abort());
  let costUsd: number | undefined;
  let errorText: string | undefined;

  try {
    const run = query({
      prompt: message,
      options: {
        model: config.model,
        systemPrompt: SYSTEM_PROMPT,
        tools: [], // no built-in tools: no file, shell or web access
        mcpServers: {
          alumni: buildToolServer(conversation.state, {
            onPeople: (people) => send({ type: "people", people: people.map((p) => ({ ...p.card, why_relevant: p.why })) }),
          }),
        },
        allowedTools: TOOL_NAMES,
        permissionMode: "dontAsk", // anything not pre-approved above is denied
        settingSources: [], // ignore any Claude Code settings or CLAUDE.md on this machine
        cwd: workDir,
        resume: conversation.sdkSessionId,
        includePartialMessages: true,
        maxTurns: config.maxAgentSteps,
        maxBudgetUsd: config.maxBudgetUsdPerMessage,
        effort: "medium",
        abortController: abort,
        env: { ...process.env, ANTHROPIC_API_KEY: config.anthropicApiKey, CLAUDE_AGENT_SDK_CLIENT_APP: "connectltv-explore/0.1" },
      },
    });

    for await (const msg of run) {
      if (msg.type === "system" && msg.subtype === "init") {
        conversation.sdkSessionId = msg.session_id;
      } else if (msg.type === "stream_event") {
        const event = msg.event;
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          send({ type: "text", text: event.delta.text });
        }
      } else if (msg.type === "assistant") {
        if (msg.error) errorText = String(msg.error);
        for (const block of msg.message.content) {
          if (block.type === "tool_use") {
            send({ type: "tool", label: toolLabel(block.name, (block.input || {}) as Record<string, unknown>) });
          }
        }
      } else if (msg.type === "result") {
        costUsd = msg.total_cost_usd;
        if (msg.subtype !== "success") {
          errorText = msg.subtype === "error_max_budget_usd" || msg.subtype === "error_max_turns"
            ? "This question needed more work than one answer allows. Try narrowing it."
            : "The assistant could not finish this answer.";
        } else if (msg.is_error) {
          errorText = msg.result || "The assistant could not finish this answer.";
        }
      }
    }
    if (errorText) send({ type: "error", message: errorText });
    send({
      type: "done",
      people_shown: conversation.state.shown.size,
      people_limit: config.maxPeoplePerSession,
      turns_left: config.maxTurnsPerSession - conversation.turns,
    });
  } catch (e) {
    errorText = e instanceof Error ? e.message : String(e);
    console.error("explore error:", errorText);
    send({ type: "error", message: "The assistant is unavailable right now." });
  } finally {
    conversation.busy = false;
    res.end();
    // Session log: no user identity, no message content from the assistant
    supabase.from("explore_logs").insert({
      session_id: conversationId,
      user_message: message,
      tool_calls: conversation.state.toolCalls.slice(toolCallsBefore),
      people_shown: conversation.state.shown.size - peopleBefore,
      cost_usd: costUsd ?? null,
      duration_ms: Date.now() - started,
      error: errorText ?? null,
    }).then(({ error }) => error && console.error("explore_logs insert failed:", error.message));
  }
};

http.createServer((req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
  } else if (req.method === "POST" && req.url === "/api/explore") {
    handleExplore(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  } else if (req.method === "GET" && req.url === "/api/explore/health") {
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, model: config.model }));
  } else {
    res.writeHead(404).end();
  }
}).listen(config.port, "127.0.0.1", () => {
  console.log(`Explore agent listening on http://127.0.0.1:${config.port} (model ${config.model})`);
});
