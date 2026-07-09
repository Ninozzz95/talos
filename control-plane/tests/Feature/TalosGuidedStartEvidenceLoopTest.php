<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosContextSet;
use App\Models\TalosContextSource;
use App\Models\TalosFile;
use App\Models\TalosFileChunk;
use App\Models\TalosModelProfile;
use App\Models\TalosRun;
use App\Models\TalosSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class TalosGuidedStartEvidenceLoopTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateTalosUser();
    }

    public function test_grounded_chat_run_can_be_benchmarked_with_source_level_evidence(): void
    {
        config(['services.avm_validator.url' => 'http://validator.test']);
        $this->useIsolatedLocalStorage();

        $session = TalosSession::query()->create([
            'user_id' => auth()->id(),
            'title' => 'Guided evidence loop',
            'mode' => 'verified_execution',
        ]);
        $profile = TalosModelProfile::query()->create([
            'user_id' => auth()->id(),
            'provider' => 'openai',
            'model' => 'gpt-4.1-mini',
            'display_name' => 'Guided model',
            'status' => 'healthy',
            'encrypted_secret' => Crypt::encryptString('profile-secret'),
        ]);
        $fileContent = 'Approve deployment only after replay evidence is attached.';
        $file = TalosFile::query()->create([
            'user_id' => auth()->id(),
            'original_name' => 'workflow.md',
            'mime_type' => 'text/markdown',
            'size_bytes' => strlen($fileContent),
            'checksum' => hash('sha256', $fileContent),
            'status' => 'available',
            'storage_path' => 'ingested/private/workflow.md',
            'parser' => 'markdown',
        ]);
        $chunk = TalosFileChunk::query()->create([
            'file_id' => $file->id,
            'sequence' => 1,
            'content' => $fileContent,
            'content_hash' => hash('sha256', $fileContent),
            'start_offset' => 0,
            'end_offset' => strlen($fileContent),
        ]);
        $contextSet = TalosContextSet::query()->create([
            'user_id' => auth()->id(),
            'name' => 'Deployment packet',
            'status' => 'available',
        ]);
        TalosContextSource::query()->create([
            'context_set_id' => $contextSet->id,
            'file_id' => $file->id,
            'file_chunk_id' => $chunk->id,
            'source_type' => 'file_chunk',
            'sequence' => 1,
        ]);

        Http::fake([
            'validator.test/chat' => Http::response([
                'text' => 'Use replay evidence before deployment.',
                'mutations' => [
                    ['action' => 'SPAWN_NODE', 'node_id' => 'answer_task', 'node_type' => 'ANSWER_TASK'],
                ],
            ]),
        ]);

        $chatResponse = $this->postJson('/api/talos/chat', [
            'session_id' => $session->id,
            'message' => 'Summarize the deployment control.',
            'model_profile_id' => $profile->id,
            'context_set_id' => $contextSet->id,
        ]);

        $chatResponse
            ->assertOk()
            ->assertJsonPath('run.status', 'succeeded')
            ->assertJsonPath('run.session_id', $session->id)
            ->assertJsonPath('run.context_set_id', $contextSet->id)
            ->assertJsonPath('used_context.0.context_set_id', $contextSet->id)
            ->assertJsonPath('used_context.0.file_id', $file->id)
            ->assertJsonPath('used_context.0.chunk_id', $chunk->id)
            ->assertJsonPath('used_context.0.file_name', 'workflow.md')
            ->assertJsonPath('used_context.0.preview', $fileContent);

        $runId = $chatResponse->json('run.id');
        $this->assertIsString($runId);
        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $runId,
            'sequence' => 1,
            'event_type' => 'chat.requested',
        ]);
        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $runId,
            'sequence' => 2,
            'event_type' => 'chat.response',
        ]);

        $benchmarkResponse = $this->postJson("/api/talos/runs/{$runId}/benchmark", [
            'runs' => 1,
        ]);

        $benchmarkResponse
            ->assertCreated()
            ->assertJsonPath('benchmark_group.source_run_id', $runId)
            ->assertJsonPath('benchmark_group.prompt_hash', hash('sha256', 'Summarize the deployment control.'))
            ->assertJsonCount(3, 'benchmark_results');

        $scenarioPath = $benchmarkResponse->json('benchmark_group.scenario_path');
        $this->assertIsString($scenarioPath);
        Storage::disk('local')->assertExists($scenarioPath);

        $scenario = json_decode(Storage::disk('local')->get($scenarioPath), true, 512, JSON_THROW_ON_ERROR);
        $this->assertIsArray($scenario);
        $this->assertSame($runId, $scenario['source_run_id']);
        $this->assertSame($contextSet->id, $scenario['context_set_id']);
        $this->assertSame('context_set_sources_required', $scenario['evidence_contract']['context_integrity']);
        $this->assertSame($file->id, $scenario['input_files'][0]['file_id']);
        $this->assertSame($chunk->id, $scenario['input_files'][0]['chunk_id']);
        $this->assertSame($file->checksum, $scenario['input_files'][0]['sha256']);
        $this->assertSame($chunk->content_hash, $scenario['input_files'][0]['content_hash']);
        $this->assertSame($file->id, $scenario['context_sources'][0]['file_id']);
        $this->assertSame($chunk->id, $scenario['context_sources'][0]['chunk_id']);
        $this->assertSame($file->checksum, $scenario['context_sources'][0]['sha256']);
        $this->assertSame($chunk->content_hash, $scenario['context_sources'][0]['content_hash']);

        $run = TalosRun::query()->findOrFail($runId);
        $this->assertSame($contextSet->id, $run->context_set_id);
    }
}
