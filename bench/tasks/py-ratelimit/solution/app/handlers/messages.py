from app import clock, log, ratelimit, store
from app.errors import ApiError
from app.validators import require_str, require_user


def send_message(request):
    sender = require_user(request)
    retry_after = ratelimit.check(f'messages:{sender}', limit=5, window_seconds=60)
    if retry_after:
        log.warn('message.rate_limited', user_id=sender)
        raise ApiError(429, 'rate_limited', 'too many messages', retry_after=retry_after)
    to = require_str(request.body, 'to')
    text = require_str(request.body, 'text', max_len=1000)
    if to not in store.users:
        raise ApiError(404, 'user_not_found', 'no such recipient')
    message = {'id': len(store.messages) + 1, 'from': sender, 'to': to, 'text': text, 'sent_at': clock.iso()}
    store.messages.append(message)
    log.info('message.sent', user_id=sender, message_id=message['id'])
    return 201, message
