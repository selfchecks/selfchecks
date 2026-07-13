# AGENTS.md

## Purpose

This file defines how automated agents should work in this repo: keep changes minimal, follow existing patterns, and respect project conventions.

## Do / Don't

- Do keep diffs small and focused on the requested task.
- Do run the relevant lint/test commands when practical.
- Do run `yarn format:check` before every commit.
- Don't reformat unrelated code or change public APIs without explicit request.
- Don't delete local or remote files, directories, caches, artifacts, Docker data, database data, or other persisted state without explicit user approval for that specific deletion.
