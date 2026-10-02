// The Explore agent's tools. This layer, not the prompt, is what protects the roster:
//   - aggregates never expose groups smaller than config.minGroupSize
//   - a search call returns at most config.maxPeoplePerSearch people
//   - a conversation can surface at most config.maxPeoplePerSession distinct people
//   - profiles can only be opened for people a search in this conversation already surfaced
//   - email addresses never reach the model (the browser gets result cards separately)
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { config } from "./config.js";

export type Card = Record<string, unknown> & { person_id: string };

export interface SessionState {
  shown: Map<string, { ref: string; card: Card }>; // person_id -> surfaced person
  refs: Map<string, string>; // ref ("p7") -> person_id
  toolCalls: Array<{ tool: string; input: unknown; summary: string }>;
}

export const newSessionState = (): SessionState => ({ shown: new Map(), refs: new Map(), toolCalls: [] });

export interface ToolEvents {
  onPeople?: (people: Array<{ ref: string; card: Card; why: string }>) => void;
}

let supabaseClient: SupabaseClient | null = null;
const supabase = () => (supabaseClient ??= createClient(config.supabaseUrl, config.supabaseServiceKey));

// Belt and braces: strip anything that looks like an email address from text the model can see
const redactEmails = (s: string) => s.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email removed]");
const text = (value: unknown) => ({ content: [{ type: "text" as const, text: redactEmails(typeof value === "string" ? value : JSON.stringify(value)) }] });
const fail = (message: string) => ({ ...text(message), isError: true });

// The filter object is validated by the SQL function (unknown keys simply match nothing harmful);
// here we only make sure it is a plain JSON object of bounded size.
const filterSchema = z.record(z.string(), z.unknown()).describe("Structured filter object (see FILTERS in the system prompt). Use {} for everyone.");
const safeFilters = (f: unknown): Record<string, unknown> => {
  if (!f || typeof f !== "object" || Array.isArray(f)) return {};
  if (JSON.stringify(f).length > 4000) throw new Error("filters too large");
  return f as Record<string, unknown>;
};

export const DIMENSIONS = [
  "class_year", "metro", "country", "region", "current_company", "company", "school", "current_function", "current_seniority",
  "current_size_bucket", "current_industry_group", "pre_hbs_archetype", "post_hbs_path", "investor_type", "founder_type",
  "first_post_hbs_size_bucket", "first_post_hbs_function", "undergrad_school", "undergrad_major_category",
  "harvard_joint_degree", "sector_tags", "instructors", "pedigree", "advanced_degrees", "countries_worked", "ever_founded",
  "currently_founder", "founded_near_hbs", "early_employee", "joined_startup_after_hbs", "is_investor", "ever_investor",
  "industry_switcher", "function_switcher", "technical_background", "military_veteran", "has_board_role",
] as const;

const personForModel = (ref: string, card: Card, why: string) => ({
  ref,
  name: `${card.first_name ?? ""} ${card.last_name ?? ""}`.trim(),
  headline: card.headline,
  class_year: card.class_year,
  current_role: [card.current_title, card.current_company].filter(Boolean).join(" at "),
  location: card.location,
  why_relevant: why || undefined,
});

