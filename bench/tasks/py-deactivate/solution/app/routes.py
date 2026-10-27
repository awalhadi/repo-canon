"""Route table and dispatcher. Every handler is registered here."""
import re
from dataclasses import dataclass, field

from app.errors import ApiError
from app.handlers import messages, users

ROUTES = [
    ('POST', '/users', users.create_user),
    ('GET', '/users/{id}', users.get_user),
    ('POST', '/users/{id}/deactivate', users.deactivate_user),
    ('POST', '/messages', messages.send_message),
]


@dataclass
class Request:
    body: dict = field(default_factory=dict)
    params: dict = field(default_factory=dict)
    user_id: str = None


def _match(pattern, path):
    regex = '^' + re.sub(r'\{(\w+)\}', r'(?P<\1>[^/]+)', pattern) + '$'
    found = re.match(regex, path)
    return found.groupdict() if found else None


def dispatch(method, path, body=None, headers=None):
    for route_method, pattern, handler in ROUTES:
        params = _match(pattern, path)
        if route_method == method and params is not None:
            request = Request(body=body or {}, params=params, user_id=(headers or {}).get('X-User'))
            try:
                return handler(request)
            except ApiError as error:
                return error.status, error.body()
    return 404, {'error': {'code': 'route_not_found', 'message': f'{method} {path}'}}
