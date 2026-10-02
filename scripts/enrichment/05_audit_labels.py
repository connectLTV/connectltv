"""Audit the cached title labels against an independent, stronger model on a random sample.

Reports per-field agreement. Agreement with a stronger model is used as a proxy for accuracy.
Usage: python3 05_audit_labels.py [sample_size]
"""
import json
import random
import sys
import urllib.request

from common import lib, load_cache

sys.path.insert(0, ".")
import importlib

ct = importlib.import_module("01_classify_titles")
AUDIT_MODEL = "claude-sonnet-5"
FIELDS = ct.KEYS


def claude(system, user):
    body = {"model": AUDIT_MODEL, "max_tokens": 4000, "system": system, "messages": [{"role": "user", "content": user}]}
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=json.dumps(body).encode(),
                                 headers={"x-api-key": lib.ENV["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01",
                                          "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        text = "".join(b.get("text", "") for b in json.load(r)["content"])
    return json.loads(text[text.index("{"):text.rindex("}") + 1])


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    cache = sys.argv[2] if len(sys.argv) > 2 else "title_labels_v2"
    labels = load_cache(cache)
    random.seed(3)
    keys = random.sample(sorted(labels), min(n, len(labels)))
    agree = {f: 0 for f in FIELDS}
    total, disagreements = 0, []
    audit_cache = load_cache("audit_labels")
    for i in range(0, len(keys), 20):
        batch = [k for k in keys[i:i + 20] if k not in audit_cache]
        if batch:
            user = "id\ttitle\tindustry\n" + "\n".join(f"{j}\t{k.split('||')[0]}\t{k.split('||')[1] or 'unknown'}" for j, k in enumerate(batch))
            out = claude(ct.SYSTEM, user)
            for row in out.get("labels", []):
                if isinstance(row, dict) and isinstance(row.get("id"), int) and 0 <= row["id"] < len(batch):
                    v = ct.valid(row, batch[row["id"]].split("||")[0])
                    if v:
                        audit_cache[batch[row["id"]]] = v
    from common import save_cache
    save_cache("audit_labels", audit_cache)
    for k in keys:
        if k not in audit_cache:
            continue
        total += 1
        for f in FIELDS:
            if labels[k][f] == audit_cache[k][f]:
                agree[f] += 1
            else:
                disagreements.append((f, k.split("||")[0], labels[k][f], audit_cache[k][f]))
    print(f"audited {total} labels from {cache}")
    for f in FIELDS:
        print(f"  {f:18s} agreement {100 * agree[f] / max(total, 1):.0f}%")
    for f in ("role_type", "function", "seniority"):
        print(f"-- sample disagreements: {f} (title | ours | auditor)")
        for d in [d for d in disagreements if d[0] == f][:6]:
            print("    ", d[1][:50], "|", d[2], "|", d[3])
