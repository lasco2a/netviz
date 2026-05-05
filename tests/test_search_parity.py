"""Verify Python search matches the shared fixtures."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from netviz.web.backend.search import search

FIXTURE = Path(__file__).parent / "search_cases.json"


def _load():
    return json.loads(FIXTURE.read_text("utf-8"))


@pytest.mark.parametrize("case", _load()["cases"], ids=lambda c: c["name"])
def test_search_parity(case):
    data = _load()
    got = search(case["q"], data["devices"], data["endpoints"])
    assert sorted(got["devices"]) == sorted(case["devices"]), (
        f"devices mismatch for {case['name']!r}: got {got['devices']}"
    )
    assert sorted(got["endpoints"]) == sorted(case["endpoints"]), (
        f"endpoints mismatch for {case['name']!r}: got {got['endpoints']}"
    )
