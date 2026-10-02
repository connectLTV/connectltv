// Configuration for the Explore agent backend. Secrets are read from supabase/.env (never committed) or the
// process environment; nothing here is sent to the browser.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../..");

const readEnvFile = (file: string): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
};
const fileEnv = readEnvFile(path.join(REPO_ROOT, "supabase/.env"));
const env = (key: string): string => process.env[key] || fileEnv[key] || "";

export const config = {
  port: Number(process.env.EXPLORE_PORT || 8787),
  // Default per Anthropic guidance: the current Opus. Override with EXPLORE_MODEL (e.g. a cheaper model).
  model: process.env.EXPLORE_MODEL || "claude-opus-5-5",
  anthropicApiKey: env("ANTHROPIC_API_KEY"),
  supabaseUrl: env("SUPABASE_URL"),
  supabaseServiceKey: env("SUPABASE_SERVICE_ROLE_KEY"),
  searchFunction: process.env.EXPLORE_SEARCH_FUNCTION || "search-v2",
  allowedOrigins: (process.env.EXPLORE_ALLOWED_ORIGINS || "http://localhost:8080").split(","),

  // ---- Confidentiality limits, enforced here in the tool layer (not just in the prompt) ----
  maxPeoplePerSearch: 8, // people returned to the model by one search call
  maxPeoplePerSession: 40, // distinct people a conversation can ever surface
  minGroupSize: 3, // aggregate groups smaller than this are folded together
  maxAggregateRows: 30,

  // ---- Abuse and cost limits ----
  maxTurnsPerSession: 30, // user messages per conversation
  maxRequestsPerMinute: 8, // per client address
  maxAgentSteps: 14, // model/tool iterations per user message
  maxBudgetUsdPerMessage: 0.75,
  maxMessageChars: 2000,
};

export const assertConfig = () => {
  const missing = (["anthropicApiKey", "supabaseUrl", "supabaseServiceKey"] as const).filter((k) => !config[k]);
  if (missing.length) throw new Error(`Missing configuration: ${missing.join(", ")} (set in supabase/.env or the environment)`);
};
