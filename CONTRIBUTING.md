# Contributing to Thesis

Thanks for considering a contribution. Thesis is an early-stage open-source project; bug reports, documentation improvements, and well-scoped feature ideas are all welcome.

## Before you start

- For bugs, questions, or feature ideas, **open an issue first**. We use issue templates — pick the one that fits and fill it out.
- For substantial changes, please open an issue to discuss the approach before writing code. This avoids wasted effort if the scope or direction needs adjusting.

## Pull requests

Standard GitHub flow: fork → branch → commit → PR. A good PR:

- References an existing issue (`Fixes #123`) when fixing a bug or implementing a discussed feature.
- Passes `npm run build` and `npm test` locally before submission.
- Passes `npx eslint .` — we follow whatever the project's eslint config enforces; no custom rules.
- Touches only what's needed for the change. Avoid drive-by reformatting in unrelated files.
- Includes a brief description of the change and why it's needed (use the PR template).

## Agent prompts (special policy)

The files under `agents/` are AI agent system prompts. They are dense, domain-specific, and small wording changes can subtly degrade output quality in non-obvious ways.

**Pull requests that modify any file under `agents/` will be closed without merge.** Open an issue instead — describe the change you'd like and why. The maintainer will discuss and, if aligned, make the edit themselves.

This policy may relax over time as the project matures and prompt-quality tooling improves.

## Code style

- 2-space indentation, single quotes, semicolons, trailing commas.
- Components: PascalCase `.jsx`, default export.
- Hooks: `use` prefix, return `{ data, loading, error }` shape.
- Engines: camelCase `.js`, named exports.
- Run `npx eslint .` before committing.

## Be civil

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). Disagreements happen; harassment, ad hominem attacks, and bad-faith engagement do not. Report problems to kyle@thes1sinvesting.com.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
