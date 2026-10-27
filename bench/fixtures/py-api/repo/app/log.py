"""Structured log: one record per event."""
records = []


def info(event, **fields):
    records.append({'level': 'info', 'event': event, **fields})


def warn(event, **fields):
    records.append({'level': 'warn', 'event': event, **fields})


def reset():
    records.clear()
