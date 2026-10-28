import unittest
import itertools
from datetime import datetime, timedelta, timezone

from app import clock, log, store
from app.routes import dispatch


def send(user):
    return dispatch('POST', '/messages', {'to': 'u1', 'text': 'hi'}, {'X-User': user})


_hours = itertools.count()


class HiddenRateLimitTest(unittest.TestCase):
    def setUp(self):
        store.reset()
        log.reset()
        # Each test starts an hour later, so limiter state from another test has always expired
        clock.freeze(datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc) + timedelta(hours=next(_hours)))
        dispatch('POST', '/users', {'name': 'Ada'})
        dispatch('POST', '/users', {'name': 'Bob'})

    def tearDown(self):
        clock.unfreeze()

    def test_sixth_message_in_a_minute_is_refused(self):
        for _ in range(5):
            self.assertEqual(send('u1')[0], 201)
        clock.advance(30)
        status, body = send('u1')
        self.assertEqual((status, body['error']['code']), (429, 'too_many_requests'))
        retry_after = body['error'].get('retry_after')
        self.assertIsInstance(retry_after, int)
        self.assertTrue(1 <= retry_after <= 60, retry_after)
        self.assertEqual(len(store.messages), 5)

    def test_allowed_again_after_the_minute(self):
        for _ in range(5):
            send('u1')
        clock.advance(61)
        self.assertEqual(send('u1')[0], 201)

    def test_limits_are_per_user(self):
        for _ in range(5):
            send('u1')
        self.assertEqual(send('u2')[0], 201)

    def test_refusal_is_logged(self):
        for _ in range(6):
            send('u1')
        refused = [r for r in log.records if r['event'] == 'message.rate_limited']
        self.assertEqual(len(refused), 1)
        self.assertEqual((refused[0]['level'], refused[0].get('user_id')), ('warn', 'u1'))
