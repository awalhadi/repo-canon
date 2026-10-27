---
verified_at:
---
# Decisions
> 3–5 lines each. Newest on top.

## D-002 Rate-limit responses (2026-09-30)
- Decision: limits are per user. A refused request returns 429 `rate_limited` with `retry_after` (whole seconds until it would succeed, rounded up) in the error body, and logs a warning `<noun>.rate_limited` with `user_id`.
- Why: clients back off precisely; support can see who hit limits.
- Revisit if: limits move to the gateway.

## D-001 Users are deactivated, never deleted (2026-07-11)
- Decision: deactivation sets `active: False` and `deactivated_at`. A deactivated user gets 403 `user_deactivated` when sending a message.
- Why: messages keep their sender; GDPR erasure is a separate process.
- Revisit if: we implement erasure.
