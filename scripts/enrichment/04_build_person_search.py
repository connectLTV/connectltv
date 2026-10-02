"""Build one searchable document, embedding and result card per person and upsert into person_search.

Run after 03_derive_facts.py. Idempotent. Embeddings are cached locally by document hash, so a rerun
only pays for documents whose text changed.

Usage: python3 04_build_person_search.py
"""
import concurrent.futures as cf
import hashlib
import json
import urllib.request

from common import CACHE, lib, load_cache, save_cache, upsert

FUNCTION_LABELS = {"engineering": "Engineering", "product": "Product", "design": "Design", "data_analytics": "Data & Analytics",
                   "marketing": "Marketing", "sales_bd": "Sales & BD", "operations": "Operations", "finance": "Finance",
                   "strategy": "Strategy", "consulting": "Consulting", "investing": "Investing",
                   "general_management": "General Management", "legal": "Legal", "hr_people": "People & HR",
                   "research_science": "Research", "medicine_clinical": "Medicine", "education_academia": "Education",
                   "military": "Military", "policy_government": "Policy & Government"}


def build_doc(p, pf, efs, companies):
    y = p.get("class_year")
    lines = [f"{p['full_name']} | HBS Class of {y} | LTV instructor: {', '.join(pf.get('instructors') or []) or 'unknown'}"]
    if p.get("headline"):
        lines.append(f"Headline: {p['headline']}")
    if p.get("location"):
        lines.append(f"Location: {p['location']}" + (f" ({pf['metro']})" if pf.get("metro") and pf["metro"] not in p["location"] else ""))
    if p.get("current_title") or p.get("current_company"):
        lines.append(f"Current role: {p.get('current_title') or ''} at {p.get('current_company') or ''}"
                     + (f" ({p['current_industry']})" if p.get("current_industry") else ""))
    tags = []
    if pf.get("ever_founded"):
        tags.append("founder" + (" (current)" if pf.get("currently_founder") else ""))
    if pf.get("ever_investor"):
        tags.append(f"investor ({pf.get('investor_type')})")
    if pf.get("technical_background"):
        tags.append("technical background")
    if pf.get("military_veteran"):
        tags.append("military veteran")
    if pf.get("joined_startup_after_hbs"):
        tags.append("joined a startup right after HBS")
    if pf.get("sector_tags"):
        tags.append("sectors: " + ", ".join(t.replace("_", " ") for t in pf["sector_tags"]))
    if pf.get("pre_hbs_archetype"):
        tags.append(f"before HBS: {pf['pre_hbs_archetype'].replace('_', ' ')}")
    if tags:
        lines.append("Profile: " + "; ".join(tags))
    if p.get("summary"):
        lines.append(f"About: {p['summary'][:1500]}")
    lines.append("Experience:")
    for e in p["experiences"][:20]:
        ef = efs.get(e["exp_id"], {})
        comp = companies.get(ef.get("company_id"), {})
        names = [e.get("company") or ""] + [a for a in ([comp.get("canonical_name")] + (comp.get("aliases") or [])) if a and a != e.get("company")][:2]
        meta = [x for x in (e.get("company_industry"), f"{ef['size_bucket']} company" if ef.get("size_bucket") else None,
                            {"pre": "before HBS", "during": "during HBS", "post": "after HBS"}.get(ef.get("hbs_timing")),
                            "current" if e.get("is_current") else None,
                            "internship" if ef.get("role_type") == "internship" else None) if x]
        lines.append(f"- {e.get('title') or ''} at {' / '.join(n for n in names if n)} ({'; '.join(meta)}) "
                     f"{(e.get('start_date') or '')[:4]}-{(e.get('end_date') or 'present')[:4]}"
                     + (f": {e['description'][:400]}" if e.get("description") else ""))
    if p["educations"]:
        lines.append("Education: " + "; ".join(
            " ".join(x for x in (e.get("degree"), e.get("field"), "at", e.get("school")) if x) for e in p["educations"]))
    if p["skills"]:
        lines.append("Skills: " + ", ".join(p["skills"][:40]))
    return "\n".join(lines)


def build_card(p, pf):
    first, *rest = (p.get("full_name") or "Unknown").split(" ")
    exp = ". ".join(f"{e.get('title') or ''} at {e.get('company') or ''}".strip() for e in p["experiences"][:3]
                    if (e.get("title") or e.get("company")))
    edus = sorted(p["educations"], key=lambda e: e.get("start_year") or 0, reverse=True)
    edu = ". ".join(e["school"] for e in edus[:3] if e.get("school"))
    return {"person_id": p["person_id"], "first_name": first, "last_name": " ".join(rest), "email": p.get("email"),
            "linkedin_url": p.get("linkedin_url"), "headline": p.get("headline") or "LTV Alumni",
            "class_year": str(p.get("class_year") or ""), "section": (p.get("section") or "").strip(),
            "location": p.get("location") or "", "current_company": p.get("current_company") or "",
            "current_title": p.get("current_title") or "", "current_industry": p.get("current_industry") or "",
            "function": FUNCTION_LABELS.get(pf.get("current_function") or "", ""),
            "education_summary": edu + "." if edu else "", "experience_summary": exp + "." if exp else ""}


def embed(texts):
    body = {"model": "text-embedding-3-large", "input": texts, "dimensions": 800}
    req = urllib.request.Request("https://api.openai.com/v1/embeddings", data=json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + lib.ENV["OPENAI_API_KEY"], "Content-Type": "application/json"})
    import time
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                d = json.load(r)
            return [x["embedding"] for x in d["data"]], d["usage"]["total_tokens"]
        except Exception:  # noqa: BLE001
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("embedding failed")


if __name__ == "__main__":
    corpus = lib.load_corpus()
    pfs = {r["person_id"]: r for r in lib.rest_get("person_facts", "*", {"order": "person_id"})}
    efs = {r["exp_id"]: r for r in lib.rest_get("experience_facts", "exp_id,company_id,size_bucket,hbs_timing,role_type", {"order": "exp_id"})}
    companies = {r["company_id"]: r for r in lib.rest_get("companies", "company_id,canonical_name,aliases", {"order": "company_id"})}
    docs = {pid: build_doc(p, pfs.get(pid, {}), efs, companies) for pid, p in corpus.items()}

    emb_cache = load_cache("person_doc_embeddings")
    hashes = {pid: hashlib.sha256(d.encode()).hexdigest() for pid, d in docs.items()}
    todo = [pid for pid in docs if emb_cache.get(pid, {}).get("hash") != hashes[pid]]
    print(f"{len(docs)} documents; {len(todo)} to embed; mean length {sum(map(len, docs.values())) // len(docs)} chars")
    batches = [todo[i:i + 64] for i in range(0, len(todo), 64)]
    tokens = 0
    with cf.ThreadPoolExecutor(3) as ex:
        for batch, (embs, t) in zip(batches, ex.map(lambda b: embed([docs[pid][:24000] for pid in b]), batches)):
            tokens += t
            for pid, e in zip(batch, embs):
                emb_cache[pid] = {"hash": hashes[pid], "embedding": [round(x, 5) for x in e]}
    save_cache("person_doc_embeddings", emb_cache)
    print(f"embedded; tokens {tokens}, est cost ${tokens / 1e6 * 0.13:.3f}")

    rows = [{"person_id": pid, "profile_doc": docs[pid], "embedding": json.dumps(emb_cache[pid]["embedding"]),
             "card": build_card(p, pfs.get(pid, {}))} for pid, p in corpus.items()]
    upsert("person_search", rows, "person_id", batch=100)
