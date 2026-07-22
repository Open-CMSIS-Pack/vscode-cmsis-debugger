# Repository Instructions

This repository uses TypeScript with strict standards. Follow these guidelines
when modifying code.

## Project Commands

Common scripts are defined in `package.json`. Notable non-obvious ones:

- Build without lint: `npm run build:no-lint`
- Run all checks helper: `npm run all` (runs install, download-tools, and test)
- Download tools: `npm run download-tools -- [--target <target>] [--no-cache]`
- Validate tools in a VSIX:
  `npm run validate-tools -- --target <target> --vsix <file.vsix>`
- Lint Markdown files: `npm run lint:md`
- Check links: `npm run check:links`
- Check copyright headers: `npm run copyright:check`
- Fix copyright headers: `npm run copyright:fix`

Note: `npm run build` already runs lint.

## Code Standards

Compiler and tooling settings are defined in `tsconfig.json` and `package.json`.
Key conventions:

- Generated code must comply with the project's ESLint and TypeScript rules
  from the start; do not rely on the linter or formatter to fix style later.
- Prefer explicit types and avoid `any` in production code.
- Comply with `noImplicitAny`, `noImplicitReturns`, `noUnusedLocals`, and
  `noUnusedParameters`.
- Respect `exactOptionalPropertyTypes`: omit optional properties instead of
  setting them to `undefined` (use `= {}` or leave out the key).
- Avoid unnecessary type assertions (`as`) and redundant runtime checks for
  properties or methods guaranteed by the type system. Use them only when
  types are genuinely uncertain, such as with external data or untyped APIs.

## Source File Headers

Every TypeScript file under `src` and `scripts` must start with this header,
with the year adjusted as needed:

```ts
/**
 * Copyright <year or year-range> Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
```

- Keep the existing project copyright/license header at the top of TypeScript
  files under `src` and `scripts`.
- For new source files under `src` or `scripts`, add the same header format used
  by nearby files.
- When editing a file, update an outdated copyright year or range. A single
  year becomes a range (for example, `2025` becomes `2025-2026`); an existing
  range extends to the current year.
- Do not remove or reformat license text unless intentionally updating headers
  repository-wide.
- If a new source file is completely AI-generated, add `// generated with AI`
  directly after the header.

## Naming Conventions

- Variables and functions: `camelCase`
- Classes, interfaces, and types: `PascalCase`
- Module-level or static readonly constants used as fixed configuration:
  `UPPER_SNAKE_CASE`
- Match file names to exported functionality where applicable.

## Architecture and Patterns

- Write testable code using dependency injection, especially for I/O and
  environment-dependent behavior.
- Keep functions small and focused.
- Avoid tightly coupled modules.
- Prefer composition over inheritance.
- Prefer code reuse and refactoring over duplication.
- Keep utility modules free of `vscode` dependencies where practical; isolate
  `vscode` access at boundaries.
- Reuse existing readers, parsers, and helpers before introducing new
  abstractions.
- Consider the larger project context before making a change. Prefer
  refactoring shared code or internal APIs over local workarounds that add
  complexity.

## Logging and Diagnostics

- Use existing logger channels instead of `console.*` for extension
  diagnostics.
- Preserve the current log-message style and include context needed for
  troubleshooting.

## Validation and Error Handling

- Validate external inputs at boundaries, especially workspace and debug
  configuration inputs.
- Do not add error handling for scenarios that cannot happen; validate only at
  system boundaries.
- Provide meaningful error and log messages that help troubleshooting.
- Preserve existing behavior unless a change is intentional, and cover
  behavior changes with tests.

## Imports

- Group imports in this order:

  1. External packages
  2. Internal modules

- Avoid unused imports.
- Use a consistent import style across the codebase.
- Keep `eslint-disable` usage minimal, narrowly scoped, and justified when the
  reason is not obvious.

## Testing

- The test framework is Jest with `ts-jest`.
- Write unit tests for all new logic.
- Keep tests isolated and deterministic.
- Use descriptive test names.
- Prefer testing behavior over implementation details.
- Extract and generalize shared test logic into helpers or factories when
  similar patterns appear across tests.
- Follow existing test patterns, including `jest.mock`, factory helpers under
  `src/__test__`, and local feature test factories.
- Use snapshots when output is structured and stable.
- Keep `any` usage in tests rare. When needed, localize it with an explicit
  lint suppression.

## Validation Checklist

Run the smallest relevant set first, then broaden validation when touching
shared code:

- TypeScript/runtime changes: `npm run build`, `npm run test`
- Documentation-only changes: `npm run lint:md`, `npm run check:links`
- Tooling/package-flow changes: `npm run download-tools -- [args]`,
  `npm run validate-tools -- [args]`
- Cross-cutting or multi-folder changes: `npm run build`, `npm run test`,
  `npm run lint`

## General Guidelines

- Do not introduce new libraries unless necessary.
- Keep changes focused on the task and avoid unrelated changes, but refactor
  internal APIs when that produces a cleaner design.
- Maintain backward compatibility of public APIs unless the requested change
  explicitly requires otherwise.
- Align with existing project structure and patterns, but flag and fix poor
  patterns rather than reproducing them.
- When unsure, prioritize correctness and type safety over consistency.
- Ensure generated code builds, type-checks, and passes tests.
- Prefer existing helpers, factories, and utilities over duplicated logic.
- When a fix touches shared or upstream code, improve the shared API rather
  than patching around it locally.

## Priorities

When guidelines conflict, apply this priority order:

1. Correctness and type safety
2. Code reuse and clean design (DRY, refactoring over duplication)
3. Consistency with existing patterns
4. Minimizing change scope

## Code Review Rules

For dependency updates, including developer and Dependabot pull requests,
check:

- Known functional issues, API changes, or other incompatibilities.
- Known security vulnerabilities, malicious code, or supply-chain attacks.
- Whether the new versions are at least three days old. Check the npm registry,
  GitHub releases, and GitHub tags, in that order.

Add the results to the review report.
