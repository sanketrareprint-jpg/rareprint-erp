# CLAUDE.md — ERP Engineering Rules

## 1. PRIMARY OBJECTIVE

You are working on a production ERP application.

Your priorities, in this exact order:

1. Correctness
2. Prevent regressions
3. Preserve existing functionality
4. Clean, maintainable code
5. Minimal unnecessary changes
6. Efficient token usage
7. Fast implementation

DO NOT optimize for speed at the cost of correctness.

DO NOT make speculative changes.

DO NOT rewrite working code unless it is genuinely necessary.

The goal is to make the required change correctly the first time and avoid creating errors that need to be fixed later.

---

# 2. PROJECT ENVIRONMENT

This project is an ERP application maintained in GitHub.

Typical infrastructure:

- Frontend: Vercel
- Backend: Railway
- Database: Railway
- Source control: GitHub

Before changing code, understand which part of the system you are modifying:

- Frontend
- Backend
- Database
- API
- Authentication/authorization
- Shared types/utilities
- Deployment/configuration

Never assume that a change is isolated if it can affect another layer.

---

# 3. BEFORE WRITING CODE — MANDATORY

Before making any code changes:

### Step 1 — Understand the request

Identify:

- What the user explicitly asked for
- What is NOT requested
- Existing behavior that must remain unchanged
- Inputs and outputs
- Database implications
- API implications
- UI implications
- Permissions/roles involved
- Edge cases

Do not add features that were not requested.

If something is ambiguous and the ambiguity could cause incorrect behavior, ask before implementing.

If the ambiguity is minor and a safe interpretation is obvious, use the simplest reasonable interpretation.

### Step 2 — Inspect existing code

Before creating a new:

- component
- module
- controller
- service
- route
- database table
- migration
- utility
- API endpoint

Search the repository first.

Reuse existing patterns whenever possible.

Do not create duplicate functionality.

### Step 3 — Understand dependencies

Before modifying existing code, check:

- Where it is used
- What imports it
- What API calls depend on it
- What database tables/columns it uses
- What frontend screens depend on it
- Whether permissions/roles affect it

Do not break existing consumers.

---

# 4. CHANGE ONLY WHAT IS NECESSARY

Follow the principle:

> Smallest correct change.

For every task:

- Modify only the files that need modification.
- Avoid unrelated refactoring.
- Avoid formatting entire files unnecessarily.
- Avoid renaming unrelated variables.
- Avoid changing architecture unless required.
- Avoid introducing new dependencies unless necessary.
- Reuse existing utilities/components/services.

Do NOT "clean up" unrelated code while implementing a feature.

If existing code works, leave it alone.

---

# 5. NEVER GUESS THE EXISTING ARCHITECTURE

Do not assume:

- file locations
- database schema
- API routes
- authentication behavior
- role permissions
- environment variables
- framework conventions
- existing helper functions

Inspect the repository and follow its actual architecture.

If the repository already has an established pattern, follow that pattern instead of inventing a new one.

---

# 6. DATABASE SAFETY

Database changes require extra caution.

Before changing the database:

1. Inspect the existing schema.
2. Check existing migrations.
3. Check whether the table/column already exists.
4. Check foreign keys and relationships.
5. Check indexes and constraints.
6. Check existing application queries.
7. Make migrations safe and repeatable where the project's migration system supports it.

Never casually:

- delete existing columns
- rename columns
- drop tables
- destroy data
- change types that may invalidate existing data

For production-sensitive changes, prefer additive migrations.

Never assume the production database is empty.

---

# 7. API SAFETY

When creating or modifying an API:

- Follow existing API conventions.
- Validate input.
- Validate required fields.
- Handle invalid input.
- Handle missing records.
- Handle authorization.
- Return consistent response formats.
- Handle database failures.
- Do not expose sensitive information.

Do not trust frontend validation alone.

Backend validation is mandatory for data that matters.

---

# 8. FRONTEND SAFETY

When modifying UI:

- Follow existing design patterns.
- Reuse existing components.
- Reuse existing form patterns.
- Reuse existing validation patterns.
- Preserve responsive behavior.
- Preserve existing permissions.
- Handle loading states.
- Handle empty states.
- Handle errors.
- Prevent duplicate submissions where appropriate.

Do not create a completely new UI pattern when an existing project pattern already exists.

---

# 9. AUTHORIZATION AND SECURITY

Never bypass existing authentication or authorization.

Before adding functionality, determine:

- Who can view it?
- Who can create it?
- Who can edit it?
- Who can delete it?
- Who can approve it?
- Who can mark something as paid/complete?

Do not assume that hiding a button is sufficient security.

Authorization must be enforced at the backend/API level where applicable.

