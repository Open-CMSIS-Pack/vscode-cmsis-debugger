# GitHub Copilot Instructions

This repository uses TypeScript with strict standards. Follow the guidelines below when modifying code.

## Project Commands

Common scripts are defined in `package.json`. Notable non-obvious ones:

* Build without lint: `npm run build:no-lint`
* Run all checks helper: `npm run all` (runs install, download-tools, and test)
* Download tools: `npm run download-tools -- [--target <target>] [--no-cache]`
* Validate tools in a VSIX: `npm run validate-tools -- --target <target> --vsix <file.vsix>`
* Lint md files: `npm run lint:md`
* Check links: `npm run check:links`
* Check copyright headers: `npm run copyright:check`
* Fix copyright headers: `npm run copyright:fix`

Note: `npm run build` already runs lint.

## Code Standards

Compiler and tooling settings are defined in `tsconfig.json` and `package.json`. Key conventions to follow:

* Prefer explicit types and avoid `any` in production code
* Keep compliance with `noImplicitAny`, `noImplicitReturns`, `noUnusedLocals`, and `noUnusedParameters`
* Respect `exactOptionalPropertyTypes`

## Source File Header

* Keep the existing project copyright/license header at the top of TypeScript files under `src` and `scripts`.
* For new source files under `src` or `scripts`, add the same copyright/license header format used by nearby files.
* When editing a file, update the copyright header year or year range if it is outdated.
* Do not remove or reformat license text unless intentionally updating headers repository-wide.
* If a new source file is completely AI-generated, add `// generated with AI` directly after the header.

## Naming Conventions

* Variables and functions: `camelCase`
* Classes, interfaces, and types: `PascalCase`
* Constants: `UPPER_SNAKE_CASE` for stable constants
* File names should match exported functionality where applicable

## Architecture & Patterns

* Write testable code using dependency injection (especially for I/O and environment-dependent behavior)
* Keep functions small and focused
* Avoid tightly coupled modules
* Prefer composition over inheritance
* Prefer code reuse and refactoring over code duplication
* Keep utility modules free of `vscode` dependencies where practical; isolate `vscode` access at boundaries
* Reuse existing readers/parsers/helpers before introducing new abstractions
* Always consider the larger project context before making a change; prefer refactoring shared code or internal APIs over introducing local workarounds that add complexity

## Logging & Diagnostics

* Use existing logger channels instead of `console.*` for extension diagnostics.
* Preserve current log message style and include context needed for troubleshooting.

## Validation & Error Handling

* Validate external inputs at boundaries (especially workspace/debug configuration inputs)
* Provide meaningful error and log messages that help troubleshooting
* Preserve existing behavior unless a change is intentional; cover behavior changes with tests

## Imports

* Group imports in this order:

  1. External packages
  2. Internal modules
* Avoid unused imports
* Use consistent import style across the codebase
* Follow lint-enforced style: 4-space indentation, single quotes, semicolons
* Keep `eslint-disable` usage minimal, narrowly scoped, and justified when non-obvious

## Testing

* Test framework: Jest with `ts-jest`
* Write unit tests for all new logic
* Keep tests isolated and deterministic
* Use descriptive test names
* Prefer testing behavior over implementation details
* Extract and generalize shared test logic into helpers or factories when similar patterns appear across tests
* Follow existing test patterns (`jest.mock`, factory helpers under `src/__test__`, and local feature test factories)
* Use snapshots when output is structured and stable
* Keep `any` usage in tests rare; when needed, localize it with explicit lint suppression

## Validation Checklist

Run the smallest relevant set first, then broaden when touching shared code:

* TypeScript/runtime code changes: `npm run build`, `npm run test`
* Documentation-only changes: `npm run lint:md`, `npm run check:links`
* Tooling/package flow changes: `npm run download-tools -- [args]`, `npm run validate-tools -- [args]`
* Cross-cutting or multi-folder changes: `npm run build`, `npm run test`, `npm run lint`

## General Guidelines

* Follow existing patterns in the codebase
* Maintain consistency with surrounding code
* Do not introduce new libraries unless necessary
* Keep changes focused on the task; avoid unrelated changes, but do not shy away from refactoring internal APIs when it leads to a cleaner design
* Maintain backward compatibility of public APIs unless the change intent explicitly requires it

## Priorities

When guidelines conflict, apply this priority order:

1. Correctness and type safety
2. Code reuse and clean design (DRY, refactoring over duplication)
3. Consistency with existing patterns
4. Minimizing change scope

## Notes for Copilot

* Align with existing project structure and patterns, but flag and fix poor patterns rather than reproducing them
* Ensure all generated code builds, typechecks, and passes tests
* Prefer existing helpers/factories/utilities over duplicating logic
