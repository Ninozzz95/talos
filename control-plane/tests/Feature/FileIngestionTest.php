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
            ->assertJsonPath('data.benchmark_scenario.expected.must_not.0', 'invent facts not present in the uploaded file');

        $scenarioPath = $response->json('data.benchmark_scenario.storage_path');
        $this->assertIsString($scenarioPath);
        Storage::disk('local')->assertExists($scenarioPath);

        $storedScenario = json_decode(Storage::disk('local')->get($scenarioPath), true);
        $this->assertSame('file_ingestion', $storedScenario['category']);
        $this->assertStringContainsString('workflow.md', $storedScenario['task']);
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
