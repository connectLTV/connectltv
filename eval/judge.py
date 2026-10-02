"""LLM judge for open-ended queries: is this person a relevant result for the query?

Judgments are cached in eval/judgments.json keyed by "query||person_id" (no names), so a
person is judged once per query and every later run reuses the same verdict.
"""
import json
import urllib.request

import lib

MODEL = "claude-haiku-4-5-20251001"


def profile_text(p):
    exps = "; ".join(f"{e.get('title') or '?'} at {e.get('company') or '?'}"
                     f"{' (' + e['company_industry'] + ')' if e.get('company_industry') else ''}"
                     f"{' [current]' if e.get('is_current') else ''}"
                     f"{': ' + e['description'][:200] if e.get('description') else ''}" for e in p["experiences"][:10])
    edus = "; ".join(f"{e.get('degree') or ''} {e.get('field') or ''} at {e.get('school') or ''}".strip() for e in p["educations"])
    return (f"Headline: {p.get('headline')}\nLocation: {p.get('location')}\nClass year: {p.get('class_year')}\n"
            f"About: {(p.get('summary') or '')[:600]}\nExperience: {exps}\nEducation: {edus}\nSkills: {', '.join(p['skills'][:25])}")


def ask(query, profile):
    body = {"model": MODEL, "max_tokens": 5, "messages": [{"role": "user", "content":
            f"Search query on an alumni directory: \"{query}\"\n\nProfile:\n{profile}\n\n"
            "Is this person a genuinely relevant result for the query? Be strict: every explicit constraint in the "
            "query must be satisfied by the profile. Answer with exactly YES or NO."}]}
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=json.dumps(body).encode(),
                                 headers={"x-api-key": lib.ENV["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01",
                                          "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["content"][0]["text"].strip().upper().startswith("YES")


def judge_run(data, cases, judgments):
    import concurrent.futures as cf
    corpus = lib.load_corpus()
    by_id = {c["id"]: c for c in cases}
    todo = set()
    for cid, runs in data["results"].items():
        c = by_id.get(cid)
        if not c or c["type"] != "open":
            continue
        for r in runs:
            for pid in r["ids"]:
                if f'{c["query"]}||{pid}' not in judgments and pid in corpus:
                    todo.add((c["query"], pid))
    print(f"judging {len(todo)} new (query, person) pairs")
    with cf.ThreadPoolExecutor(4) as ex:
        futs = {ex.submit(ask, q, profile_text(corpus[pid])): (q, pid) for q, pid in todo}
        for f in cf.as_completed(futs):
            q, pid = futs[f]
            try:
                judgments[f"{q}||{pid}"] = f.result()
            except Exception as e:  # noqa: BLE001
                print("judge error", e)
    return judgments
