"""Run the eval suite against a search edge function and write a scorecard.

Usage:
  python3 eval/run_eval.py --target search-eval --label baseline --runs 2
  python3 eval/run_eval.py --target search-v2 --label v2-hybrid --only structured,conjunctive
  python3 eval/run_eval.py --rescore baseline          # recompute the scorecard from a saved run

Raw outputs go to eval/runs/ (gitignored). Scorecards (aggregates only) go to eval/scorecards/.
"""
import argparse
import concurrent.futures as cf
import datetime
import json
import statistics
import time
import urllib.request

import lib

# USD per 1M tokens, used only for the cost estimate
PRICES = {"gpt-4.1-mini": (0.40, 1.60)}


def run_query(target, case, timeout=300):
    key = lib.anon_key()
    body = {"query": case["query"], "stream": True, "track_person_ids": case["expected_person_ids"]}
    req = urllib.request.Request(
        f"{lib.SUPABASE_URL}/functions/v1/{target}", data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}", "apikey": key})
    out = {"ids": [], "why": {}, "ttfr_ms": None, "total_ms": None, "error": None, "debug": None, "meta": {}}
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            ctype = r.headers.get("Content-Type", "")
            if "text/event-stream" not in ctype:
                data = json.load(r)
                out["error"] = data.get("error") or "non-stream response"
                out["ids"] = [x.get("person_id") for x in data.get("results", [])]
            else:
                for raw in r:
                    line = raw.decode("utf-8", "replace").strip()
                    if not line.startswith("data: "):
                        continue
                    ev = json.loads(line[6:])
                    if ev["type"] == "result":
                        if out["ttfr_ms"] is None:
                            out["ttfr_ms"] = int((time.time() - t0) * 1000)
                        pid = ev["result"]["person_id"]
                        if pid not in out["why"]:
                            out["ids"].append(pid)
                            out["why"][pid] = ev["result"].get("why_relevant", "")
                    elif ev["type"] == "start":
                        out["meta"] = {k: v for k, v in ev.items() if k != "type"}
                    elif ev["type"] == "complete":
                        out["debug"] = ev.get("debug")
                    elif ev["type"] == "error":
                        out["error"] = ev.get("message")
    except Exception as e:  # noqa: BLE001
        out["error"] = f"{type(e).__name__}: {e}"
    out["total_ms"] = int((time.time() - t0) * 1000)
    return out


def pct(xs, q):
    xs = sorted(x for x in xs if x is not None)
    if not xs:
        return None
    return xs[min(len(xs) - 1, int(round(q * (len(xs) - 1))))]


def mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def score_case(case, runs, judgments):
    """Metrics for one case, averaged over its repeated runs."""
    exp = set(case["expected_person_ids"])
    m = {"recall": [], "r10": [], "r30": [], "precision": [], "count_ratio": [], "hit": [], "rr": [], "n_returned": []}
    for r in runs:
        ids = r["ids"]
        m["n_returned"].append(len(ids))
        if case["type"] == "open":
            judged = [judgments.get(f'{case["query"]}||{i}') for i in ids]
            judged = [j for j in judged if j is not None]
            m["precision"].append(sum(judged) / len(judged) if judged else None)
            continue
        got = [i for i in ids if i in exp]
        m["recall"].append(len(got) / len(exp))
        for k, name in ((10, "r10"), (30, "r30")):
            m[name].append(len([i for i in ids[:k] if i in exp]) / min(k, len(exp)))
        m["precision"].append(len(got) / len(ids) if ids else None)
        m["count_ratio"].append(len(ids) / len(exp))
        if case["type"] == "known_item":
            m["hit"].append(1.0 if got else 0.0)
            ranks = [ids.index(i) + 1 for i in got]
            m["rr"].append(1 / min(ranks) if ranks else 0.0)
    res = {k: mean(v) for k, v in m.items()}
    if len(runs) > 1:
        a, b = set(runs[0]["ids"]), set(runs[1]["ids"])
        res["stability"] = len(a & b) / len(a | b) if (a | b) else 1.0
    res["ttfr_ms"] = mean([r["ttfr_ms"] for r in runs])
    res["total_ms"] = mean([r["total_ms"] for r in runs])
    res["errors"] = sum(1 for r in runs if r["error"])
    return res


