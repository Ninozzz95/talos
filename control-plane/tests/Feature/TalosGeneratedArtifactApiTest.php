<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosArtifactGeneration;
use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Policy\TalosCapabilityDecision;
use App\Services\Policy\TalosCapabilityPolicyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;
use ZipArchive;

final class TalosGeneratedArtifactApiTest extends TestCase
{
    use RefreshDatabase;

    private const WORKER_TOKEN = 'test-artifact-worker-token-at-least-32-bytes';

    private User $user;

    private TalosRun $run;

    private string $quarantineRoot;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
        $this->useIsolatedLocalStorage();
        $this->quarantineRoot = storage_path('framework/testing/artifact-quarantine-'.uniqid());
        config([
            'filesystems.disks.talos_quarantine.root' => $this->quarantineRoot,
            'services.talos.artifact.worker_url' => 'http://artifact-worker.test:3200',
            'services.talos.artifact.worker_token' => self::WORKER_TOKEN,
            'services.talos.artifact.connect_timeout_seconds' => 3,
            'services.talos.artifact.request_timeout_seconds' => 130,
            'services.talos.artifact.max_response_bytes' => 35_000_000,
            'services.talos.artifact.stale_after_seconds' => 180,
        ]);
        Storage::forgetDisk('talos_quarantine');
        $session = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Generated artifact session',
            'mode' => 'verified_execution',
        ]);
        $this->run = TalosRun::query()->create([
            'user_id' => $this->user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'succeeded',
            'prompt_hash' => hash('sha256', 'Generate board report'),
            'provider' => 'test',
            'model' => 'test-model',
        ]);
    }

    protected function tearDown(): void
    {
        app('files')->deleteDirectory($this->quarantineRoot);
        parent::tearDown();
    }

    public function test_requires_authentication_owned_run_both_capabilities_and_uuid_idempotency_key(): void
    {
        $payload = $this->payload('pdf', 'report.pdf');
        $this->postJson("/api/talos/runs/{$this->run->id}/generated-artifacts", $payload)
            ->assertForbidden()
            ->assertJsonPath('code', 'TALOS_CAPABILITY_APPROVAL_REQUIRED');
        Http::assertNothingSent();

        $this->allowCapability('artifacts.generate', 0);
        $this->postJson("/api/talos/runs/{$this->run->id}/generated-artifacts", $payload)
            ->assertForbidden()
            ->assertJsonPath('code', 'TALOS_CAPABILITY_APPROVAL_REQUIRED');
        Http::assertNothingSent();

        $this->allowCapability('files.write', 1);
        $this->postJson("/api/talos/runs/{$this->run->id}/generated-artifacts", $payload)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_ARTIFACT_IDEMPOTENCY_KEY_INVALID');

        $foreign = User::factory()->create();
        $foreignRun = TalosRun::query()->create([
            'user_id' => $foreign->id,
            'mode' => 'verified_execution',
            'status' => 'succeeded',
            'prompt_hash' => hash('sha256', 'foreign'),
        ]);
        $this->withHeader('Idempotency-Key', $this->uuid(1))
            ->postJson("/api/talos/runs/{$foreignRun->id}/generated-artifacts", $payload)
            ->assertNotFound();

        auth()->logout();
        $this->withHeader('Idempotency-Key', $this->uuid(2))
            ->postJson("/api/talos/runs/{$this->run->id}/generated-artifacts", $payload)
            ->assertUnauthorized();
    }

    public function test_promotes_a_clean_pdf_once_and_persists_artifact_document_library_and_events(): void
    {
        $this->allowGeneration();
        $requestId = $this->uuid(10);
        $bytes = $this->bytesFor('pdf');
        Http::fake([
            'http://artifact-worker.test:3200/generate' => Http::response(
                $this->successPayload($requestId, 'pdf', $bytes),
                200,
                ['Content-Type' => 'application/json'],
            ),
        ]);

        $response = $this->withHeader('Idempotency-Key', $requestId)
            ->postJson(
                "/api/talos/runs/{$this->run->id}/generated-artifacts",
                $this->payload('pdf', 'board-report.pdf'),
            )
            ->assertCreated()
            ->assertJsonPath('data.generation.id', $requestId)
            ->assertJsonPath('data.generation.status', 'succeeded')
            ->assertJsonPath('data.artifact.artifact_type', 'generated_document')
            ->assertJsonPath('data.artifact.mime_type', 'application/pdf')
            ->assertJsonPath('data.document.format', 'pdf')
            ->assertJsonPath('meta.replayed', false)
            ->assertJsonMissingPath('data.artifact.metadata.storage_path')
            ->assertJsonMissingPath('data.artifact.metadata.storage_disk')
            ->assertJsonMissingPath('data.artifact.metadata.data_base64');

        $artifactId = $response->json('data.artifact.id');
        $documentId = $response->json('data.document.id');
        $this->assertIsString($artifactId);
        $this->assertIsString($documentId);
        $this->assertDatabaseHas('talos_artifact_generations', [
            'id' => $requestId,
            'status' => 'succeeded',
            'artifact_id' => $artifactId,
            'document_id' => $documentId,
        ]);
        $this->assertDatabaseHas('talos_run_artifacts', [
            'id' => $artifactId,
            'artifact_type' => 'generated_document',
        ]);
        $this->assertDatabaseHas('talos_documents', [
            'id' => $documentId,
            'run_artifact_id' => $artifactId,
            'status' => 'active',
        ]);
        $this->assertDatabaseHas('talos_library_items', [
            'source_type' => 'run_artifact',
            'source_id' => $artifactId,
            'byte_size' => strlen($bytes),
            'checksum' => hash('sha256', $bytes),
        ]);
        $this->assertDatabaseMissing('talos_library_items', [
            'source_type' => 'document',
            'source_id' => $documentId,
        ]);
        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $this->run->id,
            'event_type' => 'artifact.generation.requested',
        ]);
        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $this->run->id,
            'event_type' => 'artifact.created',
        ]);
        $this->assertSame([], Storage::disk('talos_quarantine')->allFiles());
        Http::assertSent(fn (ClientRequest $request): bool => $request->hasHeader(
            'Authorization',
            'Bearer '.self::WORKER_TOKEN,
        ));

        $this->withHeader('Idempotency-Key', '"'.$requestId.'"')
            ->postJson(
                "/api/talos/runs/{$this->run->id}/generated-artifacts",
                $this->payload('pdf', 'board-report.pdf'),
            )
            ->assertOk()
            ->assertJsonPath('data.artifact.id', $artifactId)
            ->assertJsonPath('meta.replayed', true);
        Http::assertSentCount(1);
    }

    public function test_rejects_reused_key_with_changed_payload_and_active_duplicates_without_worker_call(): void
    {
        $this->allowGeneration();
        $requestId = $this->uuid(20);
        $first = $this->payload('pdf', 'first.pdf');
        TalosArtifactGeneration::query()->create([
            'id' => $requestId,
            'user_id' => $this->user->id,
            'run_id' => $this->run->id,
            'request_hash' => hash('sha256', 'different'),
            'format' => 'pdf',
            'filename' => 'other.pdf',
            'status' => TalosArtifactGeneration::STATUS_RUNNING,
            'started_at' => now(),
        ]);

        $this->withHeader('Idempotency-Key', $requestId)
            ->postJson("/api/talos/runs/{$this->run->id}/generated-artifacts", $first)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'TALOS_ARTIFACT_IDEMPOTENCY_KEY_REUSED');
        Http::assertNothingSent();

        $activeKey = $this->uuid(21);
        $documentJson = json_encode($first['document'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        TalosArtifactGeneration::query()->create([
            'id' => $activeKey,
            'user_id' => $this->user->id,
            'run_id' => $this->run->id,
            'request_hash' => hash('sha256', json_encode([
                'format' => 'pdf',
                'filename' => 'first.pdf',
                'document' => json_decode($documentJson, true, 32, JSON_THROW_ON_ERROR),
            ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION)),
            'format' => 'pdf',
            'filename' => 'first.pdf',
            'status' => TalosArtifactGeneration::STATUS_RUNNING,
            'started_at' => now(),
        ]);
        $this->withHeader('Idempotency-Key', $activeKey)
            ->postJson("/api/talos/runs/{$this->run->id}/generated-artifacts", $first)
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_ARTIFACT_REQUEST_ACTIVE');
        Http::assertNothingSent();
    }

    public function test_supports_each_frozen_format_mime_extension_and_verified_download(): void
    {
        $this->allowGeneration();
        $formats = [
            'docx' => ['report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
            'pdf' => ['report.pdf', 'application/pdf'],
            'pptx' => ['report.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
            'xlsx' => ['report.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
            'thumbnail' => ['report.png', 'image/png'],
        ];
        Http::fake(function (ClientRequest $request) {
            $payload = json_decode($request->body(), true, 32, JSON_THROW_ON_ERROR);
            $this->assertIsArray($payload);
            $requestId = $payload['request_id'] ?? null;
            $format = $payload['format'] ?? null;
            $this->assertIsString($requestId);
            $this->assertIsString($format);
            $bytes = $this->bytesFor($format);

            return Http::response(
                $this->successPayload($requestId, $format, $bytes),
                200,
                ['Content-Type' => 'application/json'],
            );
        });
        $sequence = 0;
        foreach ($formats as $format => $definition) {
            [$filename, $mime] = $definition;
            $requestId = $this->uuid(100 + $sequence);
            $bytes = $this->bytesFor($format);
            $response = $this->withHeader('Idempotency-Key', $requestId)
                ->postJson(
                    "/api/talos/runs/{$this->run->id}/generated-artifacts",
                    $this->payload($format, $filename),
                );
            $this->assertSame(
                201,
                $response->status(),
                "Format {$format} failed: ".$response->getContent(),
            );
            $response->assertJsonPath('data.artifact.mime_type', $mime);
            $artifactId = $response->json('data.artifact.id');

            $download = $this->get("/api/talos/artifacts/{$artifactId}/download")
                ->assertOk()
                ->assertHeader('content-type', $mime)
                ->assertHeader('x-content-type-options', 'nosniff');
            $this->assertSame($bytes, $download->streamedContent());
            $sequence++;
        }
    }

    public function test_download_is_owner_scoped_and_fails_closed_when_promoted_bytes_change(): void
    {
        $this->allowGeneration();
        $requestId = $this->uuid(200);
        $bytes = $this->bytesFor('pdf');
        Http::fake([
            '*' => Http::response(
                $this->successPayload($requestId, 'pdf', $bytes),
                200,
                ['Content-Type' => 'application/json'],
            ),
        ]);
        $response = $this->withHeader('Idempotency-Key', $requestId)
            ->postJson(
                "/api/talos/runs/{$this->run->id}/generated-artifacts",
                $this->payload('pdf', 'integrity.pdf'),
            )
            ->assertCreated();
        $artifactId = (string) $response->json('data.artifact.id');
        $generation = TalosArtifactGeneration::query()->findOrFail($requestId);
        $artifact = $generation->artifact()->firstOrFail();
        $metadata = $artifact->metadata;
        Storage::disk('local')->put((string) $metadata['storage_path'], 'tampered');

        $this->getJson("/api/talos/artifacts/{$artifactId}/download")
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_ARTIFACT_CONTENT_INTEGRITY');

        $foreign = User::factory()->create();
        $this->actingAs($foreign)
            ->getJson("/api/talos/artifacts/{$artifactId}/download")
            ->assertNotFound();
    }

    public function test_real_worker_promotes_and_downloads_each_frozen_format_when_gate_is_enabled(): void
    {
        $workerUrl = getenv('TALOS_REAL_ARTIFACT_WORKER_URL');
        $workerToken = getenv('TALOS_REAL_ARTIFACT_WORKER_TOKEN');
        if (! is_string($workerUrl) || $workerUrl === ''
            || ! is_string($workerToken) || $workerToken === '') {
            $this->markTestSkipped('Real artifact worker gate is not enabled.');
        }

        config([
            'services.talos.artifact.worker_url' => $workerUrl,
            'services.talos.artifact.worker_token' => $workerToken,
        ]);
        $this->allowGeneration();
        $formats = [
            'docx' => 'report.docx',
            'pdf' => 'report.pdf',
            'pptx' => 'report.pptx',
            'xlsx' => 'report.xlsx',
            'thumbnail' => 'report.png',
        ];

        $sequence = 0;
        foreach ($formats as $format => $filename) {
            $requestId = $this->uuid(300 + $sequence);
            $response = $this->withHeader('Idempotency-Key', $requestId)
                ->postJson(
                    "/api/talos/runs/{$this->run->id}/generated-artifacts",
                    $this->payload($format, $filename),
                );
            $this->assertSame(
                201,
                $response->status(),
                "Real worker format {$format} failed: ".$response->getContent(),
            );
            $artifactId = $response->json('data.artifact.id');
            $expectedSha256 = $response->json('data.artifact.metadata.sha256');
            $this->assertIsString($artifactId);
            $this->assertIsString($expectedSha256);

            $download = $this->get("/api/talos/artifacts/{$artifactId}/download")->assertOk();
            $this->assertSame($expectedSha256, hash('sha256', $download->streamedContent()));
            $sequence++;
        }

        $this->assertDatabaseCount('talos_artifact_generations', count($formats));
        $this->assertDatabaseCount('talos_run_artifacts', count($formats));
        $this->assertDatabaseCount('talos_documents', count($formats));
        $this->assertDatabaseCount('talos_library_items', count($formats));
        $this->assertSame([], Storage::disk('talos_quarantine')->allFiles());
    }

    private function allowGeneration(): void
    {
        $this->allowCapability('artifacts.generate', 0);
        $this->allowCapability('files.write', 1);
    }

    private function allowCapability(string $capability, int $revision): void
    {
        app(TalosCapabilityPolicyService::class)->update(
            $this->user,
            $capability,
            TalosCapabilityDecision::ALLOW->value,
            $revision,
        );
    }

    /** @return array<string, mixed> */
    private function payload(string $format, string $filename): array
    {
        return [
            'format' => $format,
            'filename' => $filename,
            'document' => [
                'contract' => 'talos.semantic_document.v1',
                'title' => 'Board report',
                'locale' => 'en-US',
                'author' => 'TALOS',
                'sections' => [
                    ['type' => 'heading', 'level' => 1, 'text' => 'Board report'],
                    ['type' => 'paragraph', 'text' => 'Verified artifact output.'],
                ],
                'slides' => [['title' => 'Board report', 'body' => 'Verified artifact output.']],
                'sheets' => [['name' => 'Report', 'columns' => ['Metric'], 'rows' => [['Verified']]]],
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function successPayload(string $requestId, string $format, string $bytes): array
    {
        $mimes = [
            'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'pdf' => 'application/pdf',
            'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'thumbnail' => 'image/png',
        ];

        return [
            'contract' => 'talos.artifact.response.v1',
            'request_id' => $requestId,
            'status' => 'succeeded',
            'format' => $format,
            'mime_type' => $mimes[$format],
            'sha256' => hash('sha256', $bytes),
            'byte_size' => strlen($bytes),
            'data_base64' => base64_encode($bytes),
            'validation' => ['detected_mime' => $mimes[$format], 'reopened' => true],
        ];
    }

    private function bytesFor(string $format): string
    {
        return match ($format) {
            'pdf' => "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n",
            'thumbnail' => base64_decode(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                true,
            ),
            'docx' => $this->ooxmlBytes('word/document.xml'),
            'pptx' => $this->ooxmlBytes('ppt/presentation.xml'),
            'xlsx' => $this->ooxmlBytes('xl/workbook.xml'),
            default => throw new \LogicException('Unsupported test format.'),
        };
    }

    private function ooxmlBytes(string $entry): string
    {
        $path = tempnam(sys_get_temp_dir(), 'talos-artifact-ooxml-');
        $this->assertIsString($path);
        $zip = new ZipArchive;
        $this->assertTrue($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE));
        $zip->addFromString('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
        $zip->addFromString('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
        $zip->addFromString($entry, '<?xml version="1.0"?><root/>');
        $zip->close();
        $bytes = file_get_contents($path);
        @unlink($path);
        $this->assertIsString($bytes);

        return $bytes;
    }

    private function uuid(int $suffix): string
    {
        return sprintf('00000000-0000-4000-8000-%012d', $suffix);
    }
}
