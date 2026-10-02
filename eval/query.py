"""Run one query against a search function and print a timing / routing summary (debug helper).

Usage: python3 eval/query.py "climate tech founders" [--target search-v2] [--reranker cohere] [--show 5]
"""
import argparse
import json
import time
import urllib.request

import lib

ap = argparse.ArgumentParser()
ap.add_argument("query")
ap.add_argument("--target", default="search-v2")
ap.add_argument("--reranker")
ap.add_argument("--show", type=int, default=3)
args = ap.parse_args()

key = lib.anon_key()
body = {"query": args.query, "stream": True, "options": {"reranker": args.reranker} if args.reranker else {}}
req = urllib.request.Request(f"{lib.SUPABASE_URL}/functions/v1/{args.target}", data=json.dumps(body).encode(),
                             headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}", "apikey": key})
t0, n, first = time.time(), 0, None
with urllib.request.urlopen(req, timeout=180) as r:
    for raw in r:
        line = raw.decode("utf-8", "replace").strip()
        if not line.startswith("data: "):
            continue
        e = json.loads(line[6:])
        if e["type"] == "result":
            n += 1
            first = first or int((time.time() - t0) * 1000)
            if n <= args.show:
                res = e["result"]
                print(f"   {res['headline'][:60]} | {res['why_relevant'][:110]}")
        elif e["type"] == "complete":
            d = e.get("debug") or {}
            tr = d.get("translation") or {}
            print(f"{args.query!r} -> {d.get('route')} | results {n} | first result {first} ms | total {e['total_time_ms']} ms | "
                  f"translate {d.get('translate_ms')} | retrieve {d.get('retrieve_ms')} | rerank {d.get('rerank_ms')} | "
                  f"cost {(d.get('usage') or {}).get('cost_usd')}")
            print(f"   filters: {json.dumps(tr.get('filters'))[:400]} | semantic: {tr.get('semantic')!r} | keywords: {tr.get('keywords')}"
                  f" | judged {d.get('judged')} of {d.get('retrieved')} retrieved, {d.get('filtered_total')} passed filters")
        elif e["type"] == "error":
            print("ERROR", e)
