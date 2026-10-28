"""Per-user fixed-window rate limits."""
import math
from datetime import timedelta

from app import clock

_hits = {}


def check(key, limit, window_seconds):
    """Returns 0 when allowed, else whole seconds until the next request would succeed."""
    now = clock.now()
    window = timedelta(seconds=window_seconds)
    recent = [t for t in _hits.get(key, []) if now - t < window]
    if len(recent) >= limit:
        _hits[key] = recent
        return max(1, math.ceil((recent[0] + window - now).total_seconds()))
    recent.append(now)
    _hits[key] = recent
    return 0


def reset():
    _hits.clear()
