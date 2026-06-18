# Token Efficiency Instructions

Goal: minimize token and tool usage while preserving correctness.

## Fast Path (Simple Requests)

Apply fast path when the user asks for a small, localized change (for example: one markdown file, one config key, one function edit).

Rules:
- Do not perform full-repo scans.
- Read only the target file(s) needed for the change.
- Prefer a single edit operation when possible.
- Avoid dependency installs, builds, and full test runs unless the user asks or the edit touches protected runtime surfaces.
- Keep responses short and action-focused.

## Standard Path (Complex/Protected)

Use broader validation only when:
- Changes affect protected surfaces (runtime, backend, auth, checkout, launch gate, production-readiness), or
- User explicitly requests deep audit, full validation, or release readiness.

## Guardrail Compatibility

These efficiency rules do not override governance requirements.
When Tiggreeeon mode is explicitly active and protected surfaces are touched, follow mandatory validations.
