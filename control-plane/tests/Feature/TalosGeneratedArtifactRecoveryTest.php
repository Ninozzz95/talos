<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosArtifactGeneration;
use App\Models\TalosLibraryItem;
use App\Models\TalosRun;
use App\Models\User;
use App\Services\FileIngestion\Malware\TalosMalwareScanResult;
use App\Services\FileIngestion\Malware\TalosMalwareScanner;
use App\Services\Policy\TalosCapabilityDecision;
use App\Services\Policy\TalosCapabilityPolicyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\Support\CleanTalosMalwareScanner;
use Tests\TestCase;

final class TalosGeneratedArtifactRecoveryTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private TalosRun $run;

    private CleanTalosMalwareScanner $scanner;

    private string $quarantineRoot;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
        $this->run = TalosRun::query()->create([
            'user_id' => $this->user->id,
            'mode' => 'verified_execution',
            'status' => 'succeeded',
            'prompt_hash' => hash('sha256', 'recovery'),
        ]);
        $this->useIsolatedLocalStorage();
        $this->quarantineRoot = storage_path('framework/testing/artifact-recovery-'.uniqid());
        config([
            'filesystems.disks.talos_quarantine.root' => $this->quarantineRoot,
            'services.talos.artifact.worker_url' => 'http://artifact-worker.test:3200',
            'services.talos.artifact.worker_token' => 'test-artifact-worker-token-at-least-32-bytes',
            'services.talos.artifact.connect_timeout_seconds' => 3,
            'services.talos.artifact.request_timeout_seconds' => 130,
            'services.talos.artifact.max_response_bytes' => 35_000_000,
            'services.talos.artifact.stale_after_seconds' => 180,
        ]);
        Storage::forgetDisk('talos_quarantine');
        $this->scanner = new CleanTalosMalwareScanner;
        $this->app->instance(TalosMalwareScanner::class, $this->scanner);
        $policies = app(TalosCapabilityPolicyService::class);
        $policies->update($this->user, 'artifacts.generate', TalosCapabilityDecision::ALLOW_UNTIL_REVOKED->value, 0);
        $policies->update($this->user, 'files.write', TalosCapabilityDecision::ALLOW_UNTIL_REVOKED->value, 1);
    }

    protected function tearDown(): void
    {
        app('files')->deleteDirectory($this->quarantineRoot);
        parent::tearDown();
    }

    public function test_worker_typed_failure_leaves_no_visible_or_final_artifact(): void
    {
        $requestId = $this->uuid(1);
        Http::fake([
            '*' => Http::response([
                'contract' => 'talos.artifact.response.v1',
                'request_id' => $requestId,
                'status' => 'failed',
                'error' => [
                    'code' => 'ARTIFACT_GENERATION_FAILED',
                    'message' => 'Artifact generation could not be completed',
                ],
            ], 500, ['Content-Type' => 'application/json']),
        ]);

        $this->generate($requestId)
            ->assertStatus(502)
            ->assertJsonPath('code', 'ARTIFACT_GENERATION_FAILED');

        $this->assertDatabaseHas('talos_artifact_generations', [
            'id' => $requestId,
            'status' => TalosArtifactGeneration::STATUS_FAILED,
            'failure_code' => 'ARTIFACT_GENERATION_FAILED',
        ]);
        $this->assertDatabaseCount('talos_run_artifacts', 0);
        $this->assertDatabaseCount('talos_documents', 0);
        $this->assertDatabaseCount('talos_library_items', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_transport_ambiguity_becomes_recovery_required_and_is_never_retried(): void
    {
        $requestId = $this->uuid(2);
        Http::fake(['*' => Http::failedConnection()]);

        $this->generate($requestId)
            ->assertServiceUnavailable()
            ->assertJsonPath('code', 'TALOS_ARTIFACT_WORKER_TRANSPORT_AMBIGUOUS');

        $this->assertDatabaseHas('talos_artifact_generations', [
            'id' => $requestId,
            'status' => TalosArtifactGeneration::STATUS_RECOVERY_REQUIRED,
        ]);
        Http::assertSentCount(1);
    }

    public function test_stale_running_generation_reconciles_to_recovery_required_without_dispatch(): void
    {
        $requestId = $this->uuid(3);
        $payload = $this->payload();
        TalosArtifactGeneration::query()->create([
            'id' => $requestId,
            'user_id' => $this->user->id,
            'run_id' => $this->run->id,
            'request_hash' => $this->requestHash($payload),
            'format' => 'pdf',
            'filename' => 'recovery.pdf',
            'status' => TalosArtifactGeneration::STATUS_RUNNING,
            'started_at' => now()->subMinutes(10),
        ]);

        $this->generate($requestId)
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_ARTIFACT_RECOVERY_REQUIRED');
        $this->assertDatabaseHas('talos_artifact_generations', [
            'id' => $requestId,
            'status' => TalosArtifactGeneration::STATUS_RECOVERY_REQUIRED,
        ]);
        Http::assertNothingSent();
    }

    public function test_infected_or_post_scan_changed_bytes_fail_closed_without_final_copy(): void
    {
        $infectedId = $this->uuid(4);
        $this->scanner->result = new TalosMalwareScanResult(
            status: 'infected',
            threat: 'Test.Signature',
            engineVersion: '1.5.3-test',
            signatureVersion: 'test',
        );
        $this->fakeSuccess();
        $this->generate($infectedId)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_ARTIFACT_MALWARE_DETECTED');
        $this->assertDatabaseCount('talos_run_artifacts', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());

        $changedId = $this->uuid(5);
        $this->scanner->result = null;
        $this->scanner->afterScan = static function (string $path): void {
            file_put_contents($path, 'changed-after-scan');
        };
        $this->generate($changedId)
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_ARTIFACT_CHANGED_AFTER_SCAN');
        $this->assertDatabaseCount('talos_run_artifacts', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_library_failure_compensates_final_bytes_and_database_rows(): void
    {
        $requestId = $this->uuid(6);
        $this->fakeSuccess();
        TalosLibraryItem::creating(static function (): never {
            throw new \RuntimeException('forced projector failure');
        });

        $this->generate($requestId)
            ->assertServiceUnavailable()
            ->assertJsonPath('code', 'TALOS_ARTIFACT_PROMOTION_FAILED');

        $this->assertDatabaseCount('talos_run_artifacts', 0);
        $this->assertDatabaseCount('talos_documents', 0);
        $this->assertDatabaseCount('talos_library_items', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
        $this->assertSame([], Storage::disk('talos_quarantine')->allFiles());
    }

    public function test_post_commit_quarantine_cleanup_failure_preserves_artifact_and_marks_pending(): void
    {
        $requestId = $this->uuid(9);
        $this->fakeSuccess();
        $realQuarantine = Storage::disk('talos_quarantine');
        $failingQuarantine = \Mockery::mock($realQuarantine)->makePartial();
        $failingQuarantine->shouldReceive('delete')->once()->andReturnFalse();
        Storage::set('talos_quarantine', $failingQuarantine);

        $response = $this->generate($requestId)->assertCreated();
        $artifactId = $response->json('data.artifact.id');
        $this->assertIsString($artifactId);

        $artifact = \App\Models\TalosRunArtifact::query()->findOrFail($artifactId);
        $this->assertTrue((bool) data_get($artifact->metadata, 'quarantine_cleanup_pending'));
        $this->assertDatabaseHas('talos_artifact_generations', [
            'id' => $requestId,
            'status' => TalosArtifactGeneration::STATUS_SUCCEEDED,
            'artifact_id' => $artifactId,
        ]);
        $this->assertNotSame([], Storage::disk('local')->allFiles());
        $this->assertNotSame([], $realQuarantine->allFiles());
    }

    public function test_post_commit_cleanup_marker_failure_preserves_committed_success(): void
    {
        $requestId = $this->uuid(10);
        $this->fakeSuccess();
        $realQuarantine = Storage::disk('talos_quarantine');
        $failingQuarantine = \Mockery::mock($realQuarantine)->makePartial();
        $failingQuarantine->shouldReceive('delete')->once()->andReturnFalse();
        Storage::set('talos_quarantine', $failingQuarantine);
        \App\Models\TalosRunArtifact::updating(static function (\App\Models\TalosRunArtifact $artifact): void {
            if (data_get($artifact->metadata, 'quarantine_cleanup_pending') === true) {
                throw new \RuntimeException('forced cleanup marker failure');
            }
        });

        $response = $this->generate($requestId)
            ->assertCreated()
            ->assertJsonPath('data.generation.status', TalosArtifactGeneration::STATUS_SUCCEEDED);
        $artifactId = $response->json('data.artifact.id');
        $documentId = $response->json('data.document.id');
        $this->assertIsString($artifactId);
        $this->assertIsString($documentId);

        $this->assertDatabaseHas('talos_artifact_generations', [
            'id' => $requestId,
            'status' => TalosArtifactGeneration::STATUS_SUCCEEDED,
            'artifact_id' => $artifactId,
            'document_id' => $documentId,
        ]);
        $this->assertDatabaseHas('talos_run_artifacts', ['id' => $artifactId]);
        $this->assertDatabaseHas('talos_documents', ['id' => $documentId]);
        $this->assertDatabaseHas('talos_library_items', [
            'source_type' => 'run_artifact',
            'source_id' => $artifactId,
        ]);
        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $this->run->id,
            'event_type' => 'artifact.created',
        ]);
        $this->assertNotSame([], Storage::disk('local')->allFiles());
        $this->assertNotSame([], $realQuarantine->allFiles());
    }

    public function test_cancel_transitions_active_request_and_missing_worker_state_requires_recovery(): void
    {
        $requestId = $this->uuid(7);
        $this->createRunning($requestId);
        $missingId = $this->uuid(8);
        Http::fake(function (ClientRequest $request) use ($missingId, $requestId) {
            if (str_ends_with($request->url(), '/'.$requestId)) {
                return Http::response([
                    'contract' => 'talos.artifact.cancellation.v1',
                    'request_id' => $requestId,
                    'status' => 'cancellation_requested',
                ], 202, ['Content-Type' => 'application/json']);
            }

            return Http::response(json_encode([
                'type' => 'urn:talos:artifact-worker:problem:artifact-request-not-active',
                'title' => 'Artifact request is not active',
                'status' => 404,
                'detail' => 'No active artifact request has this identifier',
                'code' => 'ARTIFACT_REQUEST_NOT_ACTIVE',
                'request_id' => $missingId,
            ], JSON_THROW_ON_ERROR), 404, ['Content-Type' => 'application/problem+json']);
        });

        $this->postJson("/api/talos/runs/{$this->run->id}/generated-artifacts/{$requestId}/cancel")
            ->assertAccepted()
            ->assertJsonPath('data.status', TalosArtifactGeneration::STATUS_CANCELLATION_REQUESTED);

        $this->createRunning($missingId);
        $response = $this->postJson("/api/talos/runs/{$this->run->id}/generated-artifacts/{$missingId}/cancel");
        $this->assertSame(409, $response->status(), $response->getContent());
        $response->assertJsonPath('code', 'TALOS_ARTIFACT_RECOVERY_REQUIRED');
        $this->assertDatabaseHas('talos_artifact_generations', [
            'id' => $missingId,
            'status' => TalosArtifactGeneration::STATUS_RECOVERY_REQUIRED,
        ]);
    }

    public function test_cancel_cannot_overwrite_a_concurrently_completed_generation(): void
    {
        $requestId = $this->uuid(11);
        $this->createRunning($requestId);
        Http::fake(function (ClientRequest $request) use ($requestId) {
            TalosArtifactGeneration::query()
                ->whereKey($requestId)
                ->update([
                    'status' => TalosArtifactGeneration::STATUS_SUCCEEDED,
                    'completed_at' => now(),
                ]);

            return Http::response([
                'contract' => 'talos.artifact.cancellation.v1',
                'request_id' => $requestId,
                'status' => 'cancellation_requested',
            ], 202, ['Content-Type' => 'application/json']);
        });

        $this->postJson("/api/talos/runs/{$this->run->id}/generated-artifacts/{$requestId}/cancel")
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_ARTIFACT_REQUEST_NOT_ACTIVE');
        $this->assertDatabaseHas('talos_artifact_generations', [
            'id' => $requestId,
            'status' => TalosArtifactGeneration::STATUS_SUCCEEDED,
        ]);
    }

    public function test_worker_not_active_cancellation_fault_cannot_overwrite_concurrent_success(): void
    {
        $requestId = $this->uuid(12);
        $this->createRunning($requestId);
        Http::fake(function (ClientRequest $request) use ($requestId) {
            TalosArtifactGeneration::query()
                ->whereKey($requestId)
                ->update([
                    'status' => TalosArtifactGeneration::STATUS_SUCCEEDED,
                    'completed_at' => now(),
                ]);

            return Http::response(json_encode([
                'type' => 'urn:talos:artifact-worker:problem:artifact-request-not-active',
                'title' => 'Artifact request is not active',
                'status' => 404,
                'detail' => 'No active artifact request has this identifier',
                'code' => 'ARTIFACT_REQUEST_NOT_ACTIVE',
                'request_id' => $requestId,
            ], JSON_THROW_ON_ERROR), 404, ['Content-Type' => 'application/problem+json']);
        });

        $this->postJson("/api/talos/runs/{$this->run->id}/generated-artifacts/{$requestId}/cancel")
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_ARTIFACT_REQUEST_NOT_ACTIVE');
        $this->assertDatabaseHas('talos_artifact_generations', [
            'id' => $requestId,
            'status' => TalosArtifactGeneration::STATUS_SUCCEEDED,
        ]);
    }

    private function generate(string $requestId)
    {
        return $this->withHeader('Idempotency-Key', $requestId)
            ->postJson("/api/talos/runs/{$this->run->id}/generated-artifacts", $this->payload());
    }

    /** @return array<string, mixed> */
    private function payload(): array
    {
        return [
            'format' => 'pdf',
            'filename' => 'recovery.pdf',
            'document' => [
                'contract' => 'talos.semantic_document.v1',
                'title' => 'Recovery report',
                'locale' => 'en-US',
                'author' => 'TALOS',
                'sections' => [['type' => 'paragraph', 'text' => 'Recovery evidence.']],
            ],
        ];
    }

    private function fakeSuccess(): void
    {
        $bytes = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n";
        Http::fake(function (ClientRequest $request) use ($bytes) {
            $payload = json_decode($request->body(), true, 32, JSON_THROW_ON_ERROR);
            $requestId = $payload['request_id'] ?? null;
            $this->assertIsString($requestId);

            return Http::response([
                'contract' => 'talos.artifact.response.v1',
                'request_id' => $requestId,
                'status' => 'succeeded',
                'format' => 'pdf',
                'mime_type' => 'application/pdf',
                'sha256' => hash('sha256', $bytes),
                'byte_size' => strlen($bytes),
                'data_base64' => base64_encode($bytes),
                'validation' => ['detected_mime' => 'application/pdf', 'reopened' => true],
            ], 200, ['Content-Type' => 'application/json']);
        });
    }

    /** @param array<string, mixed> $payload */
    private function requestHash(array $payload): string
    {
        return hash('sha256', json_encode(
            $payload,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION,
        ));
    }

    private function createRunning(string $requestId): void
    {
        TalosArtifactGeneration::query()->create([
            'id' => $requestId,
            'user_id' => $this->user->id,
            'run_id' => $this->run->id,
            'request_hash' => $this->requestHash($this->payload()),
            'format' => 'pdf',
            'filename' => 'recovery.pdf',
            'status' => TalosArtifactGeneration::STATUS_RUNNING,
            'started_at' => now(),
        ]);
    }

    private function uuid(int $suffix): string
    {
        return sprintf('10000000-0000-4000-8000-%012d', $suffix);
    }
}
