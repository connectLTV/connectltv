"""LLM-classify every distinct (job title, company industry) pair once.

Output cache: scripts/enrichment/.cache/title_labels_v2.json  {"title||industry": {function, seniority, role_type, is_founder, is_founding_team, is_investing_role}}
The model must echo each title, and rows with a wrong title or an invalid value are rejected and retried on the next run
(the first version used positional arrays in batches of 40 and audited at only 70-76% on function and seniority).
Pass --anthropic to label with Claude Haiku instead of the OpenAI model.
Also maps each LinkedIn industry to a coarse industry group (industry_groups.json).
Idempotent: only unclassified pairs are sent.
"""
import concurrent.futures as cf
import json
import re
import sys
import time
import urllib.request

from common import lib, llm_json, load_cache, save_cache

FUNCTIONS = ["engineering", "product", "design", "data_analytics", "marketing", "sales_bd", "operations", "finance",
             "strategy", "consulting", "investing", "general_management", "legal", "hr_people", "research_science",
             "medicine_clinical", "education_academia", "military", "policy_government", "other"]
SENIORITY = ["intern", "junior", "mid", "senior", "director", "vp", "c_suite", "founder_owner", "partner_md", "board_advisor"]
ROLE_TYPES = ["full_time", "internship", "board_advisor", "part_time_side", "student_activity", "volunteer"]
INVESTOR = ["none", "vc", "pe", "growth_equity", "angel", "hedge_fund", "other_investing"]
PROVIDER = "anthropic" if "--anthropic" in sys.argv else "openai"
ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"
CACHE_NAME = sys.argv[sys.argv.index("--cache") + 1] if "--cache" in sys.argv else "title_labels_v2"
BATCH = 20
INDUSTRY_GROUPS = ["software_internet", "financial_services", "investing_vc_pe", "consulting", "healthcare_biotech",
                   "consumer_retail", "media_entertainment", "education", "energy_climate", "industrials_manufacturing",
                   "real_estate", "government_nonprofit", "military_defense", "transport_logistics", "hardware_electronics",
                   "professional_services", "food_hospitality_travel", "other"]

SYSTEM = f"""You label job titles from LinkedIn profiles of Harvard Business School alumni.
For each input item (a job title and the employer's industry) return one JSON object with these keys:

"id": the input id
"title": the input title, copied exactly
"function": one of {FUNCTIONS}. general_management for CEO/GM/president/founder-CEO/executive director/board member. consulting only for client-service consultants. investing for investment professionals at VC/PE/hedge funds/asset managers. research_science for research roles (including research interns and lab researchers). Judge by what the role does, not by the industry.
"seniority": one of {SENIORITY}. intern for any intern/co-op/trainee/summer role; junior for analyst/associate/coordinator/specialist; mid for individual-contributor or first-line roles (Product Manager, Consultant, Senior Associate, Engineer, Manager); senior for Senior Manager/Principal/Lead/Staff/Senior Engineer; director for Director/Senior Director; vp for VP/SVP/EVP/Head of/General Manager; c_suite for CEO/COO/CFO/CTO/CMO/Chief X/President/Executive Director (non-founder); founder_owner for founders and owners; partner_md for partners and managing directors at investment, consulting or law firms; board_advisor for board members, advisors and mentors.
"role_type": one of {ROLE_TYPES}. internship for interns, co-ops, trainees, summer associates/analysts, "MBA Associate"/"MBA Intern" and other short student stints. board_advisor for board members, advisors, mentors. student_activity for student club roles, scholars, fellows and researchers while studying, "MBA Candidate", "Student". part_time_side for angel investing, scouting, lecturing, freelance, sabbatical. volunteer for unpaid volunteering. Otherwise full_time.
"is_founder": true only if the person founded or co-founded the organisation (Founder, Co-Founder, Founding Partner, Owner of own firm). false for "Founding Engineer", "Founder's Associate", "Chief of Staff to Founder", "Founding team member".
"is_founding_team": true for early non-founder hires whose title says founding (Founding Engineer, Founding PM, Founding team). Otherwise false.
"is_investing_role": true only when the job itself is making investments (VC, PE, growth equity, hedge fund, asset management, family office, angel, corporate VC, search fund). false for investment BANKING, strategy, corporate development, operations or platform roles at investment firms.

Return ONLY JSON: {{"labels": [{{...}}, ...]}} with exactly one object per input item."""

