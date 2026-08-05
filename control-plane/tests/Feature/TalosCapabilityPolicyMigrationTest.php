<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Tests\TestCase;

final class TalosCapabilityPolicyMigrationTest extends TestCase
{
    private const CONTRACT_MIGRATION = '2026_08_04_000002_align_talos_capability_policies_contract_v1.php';

    private string $databasePath;
    private string $originalConnection;

    protected function setUp(): void
    {
        parent::setUp();

        $this->originalConnection = DB::getDefaultConnection();
        $this->databasePath = storage_path('framework/testing/capability-policy-migration-'.bin2hex(random_bytes(8)).'.sqlite');
        if (file_put_contents($this->databasePath, '') === false) {
            throw new RuntimeException('Unable to create isolated capability policy migration database.');
        }
        config(['database.connections.capability_policy_migration_test' => [
            'driver' => 'sqlite',
            'url' => null,
            'database' => $this->databasePath,
            'prefix' => '',
            'foreign_key_constraints' => true,
            'busy_timeout' => 5_000,
            'journal_mode' => null,
            'synchronous' => null,
        ]]);
        DB::purge('capability_policy_migration_test');
        DB::setDefaultConnection('capability_policy_migration_test');
        DB::connection()->statement('PRAGMA foreign_keys = ON');
        $this->migration('0001_01_01_000000_create_users_table.php')->up();
        $this->migration('2026_07_07_000001_create_talos_sessions_table.php')->up();
        $this->migration('2026_07_30_000001_create_talos_capability_policies_table.php')->up();
    }

    protected function tearDown(): void
    {
        DB::disconnect('capability_policy_migration_test');
        DB::setDefaultConnection($this->originalConnection);
        DB::purge('capability_policy_migration_test');
        if (isset($this->databasePath) && is_file($this->databasePath)) {
            unlink($this->databasePath);
        }

        parent::tearDown();
    }

    public function test_additive_migration_preserves_every_legacy_decision_byte_for_byte(): void
    {
        $this->seedLegacyRows();
        $before = DB::table('talos_capability_policies')->orderBy('capability')->pluck('decision', 'capability')->all();

        $this->migration(self::CONTRACT_MIGRATION)->up();

        self::assertSame($before, DB::table('talos_capability_policies')->orderBy('capability')->pluck('decision', 'capability')->all());
        self::assertTrue(Schema::hasTable('talos_capability_grants'));
        self::assertTrue(Schema::hasColumn('talos_capability_policies', 'actions'));
        self::assertTrue(Schema::hasColumn('talos_capability_policies', 'legacy_decision'));
        self::assertSame(0, DB::table('talos_capability_grants')->count());
    }

    public function test_empty_additive_schema_rolls_back_and_reapplies(): void
    {
        $migration = $this->migration(self::CONTRACT_MIGRATION);
        $migration->up();
        $migration->down();

        self::assertFalse(Schema::hasTable('talos_capability_grants'));
        self::assertFalse(Schema::hasColumn('talos_capability_policies', 'actions'));
        self::assertTrue(Schema::hasColumn('talos_capability_policies', 'decision'));

        $migration->up();
        self::assertTrue(Schema::hasTable('talos_capability_grants'));
    }

    public function test_down_refuses_to_delete_canonical_grant_history(): void
    {
        $migration = $this->migration(self::CONTRACT_MIGRATION);
        $migration->up();
        $this->seedLegacyRows();
        DB::table('talos_capability_grants')->insert([
            'id' => 'grant-history',
            'policy_set_id' => 'user-1',
            'capability' => 'web.search',
            'actions' => json_encode(['read', 'outbound'], JSON_THROW_ON_ERROR),
            'scope' => 'account',
            'status' => 'revoked',
            'granted_at' => '2026-08-05 12:00:00',
            'risk_acknowledged' => true,
            'created_at' => '2026-08-05 12:00:00',
            'updated_at' => '2026-08-05 12:00:00',
        ]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('grant history');
        $migration->down();
    }

    private function seedLegacyRows(): void
    {
        DB::table('users')->insert([
            'id' => 1,
            'name' => 'Migration owner',
            'email' => 'migration@example.test',
            'password' => 'not-used',
            'created_at' => '2026-08-05 12:00:00',
            'updated_at' => '2026-08-05 12:00:00',
        ]);
        DB::table('talos_sessions')->insert([
            'id' => 'session-legacy',
            'user_id' => 1,
            'title' => 'Legacy session',
            'mode' => 'verified_execution',
            'created_at' => '2026-08-05 12:00:00',
            'updated_at' => '2026-08-05 12:00:00',
        ]);
        DB::table('talos_capability_policy_sets')->insert([
            'id' => 'user-1',
            'user_id' => 1,
            'schema_version' => 1,
            'revision' => 4,
            'created_at' => '2026-08-05 12:00:00',
            'updated_at' => '2026-08-05 12:00:00',
        ]);
        foreach ([
            ['deny', null, null],
            ['ask', null, null],
            ['allow_for_session', 'session-legacy', '2026-08-05 20:00:00'],
            ['allow_until_revoked', null, null],
        ] as $index => [$decision, $sessionId, $expiresAt]) {
            DB::table('talos_capability_policies')->insert([
                'id' => 'legacy-policy-'.$index,
                'policy_set_id' => 'user-1',
                'capability' => ['web.search', 'web.fetch', 'files.write', 'browser.read'][$index],
                'decision' => $decision,
                'talos_session_id' => $sessionId,
                'expires_at' => $expiresAt,
                'created_at' => '2026-08-05 12:00:00',
                'updated_at' => '2026-08-05 12:00:00',
            ]);
        }
    }

    private function migration(string $filename): Migration
    {
        $path = database_path('migrations/'.$filename);
        if (! is_file($path)) {
            throw new RuntimeException("Missing capability policy migration {$filename}.");
        }
        $migration = require $path;
        if (! $migration instanceof Migration) {
            throw new RuntimeException("Migration {$filename} did not return a Migration instance.");
        }

        return $migration;
    }
}
