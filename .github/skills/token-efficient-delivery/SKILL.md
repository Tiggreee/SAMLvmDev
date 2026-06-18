# token-efficient-delivery Skill

Purpose: deliver small tasks with minimal token/tool usage.

## Trigger

Use this skill when task scope is narrow and localized (single file or tiny set of files), especially docs/markdown/config updates.

## Procedure

1. Identify exact target file(s).
2. Read only required lines.
3. Apply minimal edit(s) with no unrelated refactors.
4. Validate only what is directly impacted.
5. Return concise result.

## Avoid

- Full repository audits for simple tasks.
- Running install/build/test pipelines unless explicitly required.
- Multi-step exploratory loops for straightforward edits.

## Safety

If protected surfaces are changed under Tiggreeeon mode, execute required governance validations.
