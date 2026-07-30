<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Artifacts\ArtifactWorkerClient;
use App\Services\Artifacts\ArtifactWorkerException;
use App\Services\Artifacts\TalosSemanticDocumentV1;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class ArtifactWorkerClientTest extends TestCase
{
    private const TOKEN = 'artifact-worker-token-with-at-least-32-bytes';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.talos.artifact.worker_url' => 'http://artifact-worker.test:3200',
            'services.talos.artifact.worker_token' => self::TOKEN,
            'services.talos.artifact.connect_timeout_seconds' => 3,
            'services.talos.artifact.request_timeout_seconds' => 130,
            'services.talos.artifact.max_response_bytes' => 35_000_000,
        ]);
    }

    public function test_parses_strict_authenticated_readiness(): void
    {
        Http::fake([
            'http://artifact-worker.test:3200/ready' => Http::response(
                $this->readinessPayload(),
                200,
                ['Content-Type' => 'application/json; charset=utf-8'],
            ),
        ]);

        $readiness = app(ArtifactWorkerClient::class)->readiness();

        $this->assertSame('ready', $readiness->status);
        $this->assertSame(1, $readiness->protocolVersion);
        $this->assertContains('docx', $readiness->formats);
        Http::assertSent(fn (Request $request): bool => $request->hasHeader(
            'Authorization',
            'Bearer '.self::TOKEN,
        ));
    }

    public function test_rejects_unknown_readiness_keys_and_incompatible_protocol(): void
    {
        $payload = $this->readinessPayload();
        $payload['protocol_version'] = 2;
        $payload['unexpected'] = true;
        Http::fake([
            '*' => Http::response($payload, 200, ['Content-Type' => 'application/json']),
        ]);

        $this->expectException(ArtifactWorkerException::class);
        $this->expectExceptionMessage('incompatible');

        app(ArtifactWorkerClient::class)->readiness();
    }

    public function test_parses_verified_success_bytes_without_array_shape_loss(): void
    {
        $requestId = '11111111-1111-4111-8111-111111111111';
        $bytes = 'verified-docx-bytes';
        Http::fake([
            'http://artifact-worker.test:3200/generate' => Http::response([
                'contract' => 'talos.artifact.response.v1',
                'request_id' => $requestId,
                'status' => 'succeeded',
                'format' => 'docx',
                'mime_type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'sha256' => hash('sha256', $bytes),
                'byte_size' => strlen($bytes),
                'data_base64' => base64_encode($bytes),
                'validation' => [
                    'detected_mime' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'reopened' => true,
                ],
            ], 200, ['Content-Type' => 'application/json; charset=utf-8']),
        ]);

        $result = app(ArtifactWorkerClient::class)->generate(
            $requestId,
            'docx',
            'report.docx',
            TalosSemanticDocumentV1::fromRequestValue($this->document())->toArray(),
        );

        $this->assertTrue($result->succeeded());
        $this->assertSame($bytes, $result->bytes);
        $this->assertSame(hash('sha256', $bytes), $result->sha256);
        Http::assertSentCount(1);
    }

    public function test_rejects_malformed_success_integrity_and_unknown_keys(): void
    {
        $requestId = '22222222-2222-4222-8222-222222222222';
        Http::fake([
            '*' => Http::response([
                'contract' => 'talos.artifact.response.v1',
                'request_id' => $requestId,
                'status' => 'succeeded',
                'format' => 'docx',
                'mime_type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'sha256' => str_repeat('0', 64),
                'byte_size' => 4,
                'data_base64' => '!!!!',
                'validation' => [
                    'detected_mime' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'reopened' => true,
                ],
                'storage_path' => '/tmp/leak',
            ], 200, ['Content-Type' => 'application/json']),
        ]);

        try {
            app(ArtifactWorkerClient::class)->generate(
                $requestId,
                'docx',
                'report.docx',
                TalosSemanticDocumentV1::fromRequestValue($this->document())->toArray(),
            );
            $this->fail('Malformed worker responses must fail closed.');
        } catch (ArtifactWorkerException $exception) {
            $this->assertSame('TALOS_ARTIFACT_WORKER_PROTOCOL_INVALID', $exception->errorCode);
            $this->assertFalse($exception->ambiguous);
        }
    }

    public function test_parses_rfc9457_by_code_and_requires_http_body_status_parity(): void
    {
        $requestId = '33333333-3333-4333-8333-333333333333';
        $problem = [
            'type' => 'urn:talos:artifact-worker:problem:artifact-capacity-exceeded',
            'title' => 'Artifact worker capacity exceeded',
            'status' => 503,
            'detail' => 'Artifact worker generation capacity is exhausted',
            'code' => 'ARTIFACT_CAPACITY_EXCEEDED',
            'request_id' => $requestId,
        ];
        Http::fake([
            '*' => Http::response(
                json_encode($problem, JSON_THROW_ON_ERROR),
                422,
                ['Content-Type' => 'application/problem+json'],
            ),
        ]);

        try {
            app(ArtifactWorkerClient::class)->generate(
                $requestId,
                'docx',
                'report.docx',
                TalosSemanticDocumentV1::fromRequestValue($this->document())->toArray(),
            );
            $this->fail('Mismatched RFC 9457 status must fail closed.');
        } catch (ArtifactWorkerException $exception) {
            $this->assertSame('TALOS_ARTIFACT_WORKER_PROTOCOL_INVALID', $exception->errorCode);
        }
    }

    public function test_never_retries_generation_post_after_connection_ambiguity(): void
    {
        $requestId = '44444444-4444-4444-8444-444444444444';
        Http::fake(['*' => Http::failedConnection()]);

        try {
            app(ArtifactWorkerClient::class)->generate(
                $requestId,
                'docx',
                'report.docx',
                TalosSemanticDocumentV1::fromRequestValue($this->document())->toArray(),
            );
            $this->fail('Connection ambiguity must surface.');
        } catch (ArtifactWorkerException $exception) {
            $this->assertSame('TALOS_ARTIFACT_WORKER_TRANSPORT_AMBIGUOUS', $exception->errorCode);
            $this->assertTrue($exception->ambiguous);
        }

        Http::assertSentCount(1);
    }

    public function test_caps_worker_response_bytes(): void
    {
        config(['services.talos.artifact.max_response_bytes' => 64]);
        Http::fake([
            '*' => Http::response(str_repeat('x', 65), 200, ['Content-Type' => 'application/json']),
        ]);

        $this->expectException(ArtifactWorkerException::class);
        $this->expectExceptionMessage('byte limit');

        app(ArtifactWorkerClient::class)->readiness();
    }

    public function test_parses_the_cancellation_contract(): void
    {
        $requestId = '55555555-5555-4555-8555-555555555555';
        Http::fake([
            '*' => Http::response([
                'contract' => 'talos.artifact.cancellation.v1',
                'request_id' => $requestId,
                'status' => 'cancellation_requested',
            ], 202, ['Content-Type' => 'application/json']),
        ]);

        $result = app(ArtifactWorkerClient::class)->cancel($requestId);

        $this->assertSame($requestId, $result->requestId);
        $this->assertSame('cancellation_requested', $result->status);
    }

    public function test_maps_valid_worker_not_active_problem_during_cancellation(): void
    {
        $requestId = '66666666-6666-4666-8666-666666666666';
        $problem = [
            'type' => 'urn:talos:artifact-worker:problem:artifact-request-not-active',
            'title' => 'Artifact request is not active',
            'status' => 404,
            'detail' => 'No active artifact request has this identifier',
            'code' => 'ARTIFACT_REQUEST_NOT_ACTIVE',
            'request_id' => $requestId,
        ];
        $response = Http::response(
            json_encode($problem, JSON_THROW_ON_ERROR),
            404,
            ['Content-Type' => 'application/problem+json'],
        );
        $psrResponse = $response->wait();
        $this->assertSame(404, $psrResponse->getStatusCode());
        $this->assertSame('application/problem+json', $psrResponse->getHeaderLine('Content-Type'));
        $this->assertJsonStringEqualsJsonString(
            json_encode($problem, JSON_THROW_ON_ERROR),
            (string) $psrResponse->getBody(),
        );
        Http::fake([
            '*' => $response,
        ]);

        try {
            app(ArtifactWorkerClient::class)->cancel($requestId);
            $this->fail('A valid inactive-request problem must be surfaced by worker code.');
        } catch (ArtifactWorkerException $exception) {
            $this->assertSame('ARTIFACT_REQUEST_NOT_ACTIVE', $exception->errorCode);
            $this->assertSame(409, $exception->httpStatus);
            $this->assertFalse($exception->ambiguous);
        }
    }

    /** @return array<string, mixed> */
    private function readinessPayload(): array
    {
        return [
            'contract' => 'talos.artifact.readiness.v1',
            'status' => 'ready',
            'worker_version' => '0.1.0',
            'protocol_version' => 1,
            'formats' => ['docx', 'pdf', 'pptx', 'xlsx', 'thumbnail'],
            'limits' => [
                'max_output_bytes' => 25_000_000,
                'max_duration_ms' => 120_000,
                'max_sections' => 200,
                'max_rows' => 5_000,
                'max_slides' => 100,
                'max_input_pixels' => 16_000_000,
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function document(): array
    {
        return [
            'contract' => 'talos.semantic_document.v1',
            'title' => 'Worker contract',
            'locale' => 'en-US',
            'author' => 'TALOS',
            'sections' => [
                ['type' => 'paragraph', 'text' => 'Generate a verified document.'],
            ],
        ];
    }
}
