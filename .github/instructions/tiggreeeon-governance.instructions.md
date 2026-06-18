# Tiggreeeon Governance Instructions

Activation:
- Enforce Tiggreeeon mode only when user explicitly writes `tiggreeeon`.

Governance:
- Execute only milestone-critical work.
- Defer non-critical scope.
- Never provision before payment confirmation.
- Require reconciliation before marking sale as closed.
- Escalate only for legal/compliance, fraud, or policy exceptions.

Evidence and gates:
- Generate the go/no-go report at `ops/runtime/production-go-no-go-report.md` (not versioned; published as a CI artifact).
- Run mandatory validations on protected-surface changes:
  1. `npm run test:smoke`
  2. `npm run build:server`
  3. `npm run prod:gate`
- Do not recommend release if any required validation fails.

Copilot YAML policy:
- Maintain watch-only constraints for agent YAML files.
- Forbidden capabilities:
  - `file_editing`
  - `code_generation`
  - `pull_request_creation`
- Validate with `npm run check:copilot:agents` when applicable.
