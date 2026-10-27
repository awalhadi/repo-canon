---
module: users
code_paths: [app/handlers/users.py]
verified_at:
---
# users

## Purpose
Create, read and deactivate users.

## Invariants
- Users are never deleted; deactivated users keep their row (`active: False`, `deactivated_at` from `clock.iso()`).
- State changes log `user.<verb>` with `user_id`.
