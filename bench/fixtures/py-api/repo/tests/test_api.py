import unittest
from datetime import datetime, timezone

from app import clock, log, store
from app.routes import dispatch


class ApiTest(unittest.TestCase):
    def setUp(self):
        store.reset()
        log.reset()
        clock.freeze(datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc))

    def tearDown(self):
        clock.unfreeze()

    def test_create_and_get_user(self):
        status, user = dispatch('POST', '/users', {'name': 'Ada'})
        self.assertEqual(status, 201)
        self.assertEqual(user['created_at'], '2026-01-02T03:04:05Z')
        self.assertEqual(dispatch('GET', f"/users/{user['id']}")[1]['name'], 'Ada')
        self.assertEqual(log.records[-1]['event'], 'user.created')

    def test_unknown_user(self):
        self.assertEqual(dispatch('GET', '/users/u9'), (404, {'error': {'code': 'user_not_found', 'message': 'no such user'}}))

    def test_send_message(self):
        dispatch('POST', '/users', {'name': 'Ada'})
        status, _ = dispatch('POST', '/messages', {'to': 'u1', 'text': 'hi'}, {'X-User': 'u1'})
        self.assertEqual(status, 201)


if __name__ == '__main__':
    unittest.main()