Never expose:

- passwords
- tokens
- secrets
- private keys
- credentials
- sensitive environment variables

Never commit secrets to Git.

---

# 10. ERROR PREVENTION WORKFLOW

Before considering a task complete, perform a mental and code-level verification.

Check:

### Syntax
- No syntax errors
- Correct imports
- Correct exports
- Correct brackets
- Correct types

### Logic
- Correct calculations
- Correct conditions
- Correct edge cases
- Correct null/undefined handling
- Correct date handling
- Correct pagination/filtering if applicable

### Integration
- Frontend calls the correct API
- API calls the correct service/database
- Request and response shapes match
- Database fields match application fields

### Existing functionality
- Existing routes still work
- Existing screens still work
- Existing permissions still work
- Existing data remains compatible

### UI
- Forms submit correctly
- Validation works
- Loading states work
- Error states work
- Empty states work

### Data
- No accidental duplicate records
- No accidental data deletion
- No incorrect calculations
- No broken relationships

---

# 11. VERIFY BEFORE REPORTING SUCCESS

Never say a feature is "done", "working", "clean", or "error-free" merely because the code was written.

First verify as much as the available environment allows.

Prefer:

1. Type checking
2. Linting
3. Build
4. Relevant tests
5. Relevant database/migration checks
6. Inspection of affected API routes
7. Inspection of affected UI

If a command can be safely run in the current environment, run it.

If verification cannot be performed, explicitly state what could not be verified.

NEVER claim that something was tested when it was not tested.

---

# 12. TEST THE ACTUAL CHANGE

Do not only test that the application builds.

Test the behavior that was requested.

Example:

If implementing:

"₹50 per 1,000 units"

verify the actual calculation.

For example:

668873 → 876644

Difference:

207771

Payment:

207771 / 1000 × 50 = ₹10,388.55

Also consider:

- same reading
- lower reading
- zero production
- counter rollover/reset
- decimal payment values
- already-paid periods
- partially paid periods

Use the project's existing testing approach whenever possible.

---

# 13. MACHINE COUNTER / READING RULE

For machine-reading features:

A "reading" means the cumulative counter value displayed by the machine at the time it is recorded.

Example:

Previous reading: 668873
Latest reading: 876644

Production:

876644 - 668873 = 207771 units

If the machine counter increments by one per envelope/unit, the difference represents the number of units produced.

The software does NOT assume automatic machine connectivity unless explicitly requested.

Manual reading entry is the default.

Do not introduce USB, PLC, serial, API, IoT, or automatic machine integration unless explicitly requested.

---

# 14. PAYMENT TRACKING RULE

For operator payments:

Rate:

₹50 per 1,000 units

Formula:

production / 1000 × 50

Payment records must be associated with the relevant production/reading period.

A payment record should preserve enough information to determine:

- reading period
- production quantity
- amount
- payment date
- payment status
- description
- bill/invoice/reference number when applicable

Never silently change historical paid records when a new reading is entered.

Historical payment records should remain auditable.

---

# 15. COUNTER RESET / ROLLOVER

Machine counters may reset/roll over.

Never assume that a lower new reading automatically means negative production.

If the project has an explicit reset/rollover mechanism, use it.

Example:

Previous reading: 998000
Counter resets at: 1000000
New reading: 25000

Production should be calculated according to the project's configured rollover rule.

Do not invent rollover behavior if the machine's actual behavior is unknown.

---

# 16. CODE QUALITY

Write code that is:

- Simple
- Readable
- Explicit
- Maintainable
- Consistent with the project
- Easy to debug

Prefer simple code over clever code.

Avoid:

- unnecessary abstractions
- unnecessary helper functions
- premature optimization
- deeply nested logic
- duplicated business logic
- giant components
- giant functions
- unexplained magic numbers
- dead code
- commented-out old code
- unnecessary dependencies

Use meaningful names.

Bad:

`x`, `tmp`, `data2`, `foo`

Better:

`machineReading`, `previousReading`, `paymentAmount`

---

# 17. SINGLE SOURCE OF TRUTH

Business logic should have one authoritative implementation.

Do not duplicate important calculations across:

- frontend
- backend
- database
- multiple components
- multiple services

For example, payment calculation should not have slightly different formulas in three places.

The backend should be authoritative for important business calculations.

---

# 18. AVOID MAGIC NUMBERS

Important business constants should be clearly defined.

For example:

Do not scatter:

50
1000
1000000

throughout unrelated code.

If the project architecture supports it, define meaningful constants/configuration such as:

OPERATOR_RATE_PER_THOUSAND
MACHINE_COUNTER_RESET_VALUE

Do not over-engineer simple constants.

---