KEYS = ["function", "seniority", "role_type", "is_founder", "is_founding_team", "is_investing_role"]
ALLOWED = {"function": FUNCTIONS, "seniority": SENIORITY, "role_type": ROLE_TYPES}
INTERN_RE = re.compile(r"\bintern\b|internship|\bco-?op\b|summer (associate|analyst|intern|trainee)|\btrainee\b", re.I)


def valid(row, title):
    """A label row is accepted only if it echoes the right title and uses allowed values."""
    if not isinstance(row, dict) or (row.get("title") or "").strip() != title.strip():
        return None
    for k, allowed in ALLOWED.items():
        if row.get(k) not in allowed:
            return None
    out = {k: row.get(k) for k in KEYS}
    for k in ("is_founder", "is_founding_team", "is_investing_role"):
        out[k] = bool(out[k])
    if INTERN_RE.search(title) and out["role_type"] == "full_time":  # deterministic guard
        out["role_type"], out["seniority"] = "internship", "intern"
    return out


def call_llm(user):
    if PROVIDER == "anthropic":
        body = {"model": ANTHROPIC_MODEL, "max_tokens": 8000, "system": SYSTEM, "messages": [{"role": "user", "content": user}]}
        req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=json.dumps(body).encode(),
                                     headers={"x-api-key": lib.ENV["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01",
                                              "content-type": "application/json"})
        for attempt in range(6):
            try:
                with urllib.request.urlopen(req, timeout=180) as r:
                    text = "".join(b.get("text", "") for b in json.load(r)["content"])
                return json.loads(text[text.index("{"):text.rindex("}") + 1])
            except Exception:  # noqa: BLE001
                time.sleep(4 * (attempt + 1))
        return {}
    return llm_json(SYSTEM, user, "classify_titles_v2", 8000)


def classify(batch):
    user = "id\ttitle\tindustry\n" + "\n".join(f'{i}\t{t}\t{ind or "unknown"}' for i, (t, ind) in batch)
    out = call_llm(user)
    titles = dict((i, t) for i, (t, _) in batch)
    res = {}
    for row in out.get("labels", []) if isinstance(out, dict) else []:
        i = row.get("id") if isinstance(row, dict) else None
        if i in titles:
            v = valid(row, titles[i])
            if v:
                res[i] = v
    return res


if __name__ == "__main__":
    corpus = lib.load_corpus()
    pairs = sorted({((e.get("title") or "").strip(), e.get("company_industry") or "") for p in corpus.values() for e in p["experiences"]})
    labels = load_cache(CACHE_NAME)
    todo = [p for p in pairs if "||".join(p) not in labels]
    print(f"{len(pairs)} distinct (title, industry) pairs; {len(todo)} to classify")
    if "--limit" in sys.argv:
        todo = todo[:int(sys.argv[sys.argv.index("--limit") + 1])]
    batches = [list(enumerate(todo[i:i + BATCH])) for i in range(0, len(todo), BATCH)]
    done = 0
    with cf.ThreadPoolExecutor(4) as ex:
        for batch, res in zip(batches, ex.map(classify, batches)):
            for i, pair in batch:
                if i in res:
                    labels["||".join(pair)] = res[i]
            done += 1
            if done % 25 == 0:
                save_cache(CACHE_NAME, labels)
                print(f"  {done}/{len(batches)} batches", flush=True)
    save_cache(CACHE_NAME, labels)
    print("labelled:", len(labels), "of", len(pairs))

    groups = load_cache("industry_groups")
    inds = sorted({i for _, i in pairs if i and i not in groups})
    if inds:
        out = llm_json(f"Map each LinkedIn industry name to exactly one group from {INDUSTRY_GROUPS}. "
                       'Return JSON {"map": {"<industry>": "<group>", ...}} covering every input.', "\n".join(inds), "industry_groups", 8000)
        groups.update({k: v for k, v in out.get("map", {}).items() if v in INDUSTRY_GROUPS})
        save_cache("industry_groups", groups)
    print("industry groups:", len(groups))
