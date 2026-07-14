<?php

declare(strict_types=1);

namespace Kadmos;

interface DagRepositoryInterface
{
    /**
     * Save the current DAG state (nodes + edges) to persistent storage.
     */
    public function save(ASTOrchestrator $orchestrator): void;

    /**
     * Load a previously saved DAG state into the orchestrator.
     * Returns true if state was found and loaded, false if no saved state exists.
     */
    public function load(ASTOrchestrator $orchestrator): bool;

    /**
     * Delete all persisted DAG state.
     */
    public function clear(): void;

    /**
     * Check if a saved state exists.
     */
    public function exists(): bool;
}
