# Regression Prevention Protocol

**Status: MANDATORY. Applies to every code task in this repo, with no exceptions.**

This file exists because of one recurring failure: *fixing bug A breaks working feature B.*
Follow the phases below in order. Do not skip a phase because a change "looks small" —
small changes are where this failure mode lives.

---

## Why this protocol exists (the evidence)

This is not a style preference. It is the documented failure mode of exactly this activity:

- **14.8%–24.4% of bug fixes are themselves incorrect.** A study of Linux, OpenSolaris,
  FreeBSD and a 12-year-old commercial OS found roughly one in five to one in seven
  post-release fixes introduced new defects that reached end users.
  → Yin, Yuan, Zhou, Pasupathy & Bairavasundaram, *"How Do Fixes Become Bugs?"*, ESEC/FSE 2011.
- **27% of those incorrect fixes were made by developers who had never touched the files
  they were editing.** Lack of familiarity with the surrounding code is the single
  strongest predictor of a fix that breaks something. *(same paper)* — This is the default
  state of an AI agent on every task, which is why Phase 1 and Phase 2 are non-negotiable.
- **AI coding agents regress code at a measurable rate.** A baseline agent on SWE-bench
  Verified broke 562 previously-passing tests across 100 fixes — an average of **6.5 broken
  tests per patch**, with one patch breaking all 322 passing tests in its repo. Adding an
  explicit *impact-analysis-then-test* step cut the regression rate from 6.08% to 1.82%.
  → Alonso, *"TDAD: Test-Driven Agentic Development — Reducing Code Regressions in AI Coding
  Agents via Graph-Based Impact Analysis"*, arXiv:2603.17973 [cs.SE], 2026.
- **Small changes are not safe changes.** Defects correlate with conceptual complexity and
  with the author's understanding, not with diff size.
  → Purushothaman & Perry, *"Toward Understanding the Rhetoric of Small Source Code Changes"*,
  IEEE Transactions on Software Engineering 31(6):511–526, 2005.
- **Regression test selection works by tracing change impact**, not by intuition: determine
  which tests exercise the changed *or transitively affected* code paths.
  → Yoo & Harman, *"Regression testing minimization, selection and prioritization: a survey"*,
  Software Testing, Verification & Reliability 22(2):67–120, 2012.
- **"Looks done" is not a signal; evidence is.** Anthropic's own guidance: *"Claude stops when
  the work looks done. Without a check it can run, 'looks done' is the only signal available."*
  and *"Have Claude show evidence rather than asserting success."* The named failure pattern is
  **the trust-then-verify gap** — *"If you can't verify it, don't ship it."*
  → [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices), Anthropic.

---

## Phase 0 — Capture the baseline BEFORE touching anything

**This repo does not have a green build.** Both typecheckers fail on `main` right now. That
means *"I ran tsc and saw errors"* and *"I ran tsc and it exited non-zero"* tell you nothing.
The only valid signal is a **diff against the baseline you captured before you edited.**

Known-good baseline (verified 2026-09-21 on `main`):

| Check | Command | Baseline result |
|---|---|---|
| Backend tests | `cd backend && npx jest --silent` | **114 passed, 1 failed, 115 total** (the 1 failure is `app.controller.spec.ts`, a pre-existing Nest DI issue in the default scaffold) |
| Backend types | `cd backend && npx tsc -p tsconfig.check.json --noEmit` | **27 errors** (dispatch.service.ts, hr.controller.ts, remittance.service.ts, …) |
| Frontend types | `cd frontend && npx tsc --noEmit` | **5 errors** (accounts, dashboard, orders/edit, rate-calculator, next.config.ts) |
| Frontend guards | `cd frontend && npm run test:guards` | **exit 0, clean** — this one IS a pass/fail signal |

Run the checks relevant to the layer you are about to touch and **write the numbers down**
before the first edit. If your numbers differ from the table above, the baseline has moved —
record *your* numbers and say so in the final report.

> If a baseline check takes too long to run, say so and pick a narrower one
> (`npx jest src/orders` rather than the whole suite). Do not silently skip it.

---

## Phase 1 — Locate the real code from the stated symptom

Go from the user's symptom to the authoritative code. Do not guess file locations.

1. **Extract literal strings from the symptom.** A user-visible label, error message, button
   text, or column heading is the fastest true anchor. Grep for it.
2. **Trace the layer chain, in this order**, and read each link before following it:
   `frontend/app/**/page.tsx` → `frontend/lib/apiFetch.ts` call → backend controller route →
   service method → Prisma query → schema field.
3. **Read the whole function you intend to change**, plus its callers. Not an excerpt.
   Per Yin et al., editing code you have not read is the #1 correlate of a broken fix.
4. **Confirm the diagnosis before fixing it.** State the root cause in one sentence and point
   at the specific line. If you cannot, you have not found it yet — keep looking, do not
   start editing hopefully.
5. **Check whether it is already known.** Search `CLAUDE.md`, `.claude/rules/team-history.md`,
   and `git log --oneline -20 -- <file>` before concluding anything is new. This repo has
   repeat bugs; §29 of `CLAUDE.md` documents one that shipped twice.

**Scope the search.** Do not read the whole repo. Narrow investigations, or delegate them to a
subagent so exploration does not crowd out the actual work.

---

## Phase 2 — Map the blast radius BEFORE editing

