from app.errors import ApiError


def require_str(data, key, max_len=200):
    value = (data or {}).get(key)
    if not isinstance(value, str) or not value.strip():
        raise ApiError(400, 'invalid_input', f'{key} is required')
    if len(value) > max_len:
        raise ApiError(400, 'invalid_input', f'{key} is too long')
    return value.strip()


def require_user(request):
    if not request.user_id:
        raise ApiError(401, 'unauthenticated', 'X-User header is required')
    return request.user_id
