<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Tests\TestCase;

final class TalosToolContractMigrationTest extends TestCase
{
    private const CONTRACT_MIGRATION = '2026_08_04_000001_align_talos_tools_contract_v1.php';

    private string $databasePath;

    private string $originalConnection;

    protected function setUp(): void
    {
        parent::setUp();

        $this->originalConnection = DB::getDefaultConnection();
        $this->databasePath = storage_path('framework/testing/tool-contract-migration-'.bin2hex(random_bytes(8)).'.sqlite');
        if (file_put_contents($this->databasePath, '') === false) {
            throw new RuntimeException('Unable to create isolated Tool migration database.');
        }
        config(['database.connections.tool_contract_migration_test' => [
            'driver' => 'sqlite',
            'url' => null,
            'database' => $this->databasePath,
            'prefix' => '',
            'foreign_key_constraints' => true,
            'busy_timeout' => 5_000,
            'journal_mode' => null,
            'synchronous' => null,
        ]]);
        DB::purge('tool_contract_migration_test');
        DB::setDefaultConnection('tool_contract_migration_test');
        DB::connection()->statement('PRAGMA foreign_keys = ON');
        $this->migration('2026_07_07_000013_create_talos_connectors_table.php')->up();
        $this->migration('2026_07_07_000014_create_talos_tools_table.php')->up();
    }

    protected function tearDown(): void
    {
        DB::disconnect('tool_contract_migration_test');
        DB::setDefaultConnection($this->originalConnection);
        DB::purge('tool_contract_migration_test');
        if (isset($this->databasePath) && is_file($this->databasePath)) {
            unlink($this->databasePath);
        }

        parent::tearDown();
    }

    public function test_existing_row_backfills_as_managed_trusted_node_without_legacy_state_loss(): void
    {
        $this->seedLegacyTool();
        $before = (array) DB::table('talos_tools')->where('id', 'legacy-tool')->first();

        $this->migration(self::CONTRACT_MIGRATION)->up();
        $after = (array) DB::table('talos_tools')->where('id', 'legacy-tool')->first();

        foreach ($before as $column => $value) {
            $this->assertSame($value, $after[$column], "Legacy column {$column} changed during backfill.");
        }
        $this->assertSame(1, $after['schema_version']);
        $this->assertSame(1, $after['contract_revision']);
        $this->assertSame(['http.request'], json_decode($after['capabilities'], true, flags: JSON_THROW_ON_ERROR));
        $this->assertSame(['read', 'write', 'outbound'], json_decode($after['actions'], true, flags: JSON_THROW_ON_ERROR));
        $this->assertSame('managed_registry', $after['lifecycle_kind']);
        $this->assertSame(['trusted_node'], json_decode($after['execution_locations'], true, flags: JSON_THROW_ON_ERROR));
        $this->assertSame('registry.http_request', $after['implementation_key']);
    }

    public function test_fresh_migration_rolls_back_and_reapplies_without_touching_legacy_columns(): void
    {
        $migration = $this->migration(self::CONTRACT_MIGRATION);
        $migration->up();

        foreach ($this->contractColumns() as $column) {
            $this->assertTrue(Schema::hasColumn('talos_tools', $column));
        }

        $migration->down();
        foreach ($this->contractColumns() as $column) {
            $this->assertFalse(Schema::hasColumn('talos_tools', $column));
        }
        $this->assertTrue(Schema::hasColumn('talos_tools', 'input_schema'));

        $migration->up();
        foreach ($this->contractColumns() as $column) {
            $this->assertTrue(Schema::hasColumn('talos_tools', $column));
        }
    }

    public function test_down_refuses_to_drop_canonical_only_state(): void
    {
        $this->seedLegacyTool();
        $migration = $this->migration(self::CONTRACT_MIGRATION);
        $migration->up();
        DB::table('talos_tools')->where('id', 'legacy-tool')->update([
            'output_schema' => json_encode(['type' => 'object'], JSON_THROW_ON_ERROR),
        ]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('canonical-only');
        $migration->down();
    }

    private function seedLegacyTool(): void
    {
        $now = '2026-08-04 12:00:00';
        DB::table('talos_connectors')->insert([
            'id' => 'connector-1',
            'key' => 'core_http',
            'display_name' => 'Core HTTP',
            'description' => 'Legacy connector.',
            'is_enabled' => true,
            'health_status' => 'healthy',
            'capabilities' => json_encode(['http.request'], JSON_THROW_ON_ERROR),
            'policy' => null,
            'health_payload' => null,
            'last_checked_at' => null,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        DB::table('talos_tools')->insert([
            'id' => 'legacy-tool',
            'connector_id' => 'connector-1',
            'name' => 'HTTP_REQUEST',
            'display_name' => 'HTTP request',
            'description' => 'Legacy policy-gated request.',
            'input_schema' => json_encode(['type' => 'object'], JSON_THROW_ON_ERROR),
            'risk_level' => 'high',
            'capability' => 'http.request',
            'policy' => json_encode(['legacy' => true], JSON_THROW_ON_ERROR),
            'is_enabled' => false,
            'planning_enabled' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    private function migration(string $filename): Migration
    {
        $path = database_path('migrations/'.$filename);
        if (! is_file($path)) {
            throw new RuntimeException("Missing Tool contract migration {$filename}.");
        }
        $migration = require $path;
        if (! $migration instanceof Migration) {
            throw new RuntimeException("Migration {$filename} did not return a Migration instance.");
        }

        return $migration;
    }

    /** @return list<string> */
    private function contractColumns(): array
    {
        return [
            'schema_version',
            'contract_revision',
            'output_schema',
            'capabilities',
            'actions',
            'confirmation',
            'effects',
            'lifecycle_kind',
            'lifecycle_integrity_sha256',
            'execution_locations',
            'implementation_key',
        ];
    }
}
