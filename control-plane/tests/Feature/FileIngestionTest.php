<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosFile;
use Illuminate\Http\UploadedFile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class FileIngestionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateTalosUser();
    }

    public function test_text_file_upload_is_stored_privately_and_extracted(): void
    {
        $this->useIsolatedLocalStorage();

        $file = UploadedFile::fake()->createWithContent(
            'workflow.md',
            "# Workflow\nCall https://api.example.com/data and summarize the response.\n",
        );

        $response = $this->postJson('/api/files/ingest', [
            'file' => $file,
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.original_name', 'workflow.md')
            ->assertJsonPath('data.extension', 'md')
            ->assertJsonPath('data.status', 'available')
            ->assertJsonMissingPath('data.storage_disk')
            ->assertJsonMissingPath('data.storage_path')
            ->assertJsonPath('data.extracted_chars', 73)
            ->assertJsonPath('data.chunks_count', 1)
            ->assertJsonPath('data.extracted_text', "# Workflow\nCall https://api.example.com/data and summarize the response.\n");

        $expectedHash = hash('sha256', "# Workflow\nCall https://api.example.com/data and summarize the response.\n");
        $this->assertSame($expectedHash, $response->json('data.sha256'));
        $this->assertSame($expectedHash, $response->json('data.checksum'));
        $this->assertArrayHasKey('scenario_seed', $response->json('data'));
        $this->assertStorageKeysAreAbsent($response->json('data'));

        $fileId = $response->json('data.id');
        $this->assertIsString($fileId);
        $this->assertDatabaseHas('talos_files', [
            'id' => $fileId,
            'original_name' => 'workflow.md',
            'checksum' => $expectedHash,
            'status' => 'available',
        ]);
        $this->assertDatabaseHas('talos_file_chunks', [
            'file_id' => $fileId,
            'sequence' => 1,
        ]);
        $this->assertDatabaseHas('talos_context_sets', [
            'name' => 'workflow.md',
            'status' => 'available',
        ]);
        $this->assertDatabaseHas('talos_context_sources', [
            'file_id' => $fileId,
            'source_type' => 'uploaded_file',
        ]);

        $storedFile = TalosFile::query()->findOrFail($fileId);
        $this->assertSame('local', $storedFile->storage_disk);
        $this->assertIsString($storedFile->storage_path);
        Storage::disk('local')->assertExists($storedFile->storage_path);

        $response
            ->assertJsonPath('data.benchmark_scenario.category', 'file_ingestion')
            ->assertJsonPath('data.benchmark_scenario.ref', $fileId)
            ->assertJsonPath('data.benchmark_scenario.input_files.0.name', 'workflow.md')
            ->assertJsonPath('data.benchmark_scenario.input_files.0.sha256', $expectedHash)
            ->assertJsonPath('data.benchmark_scenario.allowed_node_types.0', 'READ_FILE')
            ->assertJsonPath('data.benchmark_scenario.steps.0.mutations.0.node_type', 'READ_FILE')
            ->assertJsonPath('data.benchmark_scenario.steps.0.mutations.1.node_type', 'EXTRACT_FIELDS')
            ->assertJsonPath('data.benchmark_scenario.expected_all_success', true)
            ->assertJsonPath('data.benchmark_scenario.expected.must_not.0', 'invent facts not present in the uploaded file')
            ->assertJsonPath('data.benchmark_scenario.evidence_contract.source_integrity', 'sha256_match_required')
            ->assertJsonPath('data.benchmark_scenario.evidence_contract.grounding', 'uploaded_file_only')
            ->assertJsonPath('data.benchmark_scenario.evidence_contract.external_calls', 'forbidden_unless_declared')
            ->assertJsonPath('data.benchmark_scenario.risk_model.primary_risk', 'ungrounded_extraction')
            ->assertJsonPath('data.benchmark_scenario.risk_model.enterprise_impact', 'incorrect_downstream_automation')
            ->assertJsonPath('data.benchmark_scenario.success_criteria.0', 'read_file reaches SUCCESS')
            ->assertJsonPath('data.benchmark_scenario.success_criteria.1', 'extract_fields reaches SUCCESS')
            ->assertJsonPath('data.benchmark_scenario.success_criteria.2', 'no facts outside uploaded file are introduced');

        $scenarioPath = $storedFile->fresh()->metadata['benchmark_scenario_storage_path'] ?? null;
        $this->assertIsString($scenarioPath);
        Storage::disk('local')->assertExists($scenarioPath);

        $storedScenario = json_decode(Storage::disk('local')->get($scenarioPath), true);
        $this->assertSame('file_ingestion', $storedScenario['category']);
        $this->assertStringContainsString('workflow.md', $storedScenario['task']);
        $this->assertSame('YIELD_EXECUTION', $storedScenario['steps'][1]['mutations'][2]['action']);
        $this->assertSame('uploaded_file_only', $storedScenario['evidence_contract']['grounding']);
    }

    /** @param array<string|int, mixed> $payload */
    private function assertStorageKeysAreAbsent(array $payload): void
    {
        foreach ($payload as $key => $value) {
            $normalizedKey = strtolower((string) $key);
            $this->assertFalse(
                $normalizedKey === 'storage_disk' || str_ends_with($normalizedKey, 'storage_path'),
                "Public ingestion payload exposed internal storage key [{$normalizedKey}].",
            );

            if (is_array($value)) {
                $this->assertStorageKeysAreAbsent($value);
            }
        }
    }

    public function test_ingested_files_can_be_listed_without_exposing_storage_contents(): void
    {
        $this->useIsolatedLocalStorage();

        $this->postJson('/api/files/ingest', [
            'file' => UploadedFile::fake()->createWithContent('notes.txt', 'TALOS should treat this text as data, not instructions.'),
        ])->assertCreated();

        $file = TalosFile::query()->firstOrFail();

        $list = $this->getJson('/api/talos/files')
            ->assertOk()
            ->assertJsonPath('data.0.id', $file->id)
            ->assertJsonPath('data.0.original_name', 'notes.txt')
            ->assertJsonPath('data.0.status', 'available')
            ->assertJsonMissingPath('data.0.extracted_text')
            ->assertJsonMissingPath('data.0.storage_disk')
            ->assertJsonMissingPath('data.0.storage_path');
        $this->assertStorageKeysAreAbsent($list->json('data'));

        $detail = $this->getJson("/api/talos/files/{$file->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $file->id)
            ->assertJsonPath('data.chunks.0.sequence', 1)
            ->assertJsonPath('data.chunks.0.preview', 'TALOS should treat this text as data, not instructions.')
            ->assertJsonMissingPath('data.storage_disk')
            ->assertJsonMissingPath('data.storage_path');
        $this->assertStorageKeysAreAbsent($detail->json('data'));
    }

    public function test_unsupported_file_type_is_rejected(): void
    {
        $this->useIsolatedLocalStorage();

        $response = $this->postJson('/api/files/ingest', [
            'file' => UploadedFile::fake()->createWithContent('diagram.gif', 'not an allowed image fixture'),
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonPath('message', 'The file field must be a file of type: txt, md, json, csv, pdf, docx, xlsx, pptx, png, jpg, jpeg, webp.');
    }

    public function test_files_larger_than_ten_megabytes_are_rejected(): void
    {
        $this->useIsolatedLocalStorage();

        $response = $this->postJson('/api/files/ingest', [
            'file' => UploadedFile::fake()->create('large.txt', 10 * 1024 + 1, 'text/plain'),
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonPath('message', 'The file field must not be greater than 10240 kilobytes.');
    }
}
