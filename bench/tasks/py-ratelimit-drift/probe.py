"""Prints the error code of the sixth message in a minute: which code the app returns."""
from app import store
from app.routes import dispatch

try:
    store.reset()
    dispatch('POST', '/users', {'name': 'Ada'})
    dispatch('POST', '/users', {'name': 'Bob'})
    result = None
    for _ in range(6):
        result = dispatch('POST', '/messages', {'to': 'u1', 'text': 'hi'}, {'X-User': 'u1'})
    status, body = result
    print('RC_PROBE=' + (body.get('error', {}).get('code', 'none') if status == 429 else 'none'))
except Exception:
    print('RC_PROBE=error')
