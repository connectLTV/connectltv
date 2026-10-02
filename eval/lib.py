"""Shared helpers for the eval harness: env loading, Supabase REST access, local data cache."""
import json
import os
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVAL_DIR = ROOT / "eval"
CACHE_DIR = EVAL_DIR / ".cache"  # gitignored: contains alumni data
RUNS_DIR = EVAL_DIR / "runs"  # gitignored: raw outputs contain alumni data
SCORECARD_DIR = EVAL_DIR / "scorecards"

SUPABASE_URL = "https://bcpwjwfubnpchoscvrum.supabase.co"


def load_env():
    """Read key=value pairs from supabase/.env (never printed)."""
    env = {}
    for line in (ROOT / "supabase" / ".env").read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


ENV = load_env()


def anon_key():
    import re
    src = (ROOT / "src" / "integrations" / "supabase" / "client.ts").read_text()
    return re.search(r"eyJ[A-Za-z0-9_.\-]+", src).group(0)


def rest_get(table, select="*", params=None, page=1000):
    """Fetch all rows of a table through PostgREST with the service role key."""
    key = ENV["SUPABASE_SERVICE_ROLE_KEY"]
    rows, offset = [], 0
    while True:
        q = {"select": select, "limit": page, "offset": offset, **(params or {})}
        url = f"{SUPABASE_URL}/rest/v1/{table}?{urllib.parse.urlencode(q)}"
        req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
        with urllib.request.urlopen(req, timeout=120) as r:
            batch = json.load(r)
        rows.extend(batch)
        if len(batch) < page:
            return rows
        offset += page


def load_table(name, select="*", order=None, refresh=False):
    """Load a table, caching it locally as JSON."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{name}.json"
    if path.exists() and not refresh:
        return json.loads(path.read_text())
    rows = rest_get(name, select, {"order": order} if order else None)
    path.write_text(json.dumps(rows))
    return rows


def load_corpus(refresh=False):
    """People with their experiences, educations and skills attached."""
    people = load_table("people", order="person_id", refresh=refresh)
    exps = load_table("experiences", order="exp_id", refresh=refresh)
    edus = load_table("educations", order="edu_id", refresh=refresh)
    skills = load_table("skills", order="skill_id", refresh=refresh)
    by_id = {p["person_id"]: {**p, "experiences": [], "educations": [], "skills": []} for p in people}
    for e in exps:
        by_id[e["person_id"]]["experiences"].append(e)
    for e in edus:
        by_id[e["person_id"]]["educations"].append(e)
    for s in skills:
        by_id[s["person_id"]]["skills"].append(s["skill_name"])
    for p in by_id.values():
        p["experiences"].sort(key=lambda e: e.get("sort_index") or 0)
    return by_id
