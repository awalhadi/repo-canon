---
module: money
code_paths: [src/Money.php]
verified_at:
---
# money

## Invariants
- Integer cents, immutable. `percent()` takes basis points and rounds down.
