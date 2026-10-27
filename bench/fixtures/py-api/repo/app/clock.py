"""The only source of time in the app, so tests can freeze it."""
from datetime import datetime, timedelta, timezone

_frozen = None


def now():
    return _frozen if _frozen is not None else datetime.now(timezone.utc)


def iso(moment=None):
    return (moment or now()).astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def freeze(moment):
    global _frozen
    _frozen = moment


def advance(seconds):
    freeze(now() + timedelta(seconds=seconds))


def unfreeze():
    global _frozen
    _frozen = None
