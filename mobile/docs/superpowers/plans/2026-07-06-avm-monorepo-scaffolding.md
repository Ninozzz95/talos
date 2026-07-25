# AVM Monorepo Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the AVM monorepo skeleton with a pure PHP core, a Node/Fastify validator, and a Laravel control plane.

**Architecture:** `core/` owns framework-free AVM domain logic and tests. `validator/` owns stateless JMP syntax validation in TypeScript with Fastify and Zod. `control-plane/` owns Laravel APIs, queues, persistence, and future HMI integration while consuming the core through explicit service boundaries.

**Tech Stack:** PHP 8.5.8, Composer 2.10.2, Node.js 24.18.0, npm 11.16.0, TypeScript, Fastify, Zod, Laravel 13 via local `.tools`.

## Global Constraints

- Keep `.tools/` inside `C:\Users\ninox\Desktop\AVM`.
- Keep core AVM logic independent from Laravel.
- Preserve existing docs and tests by relocating them instead of deleting them.
- Use local wrappers from `.tools/bin` for PHP, Composer, Node, npm, and Laravel.

---

### Task 1: Core Package

**Files:**
- Create: `core/composer.json`
- Create: `core/src/`
- Move: `tests/ASTOrchestratorTest.php` to `core/tests/ASTOrchestratorTest.php`

**Interfaces:**
- Produces: Composer package `avm/core` with PSR-4 namespace `AVM\\`.

- [x] Create `core/` as a PHP library using Composer.
- [x] Move the existing AST orchestrator test under `core/tests`.

### Task 2: Validator Package

**Files:**
- Create: `validator/package.json`
- Create: `validator/tsconfig.json`
- Create: `validator/package-lock.json`

**Interfaces:**
- Produces: Node project with Fastify, Zod, TypeScript, and Node type definitions.

- [x] Initialize npm package.
- [x] Install runtime and development dependencies.
- [x] Initialize TypeScript configuration.

### Task 3: Laravel Control Plane

**Files:**
- Create: `control-plane/`

**Interfaces:**
- Produces: Laravel application shell for future API, queues, persistence, and service provider integration.

- [x] Create Laravel project using local Laravel installer.
- [x] Verify Artisan boots with local PHP.

### Self-Review

- Spec coverage: all requested directories and package managers are represented.
- Placeholder scan: no open placeholders remain in the scaffolding plan.
- Type consistency: package names and directory names match the requested monorepo layout.
