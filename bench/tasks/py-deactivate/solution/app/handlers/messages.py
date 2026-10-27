from app import clock, log, store
from app.errors import ApiError
from app.validators import require_str, require_user


def send_message(request):
    sender = require_user(request)
    if sender in store.users and not store.users[sender]['active']:
        raise ApiError(403, 'user_deactivated', 'deactivated users cannot send messages')
    to = require_str(request.body, 'to')
    text = require_str(request.body, 'text', max_len=1000)
    if to not in store.users:
        raise ApiError(404, 'user_not_found', 'no such recipient')
    message = {'id': len(store.messages) + 1, 'from': sender, 'to': to, 'text': text, 'sent_at': clock.iso()}
    store.messages.append(message)
    log.info('message.sent', user_id=sender, message_id=message['id'])
    return 201, message
