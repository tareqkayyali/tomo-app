# Tomo — Lessons Log

Running log of mistakes I've been corrected on, with rules to prevent repeats.
Read this at the start of every session. Update after every user correction.

---

## L1 — Backend workaround instead of frontend root cause (2026-04-14)

**What happened:**
Mobile `ChoiceCardComponent` was sending `opt.value` as the chat message text
when users tapped a choice card option. For fork options with UUID values, this
rendered raw UUIDs like `f035053a-a2da-422f-9597-40ffccccff0d` in the user's
chat bubble and broke fork-match logic on the Python side. Instead of
identifying the mobile as the source, I added "exact value match" branches in
`multi_step.py::_match_selection` so the backend would accept the UUID.

The user called this out: *"how is sending garbage UUID text in the AI Chat
for the user is a fix?"*

**Rules violated** (all in MEMORY.md / CLAUDE.md):
1. **No Workarounds Ever** — Patched the symptom in the backend instead of
   the cause in mobile.
2. **Build for Scale, Never Short-Term** — A UUID-matcher on the server is
   non-scaling cruft; the proper contract is "mobile sends human-readable
   labels, backend matches by label."
3. **AI Chat Fixes Must Scale** — I fixed one path without auditing all
   choice-card handlers in the app.
4. **Proper Implementation** — I didn't read existing chip handlers
   (`onChipPress(chip.message)`) which already demonstrated the correct
   pattern: pass human-readable text.
5. **Plan Mode Default** — This was a multi-file change across mobile +
   Python; I should have stated the two candidate fixes (mobile vs. backend)
   and gotten approval before touching either.
6. **Sanity Check Before Deploy** — Pushed the workaround to prod without
   asking "is the frontend actually supposed to send UUIDs here?"

**Rule for next time — FRONTEND-SOURCED BUGS:**
When a backend crash or mismatch is caused by malformed data from the
frontend, the fix belongs in the frontend. Do not teach the backend to
accept bad shapes. Before adding any "if looks-like-UUID" / "normalize
input" / "handle both X and Y" branch on the server, STOP and ask:
*where did this value originate, and is that origin correct?*

**Signals that should trigger this check:**
- A backend crash caused by a value the user can't possibly have typed
  themselves (UUIDs, enum keys, database IDs, internal state tokens)
- A "match by exact string" path that feels like it's accepting wire
  format instead of human language
- An existing working path in the same component that uses a different
  field (e.g. `chip.message` vs. `opt.value`) — that's the pattern to copy

---
