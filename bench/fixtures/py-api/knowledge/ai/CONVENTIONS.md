---
verified_at:
---
# Conventions

- Time comes only from `app.clock`: `clock.now()` for comparisons, `clock.iso()` for timestamps in responses (UTC, `Z`). Never `datetime.now()`, `datetime.utcnow()` or `time.time()` — tests freeze and advance the clock.
- Validate input with `app/validators.py`; add a helper there for a new kind of check.
- Errors are `ApiError(status, code, message)`, snake_case codes `<noun>_<problem>`. A conflict with the current state is 409 `<noun>_already_<state>` (e.g. `user_already_deactivated`).
- Log with `app.log`, never `print`. Every state change logs `<noun>.<past-tense verb>` with `user_id`.
