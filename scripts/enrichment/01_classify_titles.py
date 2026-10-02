"""LLM-classify every distinct (job title, company industry) pair once.

Output cache: scripts/enrichment/.cache/title_labels.json  {"title||industry": [function, seniority, role_type, is_founder, is_founding_team, investor_type]}
Also maps each LinkedIn industry to a coarse industry group (industry_groups.json).
Idempotent: only unclassified pairs are sent.
"""
import concurrent.futures as cf

from common import lib, llm_json, load_cache, save_cache

FUNCTIONS = ["engineering", "product", "design", "data_analytics", "marketing", "sales_bd", "operations", "finance",
             "strategy", "consulting", "investing", "general_management", "legal", "hr_people", "research_science",
             "medicine_clinical", "education_academia", "military", "policy_government", "other"]
SENIORITY = ["intern", "junior", "mid", "senior", "director", "vp", "c_suite", "founder_owner", "partner_md", "board_advisor"]
ROLE_TYPES = ["full_time", "internship", "board_advisor", "part_time_side", "student_activity", "volunteer"]
INVESTOR = ["none", "vc", "pe", "growth_equity", "angel", "hedge_fund", "other_investing"]
INDUSTRY_GROUPS = ["software_internet", "financial_services", "investing_vc_pe", "consulting", "healthcare_biotech",
                   "consumer_retail", "media_entertainment", "education", "energy_climate", "industrials_manufacturing",
                   "real_estate", "government_nonprofit", "military_defense", "transport_logistics", "hardware_electronics",
                   "professional_services", "food_hospitality_travel", "other"]

SYSTEM = f"""You label job titles from LinkedIn profiles of Harvard Business School alumni.
For each item (a job title and the employer's industry) return an array:
[id, function, seniority, role_type, is_founder, is_founding_team, investor_type]

function: one of {FUNCTIONS}. Use general_management for CEO/GM/founder-CEO/president. Use consulting only for client-service consultants. Use investing for investment professionals at VC/PE/hedge funds/asset managers.
seniority: one of {SENIORITY}. founder_owner for founders/owners; partner_md for partners and managing directors at investment, consulting or law firms; c_suite for CEO/COO/CFO/CTO/CMO/Chief X (non-founder); vp includes SVP/EVP/Head of; junior for analyst/associate/coordinator; mid for manager-level individual roles (e.g. Product Manager, Senior Associate, Consultant); senior for Senior Manager/Principal/Lead/Staff.
role_type: one of {ROLE_TYPES}. internship for interns, summer associates/analysts, MBA interns, fellows on short stints. board_advisor for board members, advisors, mentors, venture partners in advisory capacity. student_activity for student club roles, "MBA Candidate", "Student", teaching fellows while studying. part_time_side for angel investor, scout, lecturer, EIR-in-residence style side roles, freelance. Otherwise full_time.
is_founder: 1 only if the person founded or co-founded the organisation (Founder, Co-Founder, Founding Partner, Owner of own firm). 0 for "Founding Engineer", "Founder's Associate", "Chief of Staff to Founder", "Founding team member".
is_founding_team: 1 for early non-founder hires whose title says founding (Founding Engineer, Founding PM, Founding team). Else 0.
investor_type: one of {INVESTOR}. Not "none" only when the role itself is an investing role: vc (venture capital investor, incl. scouts and venture partners), pe (private equity/buyout), growth_equity, angel (angel investor), hedge_fund (public markets, asset management investing), other_investing (family office, corporate VC, search fund investor, real estate investing). Investment BANKING is not investing: use "none" and function finance.

Return JSON: {{"labels": [[id, ...], ...]}} with one array per input item, same ids."""


def classify(batch):
    user = "\n".join(f'{i}\t{t}\t{ind or "unknown"}' for i, (t, ind) in batch)
    out = llm_json(SYSTEM, "id\ttitle\tindustry\n" + user, "classify_titles")
    res = {}
    for row in out.get("labels", []):
        if isinstance(row, list) and len(row) == 7:
            res[row[0]] = row[1:]
    return res


if __name__ == "__main__":
    corpus = lib.load_corpus()
    pairs = sorted({((e.get("title") or "").strip(), e.get("company_industry") or "") for p in corpus.values() for e in p["experiences"]})
    labels = load_cache("title_labels")
    todo = [p for p in pairs if "||".join(p) not in labels]
    print(f"{len(pairs)} distinct (title, industry) pairs; {len(todo)} to classify")
    batches = [list(enumerate(todo[i:i + 40])) for i in range(0, len(todo), 40)]
    done = 0
    with cf.ThreadPoolExecutor(4) as ex:
        for batch, res in zip(batches, ex.map(classify, batches)):
            for i, pair in batch:
                if i in res:
                    labels["||".join(pair)] = res[i]
            done += 1
            if done % 25 == 0:
                save_cache("title_labels", labels)
                print(f"  {done}/{len(batches)} batches", flush=True)
    save_cache("title_labels", labels)
    print("labelled:", len(labels), "of", len(pairs))

    groups = load_cache("industry_groups")
    inds = sorted({i for _, i in pairs if i and i not in groups})
    if inds:
        out = llm_json(f"Map each LinkedIn industry name to exactly one group from {INDUSTRY_GROUPS}. "
                       'Return JSON {"map": {"<industry>": "<group>", ...}} covering every input.', "\n".join(inds), "industry_groups", 8000)
        groups.update({k: v for k, v in out.get("map", {}).items() if v in INDUSTRY_GROUPS})
        save_cache("industry_groups", groups)
    print("industry groups:", len(groups))
