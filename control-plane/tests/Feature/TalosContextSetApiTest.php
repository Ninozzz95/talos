<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosContextSet;
use App\Models\TalosContextSource;
use App\Models\TalosFile;
use App\Models\TalosFileChunk;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosContextSetApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_context_set_can_attach_file_and_chunks(): void
    {
        $file = TalosFile::query()->create([
            'original_name' => 'brief.md',
            'mime_type' => 'text/markdown',
            'size_bytes' => 26,
            'checksum' => hash('sha256', 'summarize customer incidents'),
            'status' => 'available',
            'storage_path' => 'ingested/test/brief.md',
            'parser' => 'markdown',
            'metadata' => ['source' => 'test'],
        ]);

        $chunk = TalosFileChunk::query()->create([
            'file_id' => $file->id,
            'sequence' => 1,
            'content' => 'summarize customer incidents',
            'content_hash' => hash('sha256', 'summarize customer incidents'),
            'start_offset' => 0,
            'end_offset' => 28,
            'metadata' => ['kind' => 'body'],
        ]);

        $response = $this->postJson('/api/talos/context-sets', [
            'name' => 'Incident context',
            'file_ids' => [$file->id],
            'chunk_ids' => [$chunk->id],
            'metadata' => ['purpose' => 'chat-grounding'],
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.name', 'Incident context')
            ->assertJsonPath('data.status', 'available')
            ->assertJsonPath('data.sources.0.file_id', $file->id)
            ->assertJsonPath('data.sources.1.file_chunk_id', $chunk->id);

        $contextSetId = $response->json('data.id');
        $this->assertIsString($contextSetId);

        $this->assertDatabaseHas('talos_context_sets', [
            'id' => $contextSetId,
            'name' => 'Incident context',
        ]);
        $this->assertDatabaseHas('talos_context_sources', [
            'context_set_id' => $contextSetId,
            'file_id' => $file->id,
            'source_type' => 'uploaded_file',
        ]);
        $this->assertDatabaseHas('talos_context_sources', [
            'context_set_id' => $contextSetId,
            'file_chunk_id' => $chunk->id,
            'source_type' => 'file_chunk',
        ]);
    }

    public function test_context_sets_can_be_listed_and_shown_with_sources(): void
    {
        $file = TalosFile::query()->create([
            'original_name' => 'brief.md',
            'mime_type' => 'text/markdown',
            'size_bytes' => 26,
            'checksum' => hash('sha256', 'summarize customer incidents'),
            'status' => 'available',
            'storage_path' => 'ingested/test/brief.md',
            'parser' => 'markdown',
            'metadata' => ['source' => 'test'],
        ]);

        $chunk = TalosFileChunk::query()->create([
            'file_id' => $file->id,
            'sequence' => 1,
            'content' => 'summarize customer incidents',
            'content_hash' => hash('sha256', 'summarize customer incidents'),
            'start_offset' => 0,
            'end_offset' => 28,
            'metadata' => ['kind' => 'body'],
        ]);

        $contextSet = TalosContextSet::query()->create([
            'name' => 'Incident context',
            'status' => 'available',
            'metadata' => ['purpose' => 'chat-grounding'],
        ]);

        TalosContextSource::query()->create([
            'context_set_id' => $contextSet->id,
            'file_id' => $file->id,
            'source_type' => 'uploaded_file',
            'metadata' => ['source' => 'test'],
        ]);

        TalosContextSource::query()->create([
            'context_set_id' => $contextSet->id,
            'file_id' => $file->id,
            'file_chunk_id' => $chunk->id,
            'source_type' => 'file_chunk',
            'metadata' => ['source' => 'test'],
        ]);

        $this->getJson('/api/talos/context-sets')
            ->assertOk()
            ->assertJsonPath('data.0.id', $contextSet->id)
            ->assertJsonPath('data.0.name', 'Incident context')
            ->assertJsonPath('data.0.sources_count', 2)
            ->assertJsonMissingPath('data.0.sources');

        $this->getJson("/api/talos/context-sets/{$contextSet->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $contextSet->id)
            ->assertJsonPath('data.sources.0.source_type', 'uploaded_file')
            ->assertJsonPath('data.sources.0.file_id', $file->id)
            ->assertJsonPath('data.sources.1.source_type', 'file_chunk')
            ->assertJsonPath('data.sources.1.file_chunk_id', $chunk->id)
            ->assertJsonPath('data.sources.1.chunk.preview', 'summarize customer incidents');
    }

    public function test_context_set_rejects_unknown_file_ids(): void
    {
        $this->postJson('/api/talos/context-sets', [
            'name' => 'Broken context',
            'file_ids' => ['missing-file-id'],
        ])
            ->assertUnprocessable()
            ->assertJsonMissing(['Broken context']);
    }

    public function test_context_set_rejects_failed_files_and_their_chunks(): void
    {
        $file = TalosFile::query()->create([
            'original_name' => 'failed.md',
            'mime_type' => 'text/markdown',
            'size_bytes' => 12,
            'checksum' => hash('sha256', 'bad payload'),
            'status' => 'failed',
            'failure_reason' => 'Parser failed.',
            'storage_path' => 'ingested/test/failed.md',
            'parser' => 'markdown',
            'metadata' => ['source' => 'test'],
        ]);

        $chunk = TalosFileChunk::query()->create([
            'file_id' => $file->id,
            'sequence' => 1,
            'content' => 'bad payload',
            'content_hash' => hash('sha256', 'bad payload'),
            'start_offset' => 0,
            'end_offset' => 11,
            'metadata' => ['kind' => 'body'],
        ]);

        $this->postJson('/api/talos/context-sets', [
            'name' => 'Should not attach failed data',
            'file_ids' => [$file->id],
            'chunk_ids' => [$chunk->id],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['file_ids']);

        $this->assertDatabaseMissing('talos_context_sets', [
            'name' => 'Should not attach failed data',
        ]);
    }
}
