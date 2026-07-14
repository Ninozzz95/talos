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
}
