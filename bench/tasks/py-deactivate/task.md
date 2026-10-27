Admins need to deactivate user accounts.

- Add `POST /users/{id}/deactivate`. It returns 200 with the updated user, which shows that the account is no longer active and when it was deactivated.
- Deactivated users must not be able to send messages any more.
- Keep the tests green (`python3 -m unittest discover -s tests`) and add tests for the new behaviour.
