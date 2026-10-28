"""In-memory tables."""
users = {}
messages = []


def reset():
    users.clear()
    messages.clear()
