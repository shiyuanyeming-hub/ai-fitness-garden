# CLAUDE.md — notes for agents working on this repo

Personal offline-first fitness PWA (Next.js 15 App Router, React 19, Tailwind v4, Dexie/IndexedDB). UI text is Simplified Chinese.

## Rules that must not be broken
- Facts vs derived: only sessions / workoutExercises / sets / feedback / bodyWeights are facts. Never persist derived numbers (muscle loads, recovery, recommendations as truth). Everything derived goes through `computeDerived()` in `src/data/derived.ts`.
- A set counts only when `completedAt != null`. Prefilled values are not facts; never auto-complete sets or recommended exercises.
- Equipment ≠ exercise (many-to-many). Recognition returns candidates; the user must pick the exercise.
- Laterality: `side` (left/right/both) and `movementDirection` (left/right/none) are separate. Bilateral 3 sets = 3 sets at every level. Directional sets never create left/right oblique data.
- Assisted load: bigger = easier. Never treat it as external load. Never compare weights across different machines or load kinds.
- Algorithms in `src/core` are pure TS with no React imports. All coefficients live in `src/core/params.ts`, tagged [依据]/[估计]; bump `CALCULATION_VERSION` and update `docs/ALGORITHMS.md` when changing them.
- The Anthropic key is server-only (`src/server/recognition`). Never expose it or add NEXT_PUBLIC_ variants.

## Commands
- `npm test` (vitest: tests/unit), `npm run lint` (tsc), `npm run build && npm run e2e` (playwright, mock recognition, prod server on :3200).
- `RECOGNITION_PROVIDER=mock` gives a deterministic recognition result; hashes starting with `fail` simulate an upstream error.
- Use TypeScript 5.x (Next 15's config loader breaks with TS 7).

## Where things are
See docs/ARCHITECTURE.md. Seeds: `src/data/seed/{exercises,equipment}.ts` (ids are permanent). DB schema: `src/data/db.ts` (add new versions, never edit v1). Writes + validation: `src/data/repo.ts`.
