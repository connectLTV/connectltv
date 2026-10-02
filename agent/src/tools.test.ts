// Checks the tool layer directly against the live database (no model involved, no Anthropic credits needed).
// Run with: npm run test:tools
import assert from "node:assert/strict";
import { assertConfig, config } from "./config.js";
import { buildTools, newSessionState } from "./tools.js";

assertConfig();
const state = newSessionState();
const surfaced: unknown[] = [];
const tools = Object.fromEntries(buildTools(state, { onPeople: (p) => surfaced.push(...p) }).map((t) => [t.name, t]));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = async (name: string, args: any) => {
  const result = await tools[name].handler(args, {});
  const text = (result.content[0] as { text: string }).text;
  return { isError: Boolean(result.isError), text, json: result.isError ? null : JSON.parse(text) };
};

const count = await call("count_alumni", { filters: { class_years: [2025] } });
assert.equal(count.json.count, 140, "Class of 2025 should have 140 people");
console.log("ok  count_alumni: Class of 2025 =", count.json.count);

const agg = await call("aggregate_alumni", { dimension: "metro", filters: { class_years: [2024] }, top_n: 5 });
assert.ok(agg.json.groups.length >= 5);
for (const g of agg.json.groups) {
  if (!g.value.startsWith("(")) assert.ok(g.people >= config.minGroupSize, `group ${g.value} is below the minimum size`);
}
console.log("ok  aggregate_alumni: no named group below", config.minGroupSize, "people;", agg.json.groups.slice(0, 3).map((g: { value: string; people: number }) => `${g.value} ${g.people}`).join(", "));

// The schema rejects dimensions outside the allow-list before the handler runs; the SQL function rejects them too.
const badDim = await call("aggregate_alumni", { dimension: "email" });
assert.ok(badDim.isError, "an unknown dimension must be rejected");
console.log("ok  aggregate_alumni: rejects a dimension outside the allow-list");

const search = await call("search_alumni", { query: "Class of 2025", limit: 50 });
assert.ok(search.json.shown <= config.maxPeoplePerSearch, "per-search cap exceeded");
assert.equal(search.json.total_matches, 140);
assert.ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(search.text), "an email address reached the model");
console.log(`ok  search_alumni: ${search.json.total_matches} matches, ${search.json.shown} shown (cap ${config.maxPeoplePerSearch}), no emails in model-visible text`);

const profile = await call("get_profile", { ref: "p1" });
assert.ok(!profile.isError && profile.json.profile.length > 100);
assert.ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(profile.json.profile), "an email address reached the model via get_profile");
const unknown = await call("get_profile", { ref: "p999" });
assert.ok(unknown.isError, "a profile that was never surfaced must not open");
console.log("ok  get_profile: opens surfaced people only");

// Exhaust the per-conversation cap with different queries
for (const year of [2011, 2012, 2013, 2014, 2015, 2016, 2017]) await call("search_alumni", { query: `Class of ${year}` });
assert.ok(state.shown.size <= config.maxPeoplePerSession, "per-conversation cap exceeded");
const blocked = await call("search_alumni", { query: "Class of 2019" });
assert.ok(state.shown.size === config.maxPeoplePerSession ? blocked.isError : true, "search must stop at the conversation cap");
console.log(`ok  search_alumni: conversation stopped at ${state.shown.size} people (cap ${config.maxPeoplePerSession}); further search refused = ${blocked.isError}`);
console.log(`\nall tool checks passed; ${surfaced.length} cards were sent to the browser channel`);
