# AGENTS.md — py-api

Users and messages API. Python 3 standard library only — do not add packages.

## Commands
- Test: `python3 -m unittest discover -s tests`

## Layout
```
app/
  routes.py        route table + dispatcher
  handlers/        one module per resource (users, messages)
  validators.py    input checks
  errors.py        ApiError
  clock.py         the only source of time
  log.py           structured log
  store.py         in-memory tables
tests/
```

## Rules
- Time comes only from `app.clock`: `clock.now()` for comparisons, `clock.iso()` for timestamps in responses (UTC, `Z` suffix). Never call `datetime.now()`, `datetime.utcnow()` or `time.time()` — tests freeze and advance the clock.
- Validate input with `app/validators.py`; add a helper there for a new kind of check.
- Errors are `ApiError(status, code, message)` with snake_case codes `<noun>_<problem>`. A request that conflicts with the current state is a 409 with code `<noun>_already_<state>` (e.g. `user_already_deactivated`).
- Log with `app.log`, never `print`. Every state change logs `<noun>.<past-tense verb>` with `user_id`.
- Every handler is registered in `ROUTES` in `app/routes.py`.

## Decisions
- Users are never deleted. Deactivation sets `active: False` and `deactivated_at`; a deactivated user gets 403 `user_deactivated` when they try to send a message.
- Rate limits are per user. A refused request returns 429 with code `rate_limited` and `retry_after` (whole seconds until it would succeed, rounded up) in the error body, and logs a warning `<noun>.rate_limited` with `user_id`.
