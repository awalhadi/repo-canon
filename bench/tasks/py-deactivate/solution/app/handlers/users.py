from app import clock, log, store
from app.errors import ApiError
from app.validators import require_str


def create_user(request):
    name = require_str(request.body, 'name')
    user_id = f'u{len(store.users) + 1}'
    user = {'id': user_id, 'name': name, 'active': True, 'created_at': clock.iso()}
    store.users[user_id] = user
    log.info('user.created', user_id=user_id)
    return 201, user


def get_user(request):
    user = store.users.get(request.params['id'])
    if user is None:
        raise ApiError(404, 'user_not_found', 'no such user')
    return 200, user


def deactivate_user(request):
    user = store.users.get(request.params['id'])
    if user is None:
        raise ApiError(404, 'user_not_found', 'no such user')
    if not user['active']:
        raise ApiError(409, 'user_already_deactivated', 'user is already deactivated')
    user.update(active=False, deactivated_at=clock.iso())
    log.info('user.deactivated', user_id=user['id'])
    return 200, user
