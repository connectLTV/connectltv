"""Embed every chunk once at 3072 dims (text-embedding-3-large) into a local cache.

Lower-dimension variants are derived by truncating and renormalising (the model is trained
for this), so the corpus is only embedded once. Output: eval/.cache/chunk_emb_3072.npy
"""
import concurrent.futures as cf
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "eval"))
import lib  # noqa: E402

MODEL = "text-embedding-3-large"


def embed(texts):
    body = {"model": MODEL, "input": texts}
    req = urllib.request.Request("https://api.openai.com/v1/embeddings", data=json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + lib.ENV["OPENAI_API_KEY"], "Content-Type": "application/json"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                d = json.load(r)
            return [x["embedding"] for x in d["data"]], d["usage"]["total_tokens"]
        except Exception as e:  # noqa: BLE001
            if attempt == 4:
                raise
            print("retry", e)


if __name__ == "__main__":
    chunks = json.loads((lib.CACHE_DIR / "chunks_meta.json").read_text())
    texts = [c["text_raw"][:8000] or " " for c in chunks]
    batches = [texts[i:i + 200] for i in range(0, len(texts), 200)]
    out = np.zeros((len(texts), 3072), dtype=np.float32)
    tokens = 0
    with cf.ThreadPoolExecutor(4) as ex:
        for i, (embs, t) in enumerate(ex.map(embed, batches)):
            out[i * 200:i * 200 + len(embs)] = np.array(embs, dtype=np.float32)
            tokens += t
            if i % 25 == 0:
                print(f"{i}/{len(batches)} batches", flush=True)
    np.save(lib.CACHE_DIR / "chunk_emb_3072.npy", out)
    print("done. tokens:", tokens, "est cost $%.3f" % (tokens / 1e6 * 0.13))
