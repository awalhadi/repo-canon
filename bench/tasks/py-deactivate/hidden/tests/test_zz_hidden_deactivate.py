import unittest
from datetime import datetime, timezone

from app import clock, log, store
from app.routes import dispatch


class HiddenDeactivateTest(unittest.TestCase):
    def setUp(self):
        store.reset()
        log.reset()
        clock.freeze(datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc))
        dispatch('POST', '/users', {'name': 'Ada'})
        dispatch('POST', '/users', {'name': 'Bob'})
        clock.advance(60)

    def tearDown(self):
        clock.unfreeze()

    def test_deactivate_sets_flag_and_timestamp(self):
        status, user = dispatch('POST', '/users/u1/deactivate')
        self.assertEqual(status, 200)
        self.assertIs(user['active'], False)
        self.assertEqual(user['deactivated_at'], '2026-01-02T03:05:05Z')
        self.assertIn('u1', store.users)

    def test_logs_the_state_change(self):
        dispatch('POST', '/users/u1/deactivate')
        event = log.records[-1]
        self.assertEqual((event['event'], event.get('user_id')), ('user.deactivated', 'u1'))

    def test_twice_is_a_conflict(self):
        dispatch('POST', '/users/u1/deactivate')
        status, body = dispatch('POST', '/users/u1/deactivate')
        self.assertEqual((status, body['error']['code']), (409, 'user_already_deactivated'))

    def test_unknown_user(self):
        status, body = dispatch('POST', '/users/u9/deactivate')
        self.assertEqual((status, body['error']['code']), (404, 'user_not_found'))

    def test_deactivated_user_cannot_send(self):
        dispatch('POST', '/users/u1/deactivate')
        status, body = dispatch('POST', '/messages', {'to': 'u2', 'text': 'hi'}, {'X-User': 'u1'})
        self.assertEqual((status, body['error']['code']), (403, 'user_deactivated'))
        self.assertEqual(dispatch('POST', '/messages', {'to': 'u1', 'text': 'hi'}, {'X-User': 'u2'})[0], 201)
