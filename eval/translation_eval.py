"""Evaluate query translation alone: does the translator turn each exact-answer query into filters
that select the right people? No retrieval or judging involved, so it is cheap to rerun.

Usage: python3 eval/translation_eval.py [--model gpt-4.1-mini] [--runs 2]
"""
import argparse
import concurrent.futures as cf
import json
import re
import time
import urllib.error
import urllib.request

import lib

ap = argparse.ArgumentParser()
ap.add_argument("--model", default="gpt-4.1-mini")
ap.add_argument("--runs", type=int, default=1)
ap.add_argument("--verbose", action="store_true")
args = ap.parse_args()

src = (lib.ROOT / "supabase/functions/search-v2/translate.ts").read_text()
SYSTEM = re.search(r"TRANSLATE_SYSTEM = `(.*?)`;", src, re.S).group(1)
ALLOWED = {"class_years", "class_year_min", "class_year_max", "years_experience_min", "years_experience_max",
           "locations", "skills", "person", "experiences", "educations"}


def empty(v):
    return v in (None, "", [], {})


def sanitize(raw, query):
    """Python port of sanitizeTranslation in translate.ts."""
    filters = {}
    for k, v in (raw.get("filters") or {}).items():
        if k not in ALLOWED or empty(v):
            continue
        if k == "person":
            p = {a: b for a, b in v.items() if not empty(b) and a != "sector_tags"} if isinstance(v, dict) else {}
            if p:
                filters[k] = p
        elif k in ("experiences", "educations"):
            arr = [{a: b for a, b in x.items() if not empty(b)} for x in (v if isinstance(v, list) else [v]) if isinstance(x, dict)]
            arr = [x for x in arr if x]
            if arr:
                filters[k] = arr
        else:
            filters[k] = v
    semantic = (raw.get("semantic") or "").strip() if isinstance(raw.get("semantic"), str) else ""
    if raw.get("complete") is True and filters:
        semantic = ""
    if not filters and not semantic:
        semantic = query
    return filters, semantic


def translate(query):
    body = {"model": args.model, "temperature": 0, "max_tokens": 500, "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": query}]}
    for attempt in range(8):
        req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=json.dumps(body).encode(),
                                     headers={"Authorization": "Bearer " + lib.ENV["OPENAI_API_KEY"], "Content-Type": "application/json"})
        try:
            t = time.time()
            with urllib.request.urlopen(req, timeout=60) as r:
                d = json.load(r)
            return sanitize(json.loads(d["choices"][0]["message"]["content"]), query), time.time() - t, d["usage"]
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            time.sleep(8 * (attempt + 1))
    raise RuntimeError("translation failed")


def filter_ids(filters):
    key = lib.ENV["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(lib.SUPABASE_URL + "/rest/v1/rpc/v2_filter_people", data=json.dumps({"f": filters}).encode(),
                                 headers={"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return {x["person_id"] for x in json.load(r)}


def run_case(c):
    (filters, semantic), secs, usage = translate(c["query"])
    try:
        ids = filter_ids(filters) if filters else set()
    except urllib.error.HTTPError as e:
        return {"case": c, "error": e.read()[:200].decode(), "filters": filters, "semantic": semantic, "secs": secs, "usage": usage}
    exp = set(c["expected_person_ids"])
    return {"case": c, "filters": filters, "semantic": semantic, "secs": secs, "usage": usage,
            "structured": bool(filters) and not semantic,
            "recall": len(ids & exp) / len(exp), "precision": len(ids & exp) / len(ids) if ids else 0.0}


cases = [json.loads(l) for l in (lib.EVAL_DIR / "queries.jsonl").read_text().splitlines() if l.strip()]
cases = [c for c in cases if c["type"] != "open"] * args.runs
with cf.ThreadPoolExecutor(2) as ex:
    out = list(ex.map(run_case, cases))
n = len(out)
ok = [o for o in out if "error" not in o]
good = [o for o in ok if o["structured"] and o["recall"] >= 0.9]
secs = sorted(o["secs"] for o in out)
tok_in = sum(o["usage"]["prompt_tokens"] for o in out)
cached = sum((o["usage"].get("prompt_tokens_details") or {}).get("cached_tokens", 0) for o in out)
print(f"model {args.model}: {n} translations")
print(f"  routed as purely structured: {100 * sum(o['structured'] for o in ok) / n:.0f}%")
print(f"  structured AND filter recall >= 90%: {100 * len(good) / n:.0f}%")
print(f"  mean filter recall {100 * sum(o['recall'] for o in ok) / n:.0f}% | mean filter precision {100 * sum(o['precision'] for o in ok) / n:.0f}%")
print(f"  latency median {secs[n // 2]:.2f}s p90 {secs[int(.9 * n)]:.2f}s | input tokens/query {tok_in // n} ({100 * cached // max(tok_in, 1)}% cached)")
for o in out:
    if "error" in o or not o["structured"] or o["recall"] < 0.9 or (args.verbose and o["precision"] < 0.6):
        print(f"  - {o['case']['query']!r}: structured={o.get('structured')} recall={o.get('recall', 0):.2f} precision={o.get('precision', 0):.2f} "
              f"{o.get('error', '')}\n      {json.dumps(o['filters'])[:260]} | semantic {o['semantic']!r}")