def cost_of(run):
    usage = (run.get("debug") or {}).get("usage")
    if not usage:
        return None
    if "cost_usd" in usage:
        return usage["cost_usd"]
    pin, pout = PRICES["gpt-4.1-mini"]
    return usage.get("prompt_tokens", 0) / 1e6 * pin + usage.get("completion_tokens", 0) / 1e6 * pout


def fmt(x, kind="pct"):
    if x is None:
        return "n/a"
    if kind == "pct":
        return f"{100 * x:.0f}%"
    if kind == "ms":
        return f"{x / 1000:.1f}s"
    if kind == "usd":
        return f"${x:.4f}"
    return f"{x:.2f}"


def write_scorecard(label, data, cases, judgments):
    by_id = {c["id"]: c for c in cases}
    scored = {cid: score_case(by_id[cid], runs, judgments) for cid, runs in data["results"].items() if cid in by_id}
    classes = sorted({by_id[c]["failure_class"] for c in scored})
    all_runs = [r for runs in data["results"].values() for r in runs]

    def agg(ids, key):
        return mean([scored[i].get(key) for i in ids])

    exact = [i for i in scored if by_id[i]["type"] != "open"]
    known = [i for i in scored if by_id[i]["type"] == "known_item"]
    enum = [i for i in scored if by_id[i]["type"] == "enumerable"]
    openq = [i for i in scored if by_id[i]["type"] == "open"]
    costs = [c for c in (cost_of(r) for r in all_runs) if c is not None]
    lines = [
        f"# Eval scorecard: {label}", "",
        f"- Target function: `{data['target']}`", f"- Run at: {data['started']}",
        f"- Cases: {len(scored)} ({len(enum)} enumerable, {len(known)} known-item, {len(openq)} open-ended), {data['runs']} run(s) each",
        f"- Request errors: {sum(1 for r in all_runs if r['error'])} of {len(all_runs)}", "",
        "## Headline", "", "| Metric | Value |", "|---|---|",
        f"| Recall, all cases with exact ground truth | {fmt(agg(exact, 'recall'))} |",
        f"| Recall, enumerable | {fmt(agg(enum, 'recall'))} |",
        f"| Known-item hit rate | {fmt(agg(known, 'hit'))} |",
        f"| Known-item mean reciprocal rank | {fmt(agg(known, 'rr'), 'num')} |",
        f"| Precision vs ground truth (enumerable + known-item) | {fmt(agg(exact, 'precision'))} |",
        f"| Precision, open-ended (LLM-judged) | {fmt(agg(openq, 'precision'))} |",
        f"| Time to first result, median / p95 | {fmt(pct([r['ttfr_ms'] for r in all_runs], .5), 'ms')} / {fmt(pct([r['ttfr_ms'] for r in all_runs], .95), 'ms')} |",
        f"| Total time, median / p95 | {fmt(pct([r['total_ms'] for r in all_runs], .5), 'ms')} / {fmt(pct([r['total_ms'] for r in all_runs], .95), 'ms')} |",
        f"| Stability across repeated runs (Jaccard) | {fmt(agg(list(scored), 'stability'))} |",
        f"| LLM cost per query, mean | {fmt(mean(costs), 'usd')} |",
        f"| Queries returning zero results | {sum(1 for i in scored if scored[i]['n_returned'] == 0)} |", "",
        "## By failure class", "",
        "| Class | Cases | Recall | Recall@10 | Recall@30 | Returned / true count | Hit rate | Precision | Time to first result |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for cls in classes:
        ids = [i for i in scored if by_id[i]["failure_class"] == cls]
        lines.append(f"| {cls} | {len(ids)} | {fmt(agg(ids, 'recall'))} | {fmt(agg(ids, 'r10'))} | {fmt(agg(ids, 'r30'))} | "
                     f"{fmt(agg(ids, 'count_ratio'))} | {fmt(agg(ids, 'hit'))} | {fmt(agg(ids, 'precision'))} | {fmt(agg(ids, 'ttfr_ms'), 'ms')} |")
    lines += ["", "Notes: recall@k is measured against min(k, true count). Precision for the `paraphrase`, `temporal` and "
              "\"VCs\" cases uses regex-derived ground truth and understates true precision. Open-ended precision is LLM-judged.", ""]

    # Where expected people were lost (only when the target reports attribution)
    stages = {}
    for cid, runs in data["results"].items():
        for r in runs:
            for stage in ((r.get("debug") or {}).get("attribution") or {}).values():
                stage = "returned" if stage.startswith("returned") else stage
                stages[stage] = stages.get(stage, 0) + 1
    if stages:
        total = sum(stages.values())
        lines += ["## Where expected people were lost", "", "| Stage | Share of expected people |", "|---|---|"]
        for stage, n in sorted(stages.items(), key=lambda x: -x[1]):
            lines.append(f"| {stage} | {100 * n / total:.1f}% |")
        lines.append("")

    lines += ["## Per case", "", "| Case | True count | Returned | Recall | Precision |", "|---|---|---|---|---|"]
    for cid in sorted(scored, key=lambda i: (by_id[i]["failure_class"], i)):
        s, c = scored[cid], by_id[cid]
        lines.append(f"| {c['query']} | {c['expected_count'] or 'n/a'} | {s['n_returned']:.0f} | {fmt(s.get('recall'))} | {fmt(s.get('precision'))} |")
    lib.SCORECARD_DIR.mkdir(exist_ok=True)
    path = lib.SCORECARD_DIR / f"{data['started'][:10]}-{label}.md"
    path.write_text("\n".join(lines) + "\n")
    return path, scored


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default="search-eval")
    ap.add_argument("--label")
    ap.add_argument("--runs", type=int, default=1)
    ap.add_argument("--only", help="comma-separated failure classes")
    ap.add_argument("--concurrency", type=int, default=3)
    ap.add_argument("--rescore", help="label of a saved run to rescore")
    ap.add_argument("--judge", action="store_true", help="LLM-judge open-ended results (cached)")
    args = ap.parse_args()

    cases = [json.loads(l) for l in (lib.EVAL_DIR / "queries.jsonl").read_text().splitlines() if l.strip()]
    lib.RUNS_DIR.mkdir(exist_ok=True)
    label = args.rescore or args.label or args.target
    run_path = lib.RUNS_DIR / f"{label}.json"

    if args.rescore:
        data = json.loads(run_path.read_text())
    else:
        todo = [c for c in cases if not args.only or c["failure_class"] in args.only.split(",")]
        data = {"target": args.target, "label": label, "runs": args.runs,
                "started": datetime.datetime.now().isoformat(timespec="seconds"), "results": {}}
        jobs = [(c, i) for c in todo for i in range(args.runs)]
        with cf.ThreadPoolExecutor(args.concurrency) as ex:
            futs = {ex.submit(run_query, args.target, c): (c, i) for c, i in jobs}
            for n, f in enumerate(cf.as_completed(futs), 1):
                c, _ = futs[f]
                data["results"].setdefault(c["id"], []).append(f.result())
                if n % 20 == 0:
                    print(f"  {n}/{len(jobs)} done", flush=True)
        run_path.write_text(json.dumps(data))

    judgments_path = lib.EVAL_DIR / "judgments.json"
    judgments = json.loads(judgments_path.read_text()) if judgments_path.exists() else {}
    if args.judge:
        import judge
        judgments = judge.judge_run(data, cases, judgments)
        judgments_path.write_text(json.dumps(judgments, indent=0, sort_keys=True))
    path, _ = write_scorecard(label, data, cases, judgments)
    print("scorecard:", path)
    print("\n".join(path.read_text().splitlines()[:36]))


if __name__ == "__main__":
    main()
