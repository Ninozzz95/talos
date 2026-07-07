<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class FileIngestionTest extends TestCase
{
    public function test_text_file_upload_is_stored_privately_and_extracted(): void
    {
        Storage::fake('local');

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
            ->assertJsonPath('data.storage_disk', 'local')
            ->assertJsonPath('data.extracted_chars', 73)
            ->assertJsonPath('data.extracted_text', "# Workflow\nCall https://api.example.com/data and summarize the response.\n");

        $path = $response->json('data.storage_path');
        $this->assertIsString($path);
        Storage::disk('local')->assertExists($path);

        $expectedHash = hash('sha256', "# Workflow\nCall https://api.example.com/data and summarize the response.\n");
        $this->assertSame($expectedHash, $response->json('data.sha256'));
        $this->assertArrayHasKey('scenario_seed', $response->json('data'));

        $response
            ->assertJsonPath('data.benchmark_scenario.category', 'file_ingestion')
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

        $scenarioPath = $response->json('data.benchmark_scenario.storage_path');
        $this->assertIsString($scenarioPath);
        Storage::disk('local')->assertExists($scenarioPath);

        $storedScenario = json_decode(Storage::disk('local')->get($scenarioPath), true);
        $this->assertSame('file_ingestion', $storedScenario['category']);
        $this->assertStringContainsString('workflow.md', $storedScenario['task']);
        $this->assertSame('YIELD_EXECUTION', $storedScenario['steps'][1]['mutations'][2]['action']);
        $this->assertSame('uploaded_file_only', $storedScenario['evidence_contract']['grounding']);
    }

    public function test_unsupported_file_type_is_rejected(): void
    {
        Storage::fake('local');

        $response = $this->postJson('/api/files/ingest', [
            'file' => UploadedFile::fake()->createWithContent('diagram.png', 'not an allowed text fixture'),
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonPath('message', 'The file field must be a file of type: txt, md, json, csv.');
    }

    public function test_files_larger_than_ten_megabytes_are_rejected(): void
    {
        Storage::fake('local');

        $response = $this->postJson('/api/files/ingest', [
            'file' => UploadedFile::fake()->create('large.txt', 10 * 1024 + 1, 'text/plain'),
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonPath('message', 'The file field must not be greater than 10240 kilobytes.');
    }
}
