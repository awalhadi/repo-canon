Some users are spamming. Limit `POST /messages` to 5 messages per user per minute.

- Requests over the limit must be refused in a way clients can act on.
- Keep the tests green (`python3 -m unittest discover -s tests`) and add tests for the new behaviour.
