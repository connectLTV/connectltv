"""Compare embedding dimensions (800 / 1536 / 3072) with exact search, offline.

For every eval case with ground truth: rank people by their best chunk similarity and
measure how many expected people land in the top N people. This isolates the dense
retriever from the rest of the pipeline. Also reports agreement with full-precision ranking.
"""
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "eval"))
import lib  # noqa: E402


def embed_queries(texts):
    path = lib.CACHE_DIR / "query_emb_3072.json"
    cache = json.loads(path.read_text()) if path.exists() else {}
    todo = [t for t in texts if t not in cache]
    for i in range(0, len(todo), 100):
        body = {"model": "text-embedding-3-large", "input": todo[i:i + 100]}
        req = urllib.request.Request("https://api.openai.com/v1/embeddings", data=json.dumps(body).encode(),
                                     headers={"Authorization": "Bearer " + lib.ENV["OPENAI_API_KEY"], "Content-Type": "application/json"})
        for t, d in zip(todo[i:i + 100], json.load(urllib.request.urlopen(req))["data"]):
            cache[t] = d["embedding"]
    path.write_text(json.dumps(cache))
    return np.array([cache[t] for t in texts], dtype=np.float32)


def truncate(m, d):
    m = m[:, :d]
    return m / np.linalg.norm(m, axis=1, keepdims=True)


if __name__ == "__main__":
    chunks = json.loads((lib.CACHE_DIR / "chunks_meta.json").read_text())
    emb = np.load(lib.CACHE_DIR / "chunk_emb_3072.npy")
    cases = [json.loads(l) for l in (lib.EVAL_DIR / "queries.jsonl").read_text().splitlines() if l.strip()]
    q3072 = embed_queries([c["query"] for c in cases])
    people = sorted({c["person_id"] for c in chunks})
    pidx = {p: i for i, p in enumerate(people)}
    chunk_person = np.array([pidx[c["person_id"]] for c in chunks])

    full_top = None
    print("| Dims | Storage as vector | Storage as halfvec | Top-200 chunk agreement with 3072 | Expected people in top 50 | in top 200 | in top 500 |")
    print("|---|---|---|---|---|---|---|")
    results = {}
    for d in (3072, 1536, 800, 256):
        E, Q = truncate(emb, d), truncate(q3072, d)
        sims = Q @ E.T  # queries x chunks
        top = np.argsort(-sims, axis=1)[:, :200]
        if full_top is None:
            full_top = top
        agree = np.mean([len(set(a) & set(b)) / 200 for a, b in zip(top, full_top)])
        rec = {50: [], 200: [], 500: []}
        for qi, c in enumerate(cases):
            exp = [pidx[p] for p in c["expected_person_ids"] if p in pidx]
            if not exp:
                continue
            person_score = np.full(len(people), -1.0, dtype=np.float32)
            np.maximum.at(person_score, chunk_person, sims[qi])
            order = np.argsort(-person_score)
            for n in rec:
                rec[n].append(len(set(order[:n]) & set(exp)) / min(n, len(exp)))
        mb = len(chunks) * d * 4 / 1e6
        results[d] = {n: float(np.mean(v)) for n, v in rec.items()}
        print(f"| {d} | {mb:.0f} MB | {mb / 2:.0f} MB | {100 * agree:.0f}% | {100 * np.mean(rec[50]):.1f}% | {100 * np.mean(rec[200]):.1f}% | {100 * np.mean(rec[500]):.1f}% |")