export const buildTools = (state: SessionState, events: ToolEvents = {}) => {
  const record = (name: string, input: unknown, summary: string) => state.toolCalls.push({ tool: name, input, summary });

  const countAlumni = tool(
    "count_alumni",
    "Count how many alumni match a structured filter. Cheap and exact. Use it to size a group before describing it.",
    { filters: filterSchema },
    async ({ filters }) => {
      try {
        const { data, error } = await supabase().rpc("v2_filter_people", { f: safeFilters(filters) });
        if (error) return fail(`Filter error: ${error.message}`);
        record("count_alumni", filters, `${data.length} people`);
        return text({ count: data.length });
      } catch (e) {
        return fail(String(e));
      }
    },
  );

  const aggregateAlumni = tool(
    "aggregate_alumni",
    `Break a group of alumni down by one dimension and return counts (largest first). This is the main tool for themes and trends. ` +
      `Groups with fewer than ${config.minGroupSize} people are combined into one row to protect individuals. ` +
      `"company" counts everyone who ever worked there; "current_company" counts current employers; "school" counts every school attended.`,
    {
      dimension: z.enum(DIMENSIONS),
      filters: filterSchema.optional(),
      top_n: z.number().int().min(1).max(config.maxAggregateRows).optional().describe("How many groups to return (default 15)"),
    },
    async ({ dimension, filters, top_n }) => {
      try {
        const { data, error } = await supabase().rpc("v2_aggregate", {
          f: safeFilters(filters),
          dimension,
          top_n: Math.min(top_n ?? 15, config.maxAggregateRows),
          min_group: config.minGroupSize, // fixed here; the model cannot lower it
        });
        if (error) return fail(`Aggregate error: ${error.message}`);
        const total = data[0]?.total_people ?? 0;
        record("aggregate_alumni", { dimension, filters }, `${data.length} groups over ${total} people`);
        return text({
          total_people_in_group: total,
          note: "A person can appear in several groups for multi-valued dimensions (sector_tags, company, school, ...).",
          groups: data.map((r: { value: string; people: number }) => ({ value: r.value, people: r.people })),
        });
      } catch (e) {
        return fail(String(e));
      }
    },
  );

  const searchAlumni = tool(
    "search_alumni",
    `Find specific alumni with a natural-language query (the same search the app's search page uses). Returns at most ` +
      `${config.maxPeoplePerSearch} people per call, and a conversation can surface at most ${config.maxPeoplePerSession} ` +
      `people in total. Use it for a few illustrative examples, not to list a whole group. The user sees a card for each person returned.`,
    {
      query: z.string().min(2).max(300).describe('e.g. "climate tech founders from the Class of 2022"'),
      limit: z.number().int().min(1).max(config.maxPeoplePerSearch).optional(),
    },
    async ({ query, limit }) => {
      try {
        const remaining = config.maxPeoplePerSession - state.shown.size;
        if (remaining <= 0) {
          return fail(`This conversation has reached its limit of ${config.maxPeoplePerSession} people. Use count_alumni and aggregate_alumni, or suggest the user run this query on the Search page.`);
        }
        const res = await fetch(`${config.supabaseUrl}/functions/v1/${config.searchFunction}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.supabaseServiceKey}`, apikey: config.supabaseServiceKey },
          body: JSON.stringify({ query, stream: false }),
        });
        const body = await res.json();
        if (!res.ok || body.error) return fail(`Search error: ${body.error || res.status}`);
        const all: Array<Card & { why_relevant?: string }> = body.results || [];
        const take = Math.min(limit ?? config.maxPeoplePerSearch, config.maxPeoplePerSearch);
        const people: Array<{ ref: string; card: Card; why: string }> = [];
        for (const result of all) {
          if (people.length >= take) break;
          const { why_relevant, ...card } = result;
          let entry = state.shown.get(card.person_id);
          if (!entry) {
            if (state.shown.size >= config.maxPeoplePerSession) break;
            entry = { ref: `p${state.shown.size + 1}`, card };
            state.shown.set(card.person_id, entry);
            state.refs.set(entry.ref, card.person_id);
          }
          people.push({ ref: entry.ref, card, why: why_relevant || "" });
        }
        events.onPeople?.(people);
        record("search_alumni", { query }, `${people.length} shown of ${all.length} matches`);
        return text({
          total_matches: all.length,
          shown: people.length,
          note: all.length > people.length ? "More people match than are shown. Give the total and suggest the Search page for the full list." : undefined,
          people: people.map((p) => personForModel(p.ref, p.card, p.why)),
        });
      } catch (e) {
        return fail(String(e));
      }
    },
  );

  const getProfile = tool(
    "get_profile",
    "Read the full profile (experience, education, skills) of a person already returned by search_alumni in this conversation, by their ref (e.g. \"p3\").",
    { ref: z.string().regex(/^p\d+$/) },
    async ({ ref }) => {
      try {
        const personId = state.refs.get(ref);
        if (!personId) return fail(`Unknown ref "${ref}". Only people returned by search_alumni in this conversation can be opened.`);
        const { data, error } = await supabase().from("person_search").select("profile_doc").eq("person_id", personId).single();
        if (error) return fail(`Profile error: ${error.message}`);
        record("get_profile", { ref }, "profile opened");
        return text({ ref, profile: String(data.profile_doc).slice(0, 6000) });
      } catch (e) {
        return fail(String(e));
      }
    },
  );

  return [countAlumni, aggregateAlumni, searchAlumni, getProfile];
};

export const buildToolServer = (state: SessionState, events: ToolEvents = {}) =>
  createSdkMcpServer({ name: "alumni", version: "1.0.0", tools: buildTools(state, events) });

export const TOOL_NAMES = ["count_alumni", "aggregate_alumni", "search_alumni", "get_profile"].map((n) => `mcp__alumni__${n}`);
