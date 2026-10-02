"""Audit the person-level LLM labels against a stronger model on a random sample (agreement as an accuracy proxy).

Usage: python3 06_audit_people.py [sample_size]
"""
import importlib
import json
import random
import sys
import time
import urllib.request

from common import lib, load_cache

cp = importlib.import_module("02_classify_people")
AUDIT_MODEL = "gpt-4.1"


def audit(p):
    body = {"model": AUDIT_MODEL, "temperature": 0, "max_tokens": 300, "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": cp.SYSTEM}, {"role": "user", "content": cp.profile(p)}]}
    for attempt in range(6):
        req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=json.dumps(body).encode(),
                                     headers={"Authorization": "Bearer " + lib.ENV["OPENAI_API_KEY"], "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(json.load(r)["choices"][0]["message"]["content"])
        except Exception:  # noqa: BLE001
            time.sleep(5 * (attempt + 1))
    return None


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 80
    corpus, labels = lib.load_corpus(), load_cache("person_labels")
    random.seed(5)
    sample = random.sample(sorted(labels), n)
    agree = {"technical_background": 0, "military_veteran": 0, "pre_hbs_archetype": 0, "post_hbs_path": 0}
    tag_tp = tag_ours = tag_theirs = total = 0
    for pid in sample:
        a = audit(corpus[pid])
        if not a:
            continue
        total += 1
        mine = labels[pid]
        for f in agree:
            agree[f] += mine[f] == a.get(f)
        ours, theirs = set(mine["sector_tags"]), set(a.get("sector_tags") or [])
        tag_tp += len(ours & theirs)
        tag_ours += len(ours)
        tag_theirs += len(theirs)
    print(f"audited {total} people against {AUDIT_MODEL}")
    for f, v in agree.items():
        print(f"  {f:22s} agreement {100 * v / total:.0f}%")
    print(f"  sector_tags: {100 * tag_tp / max(tag_ours, 1):.0f}% of our tags confirmed by the auditor; "
          f"we have {100 * tag_tp / max(tag_theirs, 1):.0f}% of the auditor's tags")
