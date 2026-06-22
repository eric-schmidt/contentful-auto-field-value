# Code Review & Action Plan: `src/locations/`

## Context

Scope is limited to `src/locations/` — the custom code for this Contentful app. The
`Field` location (~100 LOC) auto-populates a string field by substituting `[fieldId]`
tokens in a configured pattern with values from sibling fields, across all locales.
Tooling/config and boilerplate elsewhere in the repo are out of scope.

This review surfaced correctness bugs in the React effect/listener wiring (a real
listener leak and a multi-locale write-amplification bug), unsafe assumptions about
config, and a stale test that asserts text from the CRA template instead of anything
this component actually renders.

---

## Findings

### A. Correctness bugs in `src/locations/Field.tsx`

1. **Listener leak — no cleanup of `onValueChanged`** (line 55).
   `sdk.entry.fields[...].onValueChanged(locale, cb)` returns an unsubscribe function.
   It's never captured or called on unmount. Today the effect runs once with deps
   `[]`, so the leak is bounded to one set of listeners per mount; but any future
   change that allows the effect to re-run will stack listeners and re-write the
   target N times per source change.

2. **Target field is re-set for *every* locale on any single change** (lines 59-66).
   When one source field changes in one locale, the inner `availableLocales.forEach`
   re-`setValue`s the target across all locales. That fires spurious change
   notifications for unrelated locales and dirties them in the editor. Should set
   only the locale that actually changed (the outer `forEach`'s `locale`), keeping
   the `field.locales.includes` guard.

3. **`replacementMap` initialized in render body** (lines 26-30).
   It's reallocated on every render, but listeners registered in the first effect
   close over the *first* render's object. Works today by coincidence — one stray
   refactor away from a stale-data bug. Move into a `useRef` so listeners always
   read the live map; populate it inside the effect.

4. **`replacementPattern` assumed defined** (line 22).
   `.match` throws if the instance parameter is missing or non-string. App should
   render a friendly `Note` (`@contentful/f36-components`) explaining that
   `replacementPattern` must be configured.

5. **`sdk.entry.fields[fieldId]` assumed to exist** (lines 42, 60).
   If the configured pattern references a field ID that isn't on the content type,
   `.locales` throws. Validate tokens up front and skip + warn on unknown ones
   rather than crashing the editor.

6. **`String(mapObj[matched])`** (line 80) renders the literal strings `"null"` /
   `"undefined"` when a source field has no value. Should fall back to `""`.

7. **Regex escaping is partial and buggy** (lines 75-77).
   Only `[` and `]` are escaped, and `replace("[", ...)` replaces only the *first*
   `[`. In practice tokens have exactly one of each so this works, but it's fragile.
   Use a real regex-escape (`/[.*+?^${}()|[\]\\]/g`) or build the alternation from
   pre-escaped tokens.

8. **Local helper named `replaceAll`** shadows the built-in
   `String.prototype.replaceAll` — confusing on read. Rename to e.g.
   `applyTokenReplacements`.

### B. React / Hooks hygiene

- `useEffect(..., [])` with `eslint-disable-line react-hooks/exhaustive-deps` (line 91)
  is the symptom of (3): logic and data live in the render body, the effect lies about
  what it depends on. Fix flows from (3) — once `replacementMap` is in a ref and the
  helpers are defined inside the effect (or wrapped in `useCallback`), the
  exhaustive-deps disable can come out.
- The autoresizer effect's `[sdk.window]` dep (line 86) is harmless but misleading —
  it's an init-only call; `[]` is more honest.

### C. Stale / broken test in `src/locations/Field.spec.tsx`

- Asserts the literal text `"Hello Entry Field Component (AppId: test-app)"` which
  appears nowhere in `Field.tsx`. It's leftover boilerplate from the
  `create-contentful-app` template and fails on any `npm test` run.
- The shared `mockSdk` in `test/mocks/` only stubs `sdk.app` / `sdk.ids`, while
  `Field` consumes `sdk.parameters.instance`, `sdk.locales`, `sdk.entry.fields`,
  `sdk.field`, and `sdk.window`. Since `test/mocks/` is out of scope, the practical
  fix is to declare the SDK shape this component needs **inline in the spec file**
  (extending or overriding the imported mock with `vi.mock` or a local object) and
  write at least one assertion that exercises a real code path — e.g. that the
  `SingleLineEditor` renders disabled, or that changing a source field via the
  mocked `onValueChanged` callback flows through `setValue` with the substituted
  string.

---

## Prioritized Next Steps

### P1 — Correctness (do first)

1. **Rewire effect & listeners in `Field.tsx`**
   - Move `replacementMap` into a `useRef`; initialize and populate it inside the
     effect.
   - Move `tokens`, `updateReplacementMap`, `updateFieldValues`, and
     `applyTokenReplacements` (renamed from `replaceAll`) inside the effect (or
     wrap in `useCallback`) so deps are honest.
   - Capture each unsubscribe returned by `onValueChanged`; the effect's cleanup
     calls all of them.
   - In the change callback, `setValue` only for the locale that changed — drop the
     inner `availableLocales.forEach`. Keep the `field.locales.includes` guard.

2. **Defensive guards in `Field.tsx`**
   - Missing `replacementPattern` → render a `Note` explaining the misconfiguration
     instead of throwing.
   - Token referencing a non-existent field ID → skip with `console.warn`.
   - In `applyTokenReplacements`, treat `null` / `undefined` source values as `""`
     rather than `"null"` / `"undefined"`.

3. **Repair `Field.spec.tsx`**
   - Replace the stale text assertion with a real one: render `Field` with an
     inline-overridden `useSDK` mock that supplies the fields above, then assert
     that the disabled `SingleLineEditor` renders and (ideally) that triggering a
     stored `onValueChanged` callback causes `sdk.entry.fields[targetId].setValue`
     to be called with the expected substituted string for the changed locale only.

### P2 — Polish (within `Field.tsx`)

4. **Rename `replaceAll` → `applyTokenReplacements`** to stop shadowing the
   built-in.
5. **Use a real regex-escape util** when building the alternation regex; this also
   future-proofs against unusual field IDs.
6. **Tighten autoresizer effect deps** to `[]` (init-only).

---

## Critical files

- `src/locations/Field.tsx` — all logic fixes (P1.1, P1.2, P2).
- `src/locations/Field.spec.tsx` — test repair (P1.3).

(Out of scope, per user: `package.json`, `tsconfig.json`, repo root, `test/mocks/`,
`README.md`, `src/components/`, `src/App.tsx`, `src/index.tsx`.)

## Verification

- `npm run test:ci` passes, with the rewritten `Field.spec.tsx` exercising at least
  one token-replacement path through `Field.tsx`.
- Manual smoke test in a Contentful space: configure `replacementPattern` with two
  tokens on a multi-locale content type; edit one source field in one locale and
  confirm only *that* locale's target field updates (not all locales). Then
  configure with no `replacementPattern` and confirm a friendly `Note` renders
  rather than a crash. Then configure with a token referencing a nonexistent field
  and confirm the editor still loads and warns rather than throwing. Navigate away
  from the entry and confirm no leaked-listener warnings in the console.
