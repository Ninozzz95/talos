<?php

declare(strict_types=1);

namespace Tests\Unit;

use PDO;
use PDOException;
use RuntimeException;
use Tests\TestCase;

final class TalosSqliteConcurrencyConfigurationTest extends TestCase
{
    public function test_sqlite_transactions_claim_write_intent_before_a_concurrent_cross_session_writer(): void
    {
        $databasePath = tempnam(sys_get_temp_dir(), 'talos-sqlite-concurrency-');
        if ($databasePath === false) {
            throw new RuntimeException('Unable to create the isolated SQLite concurrency database.');
        }

        $first = null;
        $second = null;
        $firstTransaction = false;
        $secondTransaction = false;

        try {
            $first = $this->connection($databasePath);
            $second = $this->connection($databasePath);
            $first->exec('PRAGMA journal_mode = WAL');
            $second->exec('PRAGMA journal_mode = WAL');
            $first->exec('CREATE TABLE cross_session_writes (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
            $first->exec("INSERT INTO cross_session_writes (id, value) VALUES (1, 'initial')");

            $mode = strtoupper((string) config('database.connections.sqlite.transaction_mode'));
            $this->assertContains($mode, ['DEFERRED', 'IMMEDIATE', 'EXCLUSIVE']);

            $first->exec("BEGIN {$mode} TRANSACTION");
            $firstTransaction = true;
            $this->assertSame(
                'initial',
                $first->query('SELECT value FROM cross_session_writes WHERE id = 1')->fetchColumn(),
            );

            try {
                $second->exec('BEGIN IMMEDIATE TRANSACTION');
                $secondTransaction = true;
            } catch (PDOException $exception) {
                $this->assertSame('HY000', (string) $exception->getCode());
                $this->assertStringContainsString('database is locked', $exception->getMessage());
            }

            $this->assertFalse(
                $secondTransaction,
                'The configured transaction allowed a concurrent writer to overtake it after its first read.',
            );
            $this->assertSame(
                1,
                $first->exec("UPDATE cross_session_writes SET value = 'committed' WHERE id = 1"),
            );
            $first->exec('COMMIT');
            $firstTransaction = false;

            $this->assertSame(
                'committed',
                $second->query('SELECT value FROM cross_session_writes WHERE id = 1')->fetchColumn(),
            );
        } finally {
            if ($second instanceof PDO && $secondTransaction) {
                $second->exec('ROLLBACK');
            }
            if ($first instanceof PDO && $firstTransaction) {
                $first->exec('ROLLBACK');
            }
            $second = null;
            $first = null;
            if (is_file($databasePath)) {
                unlink($databasePath);
            }
        }
    }

    private function connection(string $databasePath): PDO
    {
        $connection = new PDO('sqlite:'.$databasePath);
        $connection->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $connection->exec('PRAGMA busy_timeout = 0');
        $connection->exec('PRAGMA foreign_keys = ON');

        return $connection;
    }
}