# 19. TYPES AND DATA CONTRACTS

Keep frontend/backend/database types consistent.

When changing a data structure:

Check all consumers.

Do not update only one side of an API contract.

Pay particular attention to:

- IDs
- dates
- numbers
- decimals
- nullable fields
- enum/status values

Do not accidentally convert monetary values into unsafe floating-point calculations if the existing project has a safer money/decimal approach.

Follow the project's existing approach for monetary precision.

---

# 20. NO UNNECESSARY REWRITES

Never rewrite an entire file when a small edit is sufficient.

Never replace working architecture simply because another approach looks nicer.

Do not upgrade:

- frameworks
- dependencies
- database versions
- build tools

unless the task requires it.

Do not perform unrelated refactoring during feature development.

---

# 21. GIT DISCIPLINE

Keep changes easy to review.

Before finishing:

- Inspect changed files.
- Ensure no unrelated files were modified.
- Ensure no secrets were added.
- Ensure no generated junk files were added.
- Ensure migrations are included when database changes require them.

Do not create commits unless explicitly requested.

Never force-push.

Never reset or discard user changes without explicit permission.

---

# 22. TOKEN EFFICIENCY

We use Claude heavily for coding and have usage limits.

Be extremely token-efficient.

### Before investigating

Do not read the entire repository unnecessarily.

First identify:

- relevant directories
- relevant files
- relevant symbols
- relevant database tables
- relevant API routes

Then inspect only what is necessary.

### While coding

Prefer small targeted edits.

Do not repeatedly reread unchanged files.

Do not explain obvious code.

Do not generate huge amounts of commentary.

Do not reproduce entire files in the response.

Do not output code that does not need to be shown.

### Response style

After completing work, give a concise summary:

1. What changed
2. Files changed
3. Verification performed
4. Any remaining issue/blocker

Avoid long explanations unless requested.

### IMPORTANT

Use tokens for:

- understanding the code
- preventing errors
- implementing correctly
- verifying changes

Do NOT waste tokens on:

- unnecessary explanations
- repeating the user's request
- repeating unchanged code
- speculative features
- unrelated refactoring

---

# 23. DO NOT CREATE WORK FOR YOURSELF

Do not introduce unnecessary complexity that creates future maintenance.

Before adding something, ask internally:

> "Is this required for the requested behavior?"

If no:

Do not add it.

---

# 24. WHEN SOMETHING IS UNCLEAR

Use this decision rule:

### Safe and obvious interpretation
Implement it.

### Multiple interpretations that produce materially different behavior
Ask the user before coding.

### Potentially destructive operation
Ask for confirmation.

Examples:

- deleting data
- dropping tables
- changing production data
- changing authentication behavior
- changing payment history
- changing existing business calculations

Do not guess on destructive or financially important behavior.

---

# 25. FINANCIAL DATA

This ERP contains financial information.

Treat calculations involving:

- payments
- invoices
- salaries
- operator fees
- balances
- totals
- taxes
- quantities

as high-importance business logic.

Verify formulas and rounding.

Never silently round financial amounts unless that is the established business rule.

Preserve historical financial records.

---

# 26. BACKWARD COMPATIBILITY

When adding a feature:

Prefer:

Existing behavior
+
New functionality

rather than:

Existing behavior
→ replaced with something new

Unless the user explicitly requests a replacement.

---

# 27. DO NOT INVENT REQUIREMENTS

Only implement requirements that are:

1. Explicitly stated by the user, OR
2. Strictly necessary to make the requested feature function correctly.

Do not add:

- dashboards
- notifications
- automation
- machine integrations
- extra reports
- new roles
- extra fields
- new workflows

unless requested or clearly required.

---

# 28. FINAL SELF-CHECK

Before declaring the task complete, ask internally:

- Did I understand the requirement correctly?
- Did I inspect existing code before creating new code?
- Did I follow existing project patterns?
- Did I change only what was necessary?
- Did I preserve existing functionality?
- Did I consider edge cases?
- Did I check database implications?
- Did I check API implications?
- Did I check authorization?
- Did I verify calculations?
- Did I run available checks/tests/build?
- Did I introduce any unnecessary dependency?
- Did I accidentally modify unrelated files?
- Did I create any migration that is unsafe?
- Did I leave any obvious error unresolved?
- Am I claiming verification that I did not actually perform?

If any answer is "no", fix it before reporting completion.

---

# 29. GOLDEN RULE

## Understand → Inspect → Plan → Implement → Verify → Report

Never:

## Guess → Code → Hope

The best implementation is not the largest implementation.

The best implementation is the **smallest correct, tested, maintainable change that fully satisfies the user's requirement without breaking anything that already works.**