"""List the cases of a saved run that miss expected people or over-return, with the translated filters.

Usage: python3 eval/inspect_run.py <label>
"""
import collections
import json
import sys

import lib

label = sys.argv[1]
data = json.loads((lib.RUNS_DIR / f"{label}.json").read_text())
cases = {json.loads(l)["id"]: json.loads(l) for l in (lib.EVAL_DIR / "queries.jsonl").read_text().splitlines() if l.strip()}
judgments = json.loads((lib.EVAL_DIR / "judgments.json").read_text())
for cid, runs in data["results"].items():
    c, r = cases[cid], runs[0]
    exp, ids, dbg = set(c["expected_person_ids"]), r["ids"], r["debug"] or {}
    tr = dbg.get("translation") or {}
    if c["type"] == "open":
        j = [judgments.get(f'{c["query"]}||{i}') for i in ids]
        print(f'OPEN {c["query"]!r}: {len(ids)} results, {sum(1 for x in j if x)} judged relevant | route {dbg.get("route")} '
              f'judged {dbg.get("judged")} | filters {json.dumps(tr.get("filters"))[:200]} | semantic {tr.get("semantic")!r}')
        continue
    rec = len(exp & set(ids)) / len(exp)
    prec = len(exp & set(ids)) / len(ids) if ids else 0
    if rec < 0.9 or prec < 0.8 or r["error"]:
        lost = collections.Counter(v.split(":")[0] for v in (dbg.get("attribution") or {}).values())
        print(f'{c["query"]!r}: true {len(exp)}, returned {len(ids)}, recall {rec:.2f}, precision {prec:.2f}, route {dbg.get("route")}, '
              f'{dict(lost)} {r["error"] or ""}\n     filters {json.dumps(tr.get("filters"))[:300]} | semantic {tr.get("semantic")!r}')
