from __future__ import annotations

import time
from typing import Any

CACHE_SECONDS = 60 * 20
CACHE_SECONDS_LONG = 60 * 60  # 1 hour for institutional data

_cache: dict[str, tuple[float, Any]] = {}


def cache_get(key: str, ttl: int = CACHE_SECONDS) -> Any | None:
    item = _cache.get(key)
    if not item:
        return None
    created, value = item
    if time.time() - created > ttl:
        _cache.pop(key, None)
        return None
    return value


def cache_set(key: str, value: Any) -> Any:
    _cache[key] = (time.time(), value)
    return value
