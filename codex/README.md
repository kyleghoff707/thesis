# Codex Commands

This folder holds repo-native command docs for Codex.

These are not native slash commands. Instead, each file is a reusable workflow prompt that Codex can follow when you reference it explicitly in chat.

## How to use

Ask Codex with a prompt like:

- `Use codex/commands/analyze.md for UBER`
- `Follow codex/commands/generate-pitch-deck.md for POOL`
- `Use codex/commands/generate-full-story.md for SFM`

## Pattern

Each command file should include:

- purpose
- required inputs
- execution rules
- output expectations
- safety boundaries

## Design goals

- Keep command docs readable and version-controlled
- Mirror the intent of `.claude/skills/` where helpful
- Avoid Claude-specific slash-command assumptions
- Let Codex follow the same repo workflows with explicit file references

## Current commands

- [commands/analyze.md](./commands/analyze.md) — Run the 3-stage analysis workflow
- [commands/generate-one-pager.md](./commands/generate-one-pager.md) — Stage 1 one-pager workflow
- [commands/generate-pitch-deck.md](./commands/generate-pitch-deck.md) — Stage 2 pitch deck workflow
- [commands/generate-full-story.md](./commands/generate-full-story.md) — Stage 3 full story workflow
- [commands/_template.md](./commands/_template.md) — Template for new Codex commands
