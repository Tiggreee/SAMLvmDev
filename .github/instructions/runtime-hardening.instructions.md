# Runtime Hardening Instructions

Apply hardening and validation rigor on protected surfaces:
- runtime
- backend
- billing/facturacion
- auth
- checkout
- launch gate
- production-readiness

Operational requirements:
- Use minimal, auditable, non-interactive bash commands.
- Preserve existing verified behavior.
- Avoid speculative refactors.
- Do not convert failing gates to passing by bypass.

Required validations after relevant changes:
1. `npm run test:smoke`
2. `npm run build:server`
3. `npm run prod:gate`
