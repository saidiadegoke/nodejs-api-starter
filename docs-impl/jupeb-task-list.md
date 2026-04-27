# JUPEB product & design task list

Backlog items called out in design docs (005 registration, 006 finance, `jupeb-api-design`) versus what was built or tested. Use this as the working task list for product and engineering alignment.

---

## Product & design intent (called out in docs, not built)

### Registration approval events (005)

Design asks for notifications + webhooks on approve. There is no WebhookService / notification emit in the registration approve path (grep shows nothing under `jupeb/` for this).

### Claim code TTL (005)

“Time-bound token / configurable TTL” is not enforced; codes stay valid until claimed (only status + `user_id` guard concurrency).

### Institution ↔ university scoping (`jupeb-api-design` + 005 matrix)

There is no institution-scope middleware or users ↔ `university_id` binding. Institution roles can hit any `university_id` in bodies if they know UUIDs—policy is RBAC-only, not data scoping.

### Dedicated student role (005)

Flow is “any authenticated user” for student routes; student role is not required or specially seeded for JUPEB.

### Finance ↔ payments webhook → registration projection (006)

Design wants payment webhooks to drive a registration-level projection (`unpaid` / `pending` / `paid` / `payment_failed`). There is no column on `jupeb_registrations` and no listener in the payments webhook path—projection exists only when reading (mapper on payment rows / summaries).

### Session fee rules (006)

“Verify amount and currency match configured session fee rules” and “fee type” multi-intent rules are not implemented; checkout only checks positive amount, open session, and one pending intent per registration.

### Finance “partial” reporting (006)

Session report is simplified (counts + totals); partial payment semantics are not modeled.

---

## Tests & quality (design test plans, partially done)

### Concurrency (005)

Two parallel claim attempts (005) not covered by automated tests.

### RBAC negatives

Examples: non–institution user cannot approve, institution cannot finalize—not fully covered (often only admin path in integration tests).

### Finance

Webhook-driven “registration marked paid” tests missing (no hook).

### Events

Event tests for approval missing.
