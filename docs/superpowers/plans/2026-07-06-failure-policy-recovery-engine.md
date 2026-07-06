# Failure Policy Recovery Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PHP MVP state machine that blocks dependent DAG nodes after execution failure and restores them after HMI-driven recovery.

**Architecture:** Node.js remains the future stateless syntax validator; this MVP implements graph ownership and state transitions in PHP. `ASTOrchestrator` stores nodes and edges in memory, computes schedulable nodes using SUCCESS-only dependency resolution, propagates `BLOCKED_BY_DEPENDENCY`, and restores blocked nodes after a retry succeeds.

**Tech Stack:** PHP 8.3 CLI, plain PHP assertions/test runner, PSR-4-ready namespaces without external dependencies.

## Global Constraints

- `FAILED` must not destroy descendants.
- Descendants in `PENDING` or `VALIDATED` become `BLOCKED_BY_DEPENDENCY` after an ancestor fails.
- Kahn scheduling decrements dependency counts only for parent nodes in `SUCCESS`.
- Only `PENDING` and `RETRYING` nodes can be scheduled.
- `PRUNE_BRANCH`, `SKIPPED`, and full Node.js schema wiring are future-facing states, not active MVP behavior.

---

### Task 1: Failure Policy Tests

**Files:**
- Create: `tests/ASTOrchestratorTest.php`

**Interfaces:**
- Consumes: `AVM\ASTOrchestrator`, `AVM\NodeStatus`
- Produces: executable test cases for Scenario A, B, and C.

- [x] **Step 1: Write failing tests**

Tests cover linear cascade blocking, multi-parent partial recovery, and HMI unblocking after retry success.

- [x] **Step 2: Run tests to verify failure**

Run: `php tests/ASTOrchestratorTest.php`
Expected: failure because `src/NodeStatus.php` does not exist yet.

### Task 2: Core PHP State Machine

**Files:**
- Create: `src/NodeStatus.php`
- Create: `src/ASTOrchestrator.php`

**Interfaces:**
- Produces: `ASTOrchestrator::addNode`, `ASTOrchestrator::markRunning`, `ASTOrchestrator::markSuccess`, `ASTOrchestrator::markFailed`, `ASTOrchestrator::forceRetry`, `ASTOrchestrator::getExecutionQueue`, `ASTOrchestrator::getNodeStatus`

- [x] **Step 1: Implement minimal state constants**

`NodeStatus` exposes the shared MVP states as string constants.

- [x] **Step 2: Implement graph mutation and scheduling**

`ASTOrchestrator` keeps `nodes`, `dependencies`, and `children` maps in memory.

- [x] **Step 3: Implement failure propagation and recovery**

Failure walks descendants and blocks pending/validated nodes. Success walks descendants and restores blocked nodes when all direct dependencies are `SUCCESS`.

- [x] **Step 4: Run tests to verify pass**

Run: `php tests/ASTOrchestratorTest.php`
Expected: all tests pass.

### Self-Review

- Spec coverage: states, failure cascade, HMI override, recovery cascade, and scheduling restrictions are covered.
- Placeholder scan: no deferred implementation placeholders remain in the MVP plan.
- Type consistency: public method names used by tests match the implemented class interface.
