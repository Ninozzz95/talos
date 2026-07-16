<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Tests\TestCase;

final class TalosBrowserMigrationCompatibilityTest extends TestCase
{
    private const FIRST_B1_MIGRATION = '2026_07_15_000100_create_talos_browser_tasks_v1_table.php';

    /** @var list<string> */
    private const B1_MIGRATIONS = [
        '2026_07_15_000100_create_talos_browser_tasks_v1_table.php',
        '2026_07_15_000110_create_talos_browser_actions_v1_table.php',
        '2026_07_15_000120_create_talos_browser_evidence_bundles_v1_table.php',
        '2026_07_15_000130_create_talos_browser_checkpoints_v1_table.php',
        '2026_07_15_000140_create_talos_browser_session_leases_v1_table.php',
        '2026_07_15_000150_create_talos_browser_task_events_v1_table.php',
        '2026_07_15_000160_create_talos_browser_lease_commands_v1_table.php',
        '2026_07_15_000170_create_talos_browser_recovery_commands_v1_table.php',
    ];

    private string $databasePath;

    private string $originalConnection;

    protected function setUp(): void
    {
        parent::setUp();

        $this->originalConnection = DB::getDefaultConnection();
        $this->databasePath = storage_path('framework/testing/browser-migration-'.bin2hex(random_bytes(8)).'.sqlite');
        if (file_put_contents($this->databasePath, '') === false) {
            throw new RuntimeException('Unable to create isolated Browser migration database.');
        }
        config(['database.connections.browser_migration_test' => [
            'driver' => 'sqlite',
            'url' => null,
            'database' => $this->databasePath,
            'prefix' => '',
            'foreign_key_constraints' => true,
            'busy_timeout' => 5_000,
            'journal_mode' => null,
            'synchronous' => null,
        ]]);
        DB::purge('browser_migration_test');
        DB::setDefaultConnection('browser_migration_test');
        DB::connection()->statement('PRAGMA foreign_keys = ON');
    }

    protected function tearDown(): void
    {
        DB::disconnect('browser_migration_test');
        DB::setDefaultConnection($this->originalConnection);
        DB::purge('browser_migration_test');
        if (isset($this->databasePath) && is_file($this->databasePath)) {
            unlink($this->databasePath);
        }

        parent::tearDown();
    }

    public function test_exact_pre_b1_schema_upgrades_without_rewriting_legacy_rows(): void
    {
        $this->runPreB1Migrations();
        $this->seedLegacyBrowserRow();
        $before = (array) DB::table('talos_browser_sessions')->where('id', 'legacy-browser-session')->first();

        $this->runB1MigrationsUp();

        foreach ($this->b1Tables() as $table) {
            $this->assertTrue(Schema::hasTable($table), "Upgrade did not create {$table}.");
        }
        foreach ($this->supportingIndexes() as [$table, $index]) {
            $this->assertTrue(Schema::hasIndex($table, $index), "Upgrade did not create {$index}.");
        }
        $this->assertTrue(Schema::hasColumn('talos_browser_sessions', 'worker_state_version'));
        $this->assertSame($before, (array) DB::table('talos_browser_sessions')->where('id', 'legacy-browser-session')->first());
    }

    public function test_b1_migrations_roll_back_and_reapply_on_an_isolated_database(): void
    {
        $this->runPreB1Migrations();
        $this->seedLegacyBrowserRow();
        $this->runB1MigrationsUp();

        foreach (array_reverse(self::B1_MIGRATIONS) as $filename) {
            $this->migration($filename)->down();
        }

        foreach ($this->b1Tables() as $table) {
            $this->assertFalse(Schema::hasTable($table), "Rollback left {$table} behind.");
        }
        foreach ($this->supportingIndexes() as [$table, $index]) {
            $this->assertFalse(Schema::hasIndex($table, $index), "Rollback left {$index} behind.");
        }
        $this->assertTrue(Schema::hasTable('talos_browser_sessions'));
        $this->assertSame('legacy-worker-session', DB::table('talos_browser_sessions')->where('id', 'legacy-browser-session')->value('worker_session_id'));

        $this->runB1MigrationsUp();
        foreach ($this->b1Tables() as $table) {
            $this->assertTrue(Schema::hasTable($table), "Reapply did not recreate {$table}.");
        }
        foreach ($this->supportingIndexes() as [$table, $index]) {
            $this->assertTrue(Schema::hasIndex($table, $index), "Reapply did not recreate {$index}.");
        }
    }

    private function runPreB1Migrations(): void
    {
        $paths = glob(database_path('migrations/*.php'));
        if (! is_array($paths)) {
            throw new RuntimeException('Unable to enumerate migrations.');
        }
        sort($paths, SORT_STRING);

        foreach ($paths as $path) {
            if (basename($path) >= self::FIRST_B1_MIGRATION) {
                continue;
            }
            $migration = require $path;
            if (! $migration instanceof Migration) {
                throw new RuntimeException("Migration {$path} did not return a Migration instance.");
            }
            $migration->up();
        }
    }

    private function runB1MigrationsUp(): void
    {
        foreach (self::B1_MIGRATIONS as $filename) {
            $this->migration($filename)->up();
        }
    }

    private function migration(string $filename): Migration
    {
        $path = database_path('migrations/'.$filename);
        if (! is_file($path)) {
            throw new RuntimeException("Missing Browser v1 migration {$filename}.");
        }
        $migration = require $path;
        if (! $migration instanceof Migration) {
            throw new RuntimeException("Migration {$filename} did not return a Migration instance.");
        }

        return $migration;
    }

    private function seedLegacyBrowserRow(): void
    {
        $now = now();
        DB::table('users')->insert([
            'id' => 99001,
            'name' => 'Legacy Browser Owner',
            'email' => 'legacy-browser@example.test',
            'password' => 'not-used',
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        DB::table('talos_sessions')->insert([
            'id' => 'legacy-talos-session',
            'user_id' => 99001,
            'title' => 'Legacy Browser Session',
            'mode' => 'verified_execution',
            'surface' => 'chat',
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        DB::table('talos_browser_sessions')->insert([
            'id' => 'legacy-browser-session',
            'user_id' => 99001,
            'talos_session_id' => 'legacy-talos-session',
            'worker_session_id' => 'legacy-worker-session',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => json_encode(['navigation' => true], JSON_THROW_ON_ERROR),
            'policy' => json_encode([], JSON_THROW_ON_ERROR),
            'worker_state_version' => 7,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    /** @return list<string> */
    private function b1Tables(): array
    {
        return [
            'talos_browser_tasks',
            'talos_browser_actions',
            'talos_browser_evidence_bundles',
            'talos_browser_checkpoints',
            'talos_browser_session_leases',
            'talos_browser_task_events',
            'talos_browser_lease_commands',
            'talos_browser_recovery_commands',
        ];
    }

    /** @return list<array{string, string}> */
    private function supportingIndexes(): array
    {
        return [
            ['talos_sessions', 'talos_sessions_id_owner_browser_v1_unique'],
            ['talos_messages', 'talos_messages_id_session_browser_v1_unique'],
            ['talos_browser_sessions', 'talos_browser_sessions_scope_v1_unique'],
            ['talos_browser_artifacts', 'talos_browser_artifacts_owner_v1_unique'],
        ];
    }
}
