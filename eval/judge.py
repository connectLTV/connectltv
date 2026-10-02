"""LLM judge for open-ended queries: is this person a relevant result for the query?

Judgments are cached in eval/judgments.json keyed by "query||person_id" (no names), so a
person is judged once per query and every later run reuses the same verdict.
"""
import json
import urllib.request

import lib

MODEL = "gpt-4.1"  # stronger than the gpt-4.1-mini judge inside the search function


def profile_text(p):
    exps = "; ".join(f"{e.get('title') or '?'} at {e.get('company') or '?'}"
                     f"{' (' + e['company_industry'] + ')' if e.get('company_industry') else ''}"
                     f"{' [current]' if e.get('is_current') else ''}"
                     f"{': ' + e['description'][:200] if e.get('description') else ''}" for e in p["experiences"][:10])
    edus = "; ".join(f"{e.get('degree') or ''} {e.get('field') or ''} at {e.get('school') or ''}".strip() for e in p["educations"])
    return (f"Headline: {p.get('headline')}\nLocation: {p.get('location')}\nClass year: {p.get('class_year')}\n"
            f"About: {(p.get('summary') or '')[:600]}\nExperience: {exps}\nEducation: {edus}\nSkills: {', '.join(p['skills'][:25])}")


def ask(query, profile):
    """One verdict from the judge model. Uses a stronger model than the one the search function uses to judge,
    so the eval is not just the system agreeing with itself."""
    prompt = (f"Search query on an alumni directory: \"{query}\"\n\nProfile:\n{profile}\n\n"
              "Would a careful user consider this person a correct result for the query? Every explicit constraint in the "
              "query must be supported by the profile (a past role counts unless the query says current). "
              "Answer with exactly YES or NO.")
    body = {"model": MODEL, "max_tokens": 3, "temperature": 0, "messages": [{"role": "user", "content": prompt}]}
    import time
    for attempt in range(7):
        req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=json.dumps(body).encode(),
                                     headers={"Authorization": "Bearer " + lib.ENV["OPENAI_API_KEY"], "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.load(r)["choices"][0]["message"]["content"].strip().upper().startswith("YES")
        except Exception as e:  # noqa: BLE001  (rate limits and transient errors)
            if attempt == 6 or getattr(e, "code", None) not in (429, 500, 502, 503, None):
                raise
            time.sleep(4 * (attempt + 1))


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
    failed = 0
    with cf.ThreadPoolExecutor(3) as ex:
        futs = {ex.submit(ask, q, profile_text(corpus[pid])): (q, pid) for q, pid in todo}
        for f in cf.as_completed(futs):
            q, pid = futs[f]
            try:
                judgments[f"{q}||{pid}"] = f.result()
            except Exception as e:  # noqa: BLE001
                failed += 1
                if failed <= 3:
                    print("  judge error:", str(e)[:200])
    if failed:
        print(f"WARNING: {failed} pairs could not be judged; rerun with --judge to fill them in")
    return judgments
