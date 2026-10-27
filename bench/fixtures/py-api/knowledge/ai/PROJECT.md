---
verified_at:
---
# py-api
Users and messages API. Python 3 standard library only — do not add packages.

## Commands
- Test: `python3 -m unittest discover -s tests`

## Boundaries
- Every handler is registered in `ROUTES` in `app/routes.py`; handlers live in `app/handlers/`, one module per resource.