This is the step whose absence causes the problem the user is complaining about. For every
symbol, file, column, or endpoint you are about to change, enumerate who depends on it.

Run these and actually read the results:

```bash
# Who imports this file / calls this function?
grep -rn "functionName" backend/src frontend/app frontend/lib frontend/components

# Who calls this API route? (check BOTH layers — the route string is the contract)
grep -rn "'/route-path" frontend/

# Who reads this Prisma field/model?
grep -rn "fieldName" backend/src

# What did this file look like, and why? Recent intent matters.
git log --oneline -10 -- path/to/file
```

Then write down, explicitly:

- **Direct consumers** — what calls this today.
- **Shared/indirect consumers** — other modules, other roles, other screens. In an ERP, a
  change to orders can surface in dispatch, accounts, production, loyalty and reports.
- **Contract surfaces** — if you change a request/response shape, a Prisma column, an enum
  value, or a status string, *both sides must change together.*
- **Multi-tenant reach** — per `.claude/rules/team-history.md`, `main` deploys to RarePrint
  production **and** every SaaS customer simultaneously. Schema/data changes must be
  backward-compatible across all of them at once.

**Hard rule:** if a change has more than ~3 consumers you have not read, stop and read them
before editing. If it has many, say so and ask whether to proceed.

---

## Phase 3 — Make the smallest correct change

- Fix the **root cause**, not the symptom. Do not suppress an error, widen a type to `any`,
  or add a special case to mask the real defect.
- Change only what the fix requires. No opportunistic refactoring, renaming, reformatting, or
  "while I'm here" cleanup. Those are how unrelated things break.
- **Prefer additive over replacing.** Add the new path; leave the existing behavior intact
  unless the user explicitly asked for a replacement.
- Follow the existing pattern in the file, even where a different one would be nicer.
- Financial logic (payments, invoices, commissions, dispatch charges, payroll): re-derive the
  formula from the code, state it explicitly, and check rounding. Never alter historical
  records as a side effect.
- **Watch for resolver/fallback ordering.** Before writing any function that picks "what to
  use" from several inputs, re-read `CLAUDE.md` §29. That bug shipped twice.

---

## Phase 4 — Verify: prove it, do not assert it

Two separate questions. Both must be answered. Neither is optional.

### 4a. Did the fix actually fix it?

Test the **specific behavior reported**, not just that the code compiles. Compilation is not
evidence. Exercise the real path: hit the endpoint, run the calculation with real numbers,
load the screen. Show the actual output.

### 4b. Did I break anything else?

- **Re-run every Phase 0 check and diff against the recorded baseline.** Same numbers = clean.
  More errors, or different errors, = you broke something. Do not rationalise a new error as
  "probably pre-existing" — compare the actual lists.
- **Run the tests covering your blast radius.** The `*.business-rules.spec.ts` files are
  deliberate regression canaries; each one opens with a comment naming the rules it protects
  and says *"If these tests fail after a code change, a core order creation rule has been
  broken."* If you touched orders, dispatch, accounts, complaints or loyalty, run the matching
  spec.
- **Re-read your own diff line by line** (`git diff`), in a fresh pass, asking only: *what
  else consumes this line?* Check specifically for: a changed function signature with an
  unupdated caller; a renamed field still referenced elsewhere; an altered enum/status string;
  a modified shared component used on other screens; an early return that makes a later branch
  unreachable.
- **Confirm the branch you changed is actually reachable** with real payloads. Syntactically
  present is not the same as live — `tsc` will never catch dead code behind an unconditional
  early return.

If verification is impossible in this environment (needs a browser, real Fship call, live
data), **say exactly that and name what is unverified.** Never describe something as tested,
working, done, or clean when it was not actually executed.

---

## Phase 5 — Report (required format)

Every task ends with this. Not optional, not abbreviated:

```
WHAT I CHANGED
  - path/to/file.ts:120-134 — <what and why, one line>

WHAT ELSE TOUCHES THIS CODE
  - <consumer> — checked, unaffected because <reason>
  - <consumer> — also updated
  (or: "no other consumers — verified via grep for <symbol>")

VERIFIED
  - <check> — <actual result vs. baseline, with numbers>
  - <behavior test> — <actual observed output>

NOT VERIFIED
  - <what could not be checked here, and what it would take>

RISK
  - <anything that could still break, or "none identified">
```

State plainly if you are unsure. An honest "I could not verify X" is worth far more than a
confident claim that turns out to be wrong — a wrong claim costs a production bug plus the
trust to believe the next report.

---

## Stop and ask instead of guessing

Per `CLAUDE.md` §24, stop and ask when:

- Two readings of the request produce materially different behavior.
- The fix requires changing a shared contract, a Prisma column, or an enum value.
- The fix touches payment history, financial calculations, or existing production data.
- The blast radius is larger than expected once mapped.
- The root cause is in code you do not understand after genuinely trying.

Asking costs one message. A production regression in an ERP costs real money and real trust.

---

## Red flags — stop if you catch yourself doing any of these

- Editing a file you have not read in full.
- "This is a tiny change, it's fine." *(Purushothaman & Perry: it is not.)*
- Fixing a symptom because the root cause looks hard.
- Reporting success after only a build or typecheck.
- Assuming a new error was pre-existing without comparing the baseline list.
- Changing a function signature without grepping its callers.
- Refactoring something unrelated while you are in the file.
- Writing "should work" instead of running it.
