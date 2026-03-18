# GitHub Copilot Instructions

This repository uses TypeScript with strict standards. Follow the guidelines below when modifying code.

## Project Commands

Use these commands when building, testing, or validating changes:

* Install dependencies: `yarn --frozen-lockfile --prefer-offline --ignore-scripts`
* Build: `yarn build`
* Watch build: `yarn watch`
* Lint: `yarn lint`
* Run all tests: `yarn test`
* Run a single test file: `yarn test src/path/to/file.test.ts`
* Run all checks: `yarn all`
* Lint md files: `yarn lint:md`
* Check links: `yarn check:links`
* Download tools: `yarn download-tools [--target <target>] [--no-cache]`
* Validate tools in a VSIX: `yarn validate-tools --target <target> --vsix <file.vsix>`

## Code Standards

* Language: TypeScript (strict mode enabled)
* Runtime module output: CommonJS (`module: commonjs`)
* Target: `ES2024`
* Tooling baseline: Node.js `^22.22.0`, Yarn `^1.22.0`
* Prefer explicit types and avoid `any`
* Ensure code passes typechecking with no errors

## Naming Conventions

* Variables and functions: `camelCase`
* Classes and types: `PascalCase`
* File names should match exported functionality where applicable

## Architecture & Patterns

* Write testable code using dependency injection
* Keep functions small and focused
* Avoid tightly coupled modules
* Prefer composition over inheritance

## Validation & Error Handling

* Validate external inputs at boundaries (especially workspace/debug configuration inputs)
* Reuse existing parser/reader patterns in the surrounding module
* Provide meaningful error and log messages that help troubleshooting

## Imports

* Group imports in this order:

  1. External packages
  2. Internal modules
* Avoid unused imports
* Use consistent import style across the codebase

## Testing

* Test framework: Jest with `ts-jest`
* Write unit tests for all new logic
* Keep tests isolated and deterministic
* Use descriptive test names
* Prefer testing behavior over implementation details
* Follow existing test patterns (`jest.mock`, factory helpers under `src/__test__`)

## General Guidelines

* Follow existing patterns in the codebase
* Maintain consistency with surrounding code
* Do not introduce new libraries unless necessary
* Keep changes minimal and focused
* If a new source file is completely AI-generated, add `// generated with AI` at the top (per contribution guide)

## Notes for Copilot

* Always align with existing project structure and patterns
* When unsure, prioritize consistency over creativity
* Ensure all generated code builds, typechecks, and passes tests
