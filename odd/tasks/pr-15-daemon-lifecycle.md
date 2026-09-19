# ODD Feature: PR-15 daemon-lifecycle (node-floor, home, log, lock, run-file)

## Plan & Tasks

- [ ] Task 1: Setup branch `f1/15-lifecycle-lock-runfile` and configure tsconfig references for `src/daemon`
- [ ] Task 2: Strict TDD 15.1/15.2: `node-floor.ts`, `home.ts`, `log.ts` + twins (`node-floor.test.ts`, `home.test.ts`, `log.test.ts`)
- [ ] Task 3: Strict TDD 15.3/15.4: `lifecycle/lock.ts` (SEAM) + twins (`lock.test.ts`, `singleton.test.ts`)
- [ ] Task 4: Strict TDD 15.5/15.6: `lifecycle/run-file.ts` + twin (`run-file.test.ts`)
- [ ] Task 5: 15.7/15.8: Focused & full test suite verify, mutant sweep, update PT-12 in `docs/02-architecture/THREAT-MODEL.md` §4
- [ ] Task 6: Judgment Day audit (two blind judges), resolutions, independent verifier, RDD review & PR delivery
