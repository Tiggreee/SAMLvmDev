# prod-gate Skill

Purpose: determine go/no-go readiness with auditable evidence.

## Runbook

1. Run smoke checks:
- `npm run test:smoke`

2. Build server artifacts:
- `npm run build:server`

3. Validate Copilot agent YAML policy when present:
- `npm run check:copilot:agents`

4. Execute production gate and emit report:
- `npm run prod:gate`

## Decision Policy

- GO only if all required checks pass.
- NO-GO if any required check fails.
- Persist results in `ops/runtime/production-go-no-go-report.md`.
