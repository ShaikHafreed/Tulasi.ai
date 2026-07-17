"""Retrieval over the curated Meshy API/rigging knowledge base
(app/data/meshy_knowledge.py) for the assistant.

Plain TF-IDF cosine similarity via numpy — no embedding API call, so
retrieval works identically whether or not the Anthropic key has credit.
MOCK_ASSISTANT=1 gets real retrieved snippets, not just canned text; once
real Claude credit exists, the same matches get fed into the model as
grounding context instead.
"""

import re
from dataclasses import dataclass

import numpy as np

from ..data.meshy_knowledge import DOCS, KnowledgeDoc

_TOKEN_RE = re.compile(r"[a-z0-9]+")

# Only run retrieval when the message actually looks like a Meshy API/rigging
# question — cheap, predictable gate that avoids TF-IDF noise hijacking
# ordinary resize/rotate/print/export requests.
TRIGGER_WORDS = {
    "rig", "rigging", "rigged", "riggable", "animate", "animation", "animations",
    "meshy", "remesh", "polycount", "polygon", "polygons", "face", "faces",
    "humanoid", "quadruped", "credit", "credits", "api", "endpoint", "pose",
    "texture", "textured", "uv", "fbx", "glb", "webhook", "retry",
}


def looks_like_docs_question(message: str) -> bool:
    words = set(re.findall(r"[a-z]+", message.lower()))
    return bool(words & TRIGGER_WORDS)


def _stem(token: str) -> str:
    # Crude suffix stripping (not a real stemmer) — just enough that
    # "failed"/"failing" match a doc written with "fail", without pulling in
    # a stemming dependency for a handful of short knowledge-base docs.
    for suffix in ("ing", "ed", "es", "s"):
        if len(token) > len(suffix) + 2 and token.endswith(suffix):
            return token[: -len(suffix)]
    return token


def _tokenize(text: str) -> list[str]:
    return [_stem(token) for token in _TOKEN_RE.findall(text.lower())]


@dataclass(frozen=True)
class RagMatch:
    doc: KnowledgeDoc
    score: float


class _Index:
    def __init__(self, docs: list[KnowledgeDoc]):
        self.docs = docs
        tokenized = [_tokenize(f"{d.title} {d.text}") for d in docs]

        vocab: dict[str, int] = {}
        for tokens in tokenized:
            for token in set(tokens):
                vocab.setdefault(token, len(vocab))
        self.vocab = vocab

        doc_freq = np.zeros(len(vocab))
        for tokens in tokenized:
            for token in set(tokens):
                doc_freq[vocab[token]] += 1
        self.idf = np.log((1 + len(docs)) / (1 + doc_freq)) + 1

        self.doc_vectors = np.array([self._vectorize(tokens) for tokens in tokenized])
        norms = np.linalg.norm(self.doc_vectors, axis=1)
        norms[norms == 0] = 1
        self.doc_norms = norms

    def _vectorize(self, tokens: list[str]) -> np.ndarray:
        vec = np.zeros(len(self.vocab))
        for token in tokens:
            idx = self.vocab.get(token)
            if idx is not None:
                vec[idx] += 1
        return vec * self.idf

    def search(self, query: str, top_k: int, min_score: float) -> list[RagMatch]:
        query_vec = self._vectorize(_tokenize(query))
        query_norm = np.linalg.norm(query_vec)
        if query_norm == 0:
            return []
        scores = (self.doc_vectors @ query_vec) / (self.doc_norms * query_norm)
        ranked = sorted(zip(self.docs, scores), key=lambda pair: pair[1], reverse=True)
        return [RagMatch(doc, float(score)) for doc, score in ranked[:top_k] if score >= min_score]


_index = _Index(DOCS)


def search(query: str, top_k: int = 3, min_score: float = 0.08) -> list[RagMatch]:
    if not looks_like_docs_question(query):
        return []
    return _index.search(query, top_k=top_k, min_score=min_score)
