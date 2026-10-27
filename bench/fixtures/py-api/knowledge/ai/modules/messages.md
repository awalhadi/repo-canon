---
module: messages
code_paths: [app/handlers/messages.py]
verified_at:
---
# messages

## Purpose
Users send each other messages (`POST /messages`, sender from `X-User`).

## Invariants
- Sender must be authenticated (`require_user`) and active (403 `user_deactivated` otherwise).
- Rate limits: per user; 429 `rate_limited` with `retry_after`, warning log `message.rate_limited` (see D-002).
