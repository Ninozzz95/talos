<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Tests\TestCase;

final class TalosFileIngestionMigrationCompatibilityTest extends TestCase
{
    private const MIGRATION = '2026_07_17_000003_add_security_pipeline_to_talos_files_table.php';

    private string $databasePath;

    private string $originalConnection;

    protected function setUp(): void
    {
        parent::setUp();
        $this->originalConnection = DB::getDefaultConnection();
        $this->databasePath = storage_path('framework/testing/file-ingestion-migration-'.bin2hex(random_bytes(8)).'.sqlite');
        if (file_put_contents($this->databasePath, '') === false) {
            throw new RuntimeException('Unable to create isolated file-ingestion migration database.');
        }
        config(['database.connections.file_ingestion_migration_test' => [
            'driver' => 'sqlite',
            'url' => null,
            'database' => $this->databasePath,
            'prefix' => '',
            'foreign_key_constraints' => true,
            'busy_timeout' => 5_000,
            'journal_mode' => null,
            'synchronous' => null,
        ]]);
        DB::purge('file_ingestion_migration_test');
        DB::setDefaultConnection('file_ingestion_migration_test');

        Schema::create('talos_files', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('original_name');
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('size_bytes');
            $table->string('checksum', 64);
            $table->string('status')->default('uploaded');
            $table->string('storage_disk')->default('local');
            $table->string('storage_path', 2048);
            $table->string('parser')->nullable();
            $table->text('failure_reason')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });
        $this->seedLegacyRows();
    }

    protected function tearDown(): void
    {
        DB::disconnect('file_ingestion_migration_test');
        DB::setDefaultConnection($this->originalConnection);
        DB::purge('file_ingestion_migration_test');
        if (isset($this->databasePath) && is_file($this->databasePath)) {
            unlink($this->databasePath);
        }

        parent::tearDown();
    }

    public function test_pre_security_pipeline_rows_receive_truthful_legacy_states_and_migration_reapplies(): void
    {
        $migration = $this->migration();
        $migration->up();

        $available = (array) DB::table('talos_files')->where('id', 'legacy-available')->first();
        $this->assertSame('available', $available['status']);
        $this->assertSame('legacy_unverified', $available['scan_status']);
        $this->assertSame('complete', $available['extraction_status']);
        $this->assertSame('talos_legacy', $available['extractor']);
        $this->assertSame('pre-b7.3b', $available['extractor_version']);

        $failed = (array) DB::table('talos_files')->where('id', 'legacy-failed')->first();
        $this->assertSame('not_run', $failed['scan_status']);
        $this->assertSame('failed', $failed['extraction_status']);

        DB::table('talos_files')->insert($this->row('new-row', 'uploaded'));
        $this->assertSame('pending', DB::table('talos_files')->where('id', 'new-row')->value('scan_status'));
        $this->assertSame('pending', DB::table('talos_files')->where('id', 'new-row')->value('extraction_status'));

        $migration->down();
        $this->assertFalse(Schema::hasColumn('talos_files', 'scan_status'));
        $this->assertSame('available', DB::table('talos_files')->where('id', 'legacy-available')->value('status'));

        $this->migration()->up();
        $this->assertSame('legacy_unverified', DB::table('talos_files')->where('id', 'legacy-available')->value('scan_status'));
    }

    private function seedLegacyRows(): void
    {
        DB::table('talos_files')->insert([
            $this->row('legacy-available', 'available'),
            $this->row('legacy-failed', 'failed'),
        ]);
    }

    /** @return array<string, mixed> */
    private function row(string $id, string $status): array
    {
        return [
            'id' => $id,
            'original_name' => $id.'.txt',
            'mime_type' => 'text/plain',
            'size_bytes' => 6,
            'checksum' => hash('sha256', $id),
            'status' => $status,
            'storage_disk' => 'local',
            'storage_path' => 'ingested/'.$id.'.txt',
            'parser' => 'plain_text',
            'failure_reason' => $status === 'failed' ? 'legacy failure' : null,
            'metadata' => '{}',
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }

    private function migration(): Migration
    {
        $migration = require database_path('migrations/'.self::MIGRATION);
        if (! $migration instanceof Migration) {
            throw new RuntimeException('File-ingestion security migration did not return a Migration instance.');
        }

        return $migration;
    }
}
