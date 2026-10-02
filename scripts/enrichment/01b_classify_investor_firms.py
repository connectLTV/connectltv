"""Classify each investment firm (a company where someone held an investing role) by investor type.

Title-level labels cannot tell a VC "Partner" from a PE "Partner" (LinkedIn uses one industry for both),
so the type is decided per firm from its name plus sample titles and descriptions.
Output cache: scripts/enrichment/.cache/investor_firms.json  {company name: type}
"""
import collections
import concurrent.futures as cf

from common import lib, llm_json, load_cache, save_cache

TYPES = ["vc", "pe", "growth_equity", "hedge_fund", "angel", "other_investing", "not_investor"]
SYSTEM = f"""You classify investment firms. For each firm (name, LinkedIn industry, sample job titles and a description snippet) return its investor type:
vc = venture capital (early-stage and startup investing, accelerators' funds, corporate venture arms, venture studios that invest)
pe = private equity / buyout / private credit
growth_equity = growth-stage investing (e.g. General Atlantic, Insight Partners, TA Associates, Summit Partners)
hedge_fund = hedge funds and public-markets asset managers
angel = an individual's personal angel investing
other_investing = family offices, sovereign wealth and pension funds, search funds, real-estate investing, impact funds, fund-of-funds
not_investor = not actually an investment firm (banks' advisory arms, consultancies, operating companies)
Use your knowledge of well-known firms. Return ONLY JSON: {{"firms": [{{"id": <id>, "type": "<type>"}}, ...]}}"""


def classify(batch):
    user = "\n".join(f"{i}\t{name}\t{info}" for i, (name, info) in batch)
    out = llm_json(SYSTEM, "id\tfirm\tdetails\n" + user, "classify_investor_firms", 3000)
    return {r["id"]: r["type"] for r in out.get("firms", []) if isinstance(r, dict) and r.get("type") in TYPES}


if __name__ == "__main__":
    corpus = lib.load_corpus()
    labels = load_cache("title_labels_v2")
    firms = collections.defaultdict(lambda: {"titles": collections.Counter(), "ind": None, "desc": ""})
    for p in corpus.values():
        for e in p["experiences"]:
            lab = labels.get("||".join(((e.get("title") or "").strip(), e.get("company_industry") or "")))
            if lab and lab["is_investing_role"] and e.get("company"):
                f = firms[e["company"].strip()]
                f["titles"][e.get("title")] += 1
                f["ind"] = f["ind"] or e.get("company_industry")
                if not f["desc"] and e.get("description"):
                    f["desc"] = e["description"][:200].replace("\n", " ")
    cache = load_cache("investor_firms")
    todo = [(n, f"{f['ind'] or 'unknown industry'} | titles: {', '.join(t for t, _ in f['titles'].most_common(3) if t)} | {f['desc']}")
            for n, f in sorted(firms.items()) if n not in cache]
    print(f"{len(firms)} firms with investing roles; {len(todo)} to classify")
    batches = [list(enumerate(todo[i:i + 30])) for i in range(0, len(todo), 30)]
    with cf.ThreadPoolExecutor(3) as ex:
        for batch, res in zip(batches, ex.map(classify, batches)):
            for i, (name, _) in batch:
                if i in res:
                    cache[name] = res[i]
    save_cache("investor_firms", cache)
    print("classified:", len(cache), collections.Counter(cache.values()).most_common())
