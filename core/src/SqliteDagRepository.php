<?php

declare(strict_types=1);

namespace Kadmos;

/**
 * SQLite-backed DAG persistence using the Repository pattern.
 * Stores the full DAG state as JSON in a single table.
 */
final class SqliteDagRepository implements DagRepositoryInterface
{
    private \SQLite3 $db;

    public function __construct(string $dbPath = ':memory:')
    {
        $this->db = new \SQLite3($dbPath);
        $this->db->exec('CREATE TABLE IF NOT EXISTS dag_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            payload TEXT NOT NULL,
            saved_at TEXT NOT NULL
        )');
    }

    public function save(ASTOrchestrator $orchestrator): void
    {
        $data = $orchestrator->exportState();
        $json = json_encode($data, JSON_THROW_ON_ERROR);

        $stmt = $this->db->prepare('INSERT OR REPLACE INTO dag_state (id, payload, saved_at) VALUES (1, :payload, datetime("now"))');
        $stmt->bindValue(':payload', $json, SQLITE3_TEXT);
        $stmt->execute();
    }

    public function load(ASTOrchestrator $orchestrator): bool
    {
        $result = $this->db->querySingle('SELECT payload FROM dag_state WHERE id = 1', true);

        if (!$result || empty($result['payload'])) {
            return false;
        }

        $data = json_decode($result['payload'], true);
        if (!is_array($data)) {
            return false;
        }

        if ($orchestrator->isEmpty() && ($data['nodes'] ?? []) !== []) {
            $this->materializeTopology($orchestrator, $data);
        }

        $orchestrator->importState($data);
        return true;
    }

    public function clear(): void
    {
        $this->db->exec('DELETE FROM dag_state');
    }

    public function exists(): bool
    {
        $count = $this->db->querySingle('SELECT COUNT(*) FROM dag_state');
        return (int)$count > 0;
    }

    public function getLastSaved(): ?string
    {
        $result = $this->db->querySingle('SELECT saved_at FROM dag_state WHERE id = 1', true);
        return $result['saved_at'] ?? null;
    }

    /** @param array<string, mixed> $data */
    private function materializeTopology(ASTOrchestrator $orchestrator, array $data): void
    {
        $nodes = $data['nodes'] ?? null;
        $dependencies = $data['dependencies'] ?? null;
        if (! is_array($nodes) || ! is_array($dependencies)) {
            throw new \InvalidArgumentException('Persisted DAG topology is invalid.');
        }

        $remaining = $nodes;
        $materialized = [];
        while ($remaining !== []) {
            $progress = false;
            foreach ($remaining as $nodeId => $node) {
                $nodeDependencies = $dependencies[$nodeId] ?? null;
                if (! is_string($nodeId) || ! is_array($node) || ! is_array($nodeDependencies) || ! array_is_list($nodeDependencies)) {
                    throw new \InvalidArgumentException('Persisted DAG node topology is invalid.');
                }
                if (array_filter($nodeDependencies, static fn (mixed $dependency): bool => ! is_string($dependency) || ! isset($materialized[$dependency])) !== []) {
                    continue;
                }

                $type = $node['type'] ?? null;
                if (! is_string($type) || $type === '') {
                    throw new \InvalidArgumentException("Persisted DAG node type is invalid: {$nodeId}");
                }
                $orchestrator->addNode($nodeId, $nodeDependencies, $type);
                if (array_key_exists('payload', $node)) {
                    if (! is_array($node['payload'])) {
                        throw new \InvalidArgumentException("Persisted DAG node payload is invalid: {$nodeId}");
                    }
                    $orchestrator->setPayload($nodeId, $node['payload']);
                }
                $requirement = $node['approval_requirement'] ?? null;
                if (is_array($requirement) && is_string($requirement['capability'] ?? null)) {
                    $orchestrator->markAwaitingApproval($nodeId, $requirement['capability']);
                }

                $materialized[$nodeId] = true;
                unset($remaining[$nodeId]);
                $progress = true;
            }
            if (! $progress) {
                throw new \InvalidArgumentException('Persisted DAG topology is cyclic or incomplete.');
            }
        }
    }
}
