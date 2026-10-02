"""Shared helpers for the enrichment scripts (MASTER_PLAN step 1.4)."""
import json
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "eval"))
import lib  # noqa: E402

CACHE = Path(__file__).resolve().parent / ".cache"  # gitignored
CACHE.mkdir(exist_ok=True)
RAW_DIR = ROOT.parent / "proxycurl_enrichment" / "apify_results"
LLM_MODEL = "gpt-4.1-mini"
PRICE_IN, PRICE_OUT = 0.40, 1.60  # USD per 1M tokens

_usage_lock = threading.Lock()


def url_key(u):
    return re.sub(r"[/?].*$", "", (u or "").lower().split("linkedin.com/in/")[-1]).strip("/")


def load_raw_by_person(corpus):
    """Map person_id -> raw Apify profile (matched on LinkedIn URL)."""
    raw = []
    for f in ("apify_linkedin_results.json", "apify_linkedin_results_spring_2025.json"):
        raw += json.loads((RAW_DIR / f).read_text())
    by_url = {url_key(r.get("linkedinUrl")): r for r in raw if not r.get("error")}
    return {pid: by_url[url_key(p["linkedin_url"])] for pid, p in corpus.items() if url_key(p["linkedin_url"]) in by_url}


def upsert(table, rows, on_conflict, batch=500):
    key = lib.ENV["SUPABASE_SERVICE_ROLE_KEY"]
    for i in range(0, len(rows), batch):
        req = urllib.request.Request(
            f"{lib.SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}", method="POST",
            data=json.dumps(rows[i:i + batch]).encode(),
            headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
                     "Prefer": "resolution=merge-duplicates,return=minimal"})
        try:
            urllib.request.urlopen(req, timeout=120).read()
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"upsert {table} failed: {e.code} {e.read()[:500]}") from e
    print(f"  upserted {len(rows)} rows into {table}")


def record_usage(job, usage):
    with _usage_lock:
        path = CACHE / "usage.json"
        ledger = json.loads(path.read_text()) if path.exists() else {}
        j = ledger.setdefault(job, {"prompt_tokens": 0, "completion_tokens": 0, "calls": 0})
        j["prompt_tokens"] += usage.get("prompt_tokens", 0)
        j["completion_tokens"] += usage.get("completion_tokens", 0)
        j["calls"] += 1
        j["cost_usd"] = round(j["prompt_tokens"] / 1e6 * PRICE_IN + j["completion_tokens"] / 1e6 * PRICE_OUT, 4)
        path.write_text(json.dumps(ledger, indent=1))


def llm_json(system, user, job, max_tokens=4000):
    """One chat completion returning a JSON object. Retries with backoff on rate limits."""
    body = {"model": LLM_MODEL, "temperature": 0, "max_tokens": max_tokens, "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    for attempt in range(7):
        req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=json.dumps(body).encode(),
                                     headers={"Authorization": "Bearer " + lib.ENV["OPENAI_API_KEY"], "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                d = json.load(r)
            record_usage(job, d["usage"])
            return json.loads(d["choices"][0]["message"]["content"])
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            code = getattr(e, "code", None)
            if code and code not in (429, 500, 502, 503, 529):
                raise RuntimeError(f"LLM call failed: {code} {e.read()[:300]}") from e
            time.sleep(min(60, 3 * 2 ** attempt))
    raise RuntimeError("LLM call failed after retries")


def load_cache(name):
    path = CACHE / f"{name}.json"
    return json.loads(path.read_text()) if path.exists() else {}


def save_cache(name, data):
    (CACHE / f"{name}.json").write_text(json.dumps(data))


SIZE_BUCKET = {"0-1": "startup", "2-10": "startup", "11-50": "startup", "51-200": "growth", "201-500": "growth",
               "501-1000": "growth", "1001-5000": "large", "5001-10000": "large", "10001-0": "large"}
