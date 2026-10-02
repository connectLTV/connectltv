"""LLM-classify each person once: sector tags, technical background, military service, career archetypes.

Output cache: scripts/enrichment/.cache/person_labels.json  {person_id: {...}}
Idempotent: only unlabelled people are sent.
"""
import concurrent.futures as cf

from common import lib, llm_json, load_cache, save_cache

SECTORS = ["ai_ml", "fintech", "healthcare", "biotech", "climate_energy", "crypto_web3", "edtech", "consumer_brands",
           "ecommerce_retail", "enterprise_saas", "marketplaces", "hardware_robotics", "media_entertainment",
           "real_estate_proptech", "mobility_transport", "food_agriculture", "gaming", "cybersecurity",
           "govtech_defense", "social_impact", "travel_hospitality", "logistics_supply_chain", "future_of_work_hr",
           "legal_tech", "space_aerospace", "developer_tools", "insurance", "sports_fitness", "beauty_fashion"]
PRE = ["consulting", "banking", "investing", "tech", "startup", "military", "medicine_healthcare", "nonprofit_public",
       "corporate", "other"]
POST = ["founder", "startup_operator", "tech", "consulting", "investing", "banking_finance", "corporate",
        "healthcare", "nonprofit_public", "none_yet", "other"]

SYSTEM = f"""You tag the LinkedIn profile of a Harvard Business School (HBS) alum. Each experience is marked [pre], [during] or [post] relative to their time at HBS.
Return JSON with exactly these keys:
- "sector_tags": array (0-5 items) from {SECTORS}. Sectors the person has substantively WORKED in (as operator, founder or investor), judged from employers, titles and descriptions. Do not tag from skills alone. Prefer precision: only tag what the profile clearly supports.
- "technical_background": true if they have an engineering/computer science/hard-science degree OR worked as an engineer, developer, data scientist or scientist.
- "military_veteran": true only if they served in armed forces (any country).
- "pre_hbs_archetype": one of {PRE}: the main career before HBS (tech = established technology company; startup = small/early company; corporate = non-tech large company).
- "post_hbs_path": one of {POST}: what they did first after HBS. founder = started own company; startup_operator = joined an early-stage company as employee; tech = established tech company; none_yet = no post-HBS role listed."""


def timing(start, y):
    if not y or not start:
        return "?"
    if start < f"{y - 2}-08-01":
        return "pre"
    return "post" if start >= f"{y}-04-01" else "during"


def profile(p):
    y = p.get("class_year")
    lines = [f"HBS class of {y}", f"Headline: {p.get('headline') or ''}", f"About: {(p.get('summary') or '')[:500]}", "Experience:"]
    for e in p["experiences"][:14]:
        lines.append(f"- [{timing(e.get('start_date'), y)}] {e.get('title') or '?'} at {e.get('company') or '?'} "
                     f"({e.get('company_industry') or 'unknown industry'}, size {e.get('company_size') or '?'}), "
                     f"{(e.get('start_date') or '')[:7]} to {(e.get('end_date') or 'present')[:7]}"
                     f"{'. ' + e['description'][:160] if e.get('description') else ''}")
    lines.append("Education: " + "; ".join(f"{e.get('degree') or ''} {e.get('field') or ''} at {e.get('school') or ''}".strip() for e in p["educations"]))
    lines.append("Skills: " + ", ".join(p["skills"][:20]))
    return "\n".join(lines)


def classify(p):
    out = llm_json(SYSTEM, profile(p), "classify_people", 300)
    return {
        "sector_tags": [s for s in out.get("sector_tags", []) if s in SECTORS][:5],
        "technical_background": bool(out.get("technical_background")),
        "military_veteran": bool(out.get("military_veteran")),
        "pre_hbs_archetype": out.get("pre_hbs_archetype") if out.get("pre_hbs_archetype") in PRE else "other",
        "post_hbs_path": out.get("post_hbs_path") if out.get("post_hbs_path") in POST else "other",
    }


if __name__ == "__main__":
    corpus = lib.load_corpus()
    labels = load_cache("person_labels")
    todo = [p for pid, p in corpus.items() if pid not in labels]
    print(f"{len(corpus)} people; {len(todo)} to classify")
    with cf.ThreadPoolExecutor(5) as ex:
        for n, (p, res) in enumerate(zip(todo, ex.map(classify, todo)), 1):
            labels[p["person_id"]] = res
            if n % 200 == 0:
                save_cache("person_labels", labels)
                print(f"  {n}/{len(todo)}", flush=True)
    save_cache("person_labels", labels)
    print("labelled:", len(labels))
