<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Exceptions\TalosExtractionException;
use App\Services\FileIngestion\Ocr\HttpDeepSeekOcrClient;
use GuzzleHttp\Promise\Create;
use GuzzleHttp\Psr7\FnStream;
use GuzzleHttp\Psr7\Response as PsrResponse;
use GuzzleHttp\Psr7\Utils as Psr7Utils;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use JsonException;
use Psr\Http\Message\RequestInterface;
use RuntimeException;
use Tests\TestCase;

final class HttpDeepSeekOcrClientTest extends TestCase
{
    private string $sourcePath;

    private string $sourceSha256;

    protected function setUp(): void
    {
        parent::setUp();

        $bytes = base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            true,
        );
        $this->assertIsString($bytes);
        $path = tempnam(sys_get_temp_dir(), 'talos-ocr-client-');
        $this->assertIsString($path);
        file_put_contents($path, $bytes);
        $this->sourcePath = $path;
        $this->sourceSha256 = hash('sha256', $bytes);

        config(['talos-files.ocr' => $this->validConfig()]);
    }

    protected function tearDown(): void
    {
        @unlink($this->sourcePath);
        parent::tearDown();
    }

    public function test_sends_canonical_hash_bound_request_and_normalizes_exact_provenance(): void
    {
        $requests = [];
        Http::fake(function (Request $request) use (&$requests) {
            $requests[] = $request;
            if (str_ends_with($request->url(), '/ready')) {
                return Http::response($this->readyPayload());
            }

            $root = json_decode($request->body(), false, 32, JSON_THROW_ON_ERROR);
            $this->assertInstanceOf(\stdClass::class, $root);

            return Http::response($this->validResponse($root));
        });

        $client = new HttpDeepSeekOcrClient;
        $readiness = $client->readiness();
        $ownerRef = (string) Str::uuid();
        $result = $client->extract(
            $this->sourcePath,
            'image/png',
            $this->sourceSha256,
            $ownerRef,
        );

        $this->assertSame('healthy', $readiness->status);
        $this->assertTrue($readiness->blocking);
        $this->assertSame('TALOS OCR output', $result->text);
        $this->assertSame($this->validConfig()['expected_model_revision'], $result->modelRevision);
        $this->assertSame('untrusted', $result->metadata['trust_level']);
        $this->assertSame('pillow', $result->metadata['provenance']['renderer']);
        $this->assertCount(2, $requests);
        $extractRequest = $requests[1];
        $this->assertSame('http://ocr-worker.test:3200/v1/ocr', $extractRequest->url());
        $this->assertSame(['c'.str_repeat('a', 63)], $extractRequest->header('X-Talos-Ocr-Token'));
        $this->assertStringNotContainsString($this->sourcePath, $extractRequest->body());
        $sent = json_decode($extractRequest->body(), false, 32, JSON_THROW_ON_ERROR);
        $this->assertInstanceOf(\stdClass::class, $sent);
        $this->assertSame('talos.ocr.worker.v1', $sent->protocol);
        $this->assertSame($ownerRef, $sent->owner_ref);
        $this->assertSame($this->sourceSha256, $sent->input->sha256);
        $this->assertSame('image/png', $sent->input->mime_type);
        $this->assertSame(base64_encode((string) file_get_contents($this->sourcePath)), $sent->input->bytes_base64);
    }

    public function test_worker_transport_ignores_environment_proxy_configuration(): void
    {
        $previousProxy = getenv('HTTP_PROXY');
        $observedProxy = null;
        putenv('HTTP_PROXY=http://untrusted-proxy.invalid:8080');
        Http::globalOptions([
            'handler' => function (RequestInterface $request, array $options) use (&$observedProxy) {
                $observedProxy = $options['proxy'] ?? null;

                return Create::promiseFor(new PsrResponse(
                    200,
                    ['Content-Type' => 'application/json'],
                    json_encode($this->readyPayload(), JSON_THROW_ON_ERROR),
                ));
            },
        ]);

        try {
            (new HttpDeepSeekOcrClient)->readiness();
        } finally {
            Http::globalOptions([]);
            $previousProxy === false
                ? putenv('HTTP_PROXY')
                : putenv('HTTP_PROXY='.$previousProxy);
        }

        $this->assertSame('', $observedProxy);
    }

    public function test_stream_read_failure_is_normalized_as_unavailable(): void
    {
        $stream = FnStream::decorate(Psr7Utils::streamFor('{}'), [
            'read' => static function (): never {
                throw new RuntimeException('private late stream failure');
            },
        ]);
        Http::fake(static fn () => Create::promiseFor(new PsrResponse(
            200,
            ['Content-Type' => 'application/json'],
            $stream,
        )));

        try {
            (new HttpDeepSeekOcrClient)->readiness();
            $this->fail('Expected a late streamed response failure.');
        } catch (TalosExtractionException $exception) {
            $this->assertSame('TALOS_OCR_UNAVAILABLE', $exception->errorCode);
            $this->assertStringNotContainsString('private', $exception->getMessage());
            $this->assertInstanceOf(RuntimeException::class, $exception->getPrevious());
        }
    }

    public function test_auth_http_timeout_response_budget_shape_echo_hash_and_revision_faults_fail_closed(): void
    {
        $cases = [
            'unauthorized' => ['status' => 401, 'mutate' => null, 'code' => 'TALOS_OCR_UNAVAILABLE'],
            'upstream_failure' => ['status' => 500, 'mutate' => null, 'code' => 'TALOS_OCR_UNAVAILABLE'],
            'malformed' => ['raw' => '{', 'code' => 'TALOS_OCR_RESPONSE_MALFORMED'],
            'pages_object' => ['mutate' => static function (array &$payload): void {
                $payload['data']['pages'] = (object) [];
            }, 'code' => 'TALOS_OCR_RESPONSE_MALFORMED'],
            'request_echo' => ['mutate' => static function (array &$payload): void {
                $payload['data']['request_id'] = (string) Str::uuid();
            }, 'code' => 'TALOS_OCR_RESPONSE_MISMATCH'],
            'owner_echo' => ['mutate' => static function (array &$payload): void {
                $payload['data']['owner_ref'] = (string) Str::uuid();
            }, 'code' => 'TALOS_OCR_RESPONSE_MISMATCH'],
            'source_echo' => ['mutate' => static function (array &$payload): void {
                $payload['data']['source_sha256'] = str_repeat('f', 64);
            }, 'code' => 'TALOS_OCR_RESPONSE_MISMATCH'],
            'text_hash' => ['mutate' => static function (array &$payload): void {
                $payload['data']['text_sha256'] = str_repeat('0', 64);
            }, 'code' => 'TALOS_OCR_RESPONSE_MISMATCH'],
            'aggregate_page_binding' => ['mutate' => static function (array &$payload): void {
                $payload['data']['text'] = 'different aggregate';
                $payload['data']['text_sha256'] = hash('sha256', 'different aggregate');
            }, 'code' => 'TALOS_OCR_RESPONSE_MISMATCH'],
            'revision' => ['mutate' => static function (array &$payload): void {
                $payload['data']['provenance']['model_revision'] = str_repeat('0', 40);
            }, 'code' => 'TALOS_OCR_RUNTIME_DRIFT'],
            'runtime_identity' => ['mutate' => static function (array &$payload): void {
                $payload['data']['provenance']['runtime'] = 'transformers';
            }, 'code' => 'TALOS_OCR_RUNTIME_DRIFT'],
        ];

        $activeCase = [];
        Http::fake(function (Request $request) use (&$activeCase) {
            if (($activeCase['connection'] ?? false) === true) {
                throw new ConnectionException('private transport detail');
            }
            if (array_key_exists('raw', $activeCase)) {
                return Http::response($activeCase['raw'], $activeCase['status'] ?? 200);
            }
            $root = json_decode($request->body(), false, 32, JSON_THROW_ON_ERROR);
            $payload = $this->validResponse($root);
            if (isset($activeCase['mutate']) && is_callable($activeCase['mutate'])) {
                $activeCase['mutate']($payload);
            }

            return Http::response($payload, $activeCase['status'] ?? 200);
        });

        foreach ($cases as $name => $case) {
            $activeCase = $case;

            try {
                (new HttpDeepSeekOcrClient)->extract(
                    $this->sourcePath,
                    'image/png',
                    $this->sourceSha256,
                    (string) Str::uuid(),
                );
                $this->fail("Expected OCR fault for {$name}.");
            } catch (TalosExtractionException $exception) {
                $previous = $exception->getPrevious();
                $diagnostic = $name.'; previous='.(
                    $previous === null
                        ? 'none'
                        : $previous::class.': '.$previous->getMessage()
                );
                $this->assertSame($case['code'], $exception->errorCode, $diagnostic);
                $this->assertStringNotContainsString('private', $exception->getMessage());
            }
        }

        config(['talos-files.ocr.max_response_bytes' => 32]);
        $activeCase = [];
        $this->assertClientFault('TALOS_OCR_RESPONSE_TOO_LARGE');

        config(['talos-files.ocr' => $this->validConfig()]);
        $activeCase = ['connection' => true];
        $this->assertClientFault('TALOS_OCR_UNAVAILABLE');
    }

    public function test_readiness_rejects_renderer_identity_drift(): void
    {
        foreach (['pdf_renderer', 'image_renderer'] as $property) {
            Http::fake(function () use ($property) {
                $payload = $this->readyPayload();
                $payload['data'][$property] = 'unexpected-renderer';

                return Http::response($payload);
            });

            try {
                (new HttpDeepSeekOcrClient)->readiness();
                $this->fail("Expected OCR readiness drift for {$property}.");
            } catch (TalosExtractionException $exception) {
                $this->assertSame('TALOS_OCR_RUNTIME_DRIFT', $exception->errorCode);
            }
        }
    }

    public function test_canonical_worker_source_faults_are_translated_without_trusting_remote_messages(): void
    {
        $cases = [
            [413, 'TALOS_OCR_REQUEST_TOO_LARGE', false],
            [422, 'TALOS_OCR_REQUEST_INVALID', false],
            [413, 'TALOS_OCR_SOURCE_LIMIT_EXCEEDED', false],
            [422, 'TALOS_OCR_SOURCE_INVALID', false],
            [503, 'TALOS_OCR_RUNTIME_UNAVAILABLE', true],
            [503, 'TALOS_OCR_RUNTIME_DRIFT', false],
            [502, 'TALOS_OCR_RUNTIME_RESPONSE_INVALID', false],
            [502, 'TALOS_OCR_RUNTIME_OUTPUT_TRUNCATED', false],
            [504, 'TALOS_OCR_REQUEST_TIMEOUT', true],
        ];

        $activeCase = [];
        Http::fake(static function () use (&$activeCase) {
            return Http::response([
                'error' => [
                    'code' => $activeCase['code'],
                    'message' => 'remote private attacker-controlled detail',
                    'retryable' => $activeCase['retryable'],
                ],
            ], $activeCase['status']);
        });

        foreach ($cases as [$status, $code, $retryable]) {
            $activeCase = compact('status', 'code', 'retryable');

            try {
                (new HttpDeepSeekOcrClient)->extract(
                    $this->sourcePath,
                    'image/png',
                    $this->sourceSha256,
                    (string) Str::uuid(),
                );
                $this->fail("Expected canonical worker fault [{$code}].");
            } catch (TalosExtractionException $exception) {
                $this->assertSame($code, $exception->errorCode);
                $this->assertStringNotContainsString('remote', $exception->getMessage());
                $this->assertStringNotContainsString('private', $exception->getMessage());
                $this->assertStringNotContainsString('attacker', $exception->getMessage());
            }
        }
    }

    public function test_unknown_or_inconsistent_worker_faults_remain_generic(): void
    {
        $cases = [
            [422, ['error' => ['code' => 'TALOS_OCR_UNKNOWN', 'message' => 'remote', 'retryable' => false]]],
            [500, ['error' => ['code' => 'TALOS_OCR_SOURCE_INVALID', 'message' => 'remote', 'retryable' => false]]],
            [422, ['error' => ['code' => 'TALOS_OCR_SOURCE_INVALID', 'message' => 'remote', 'retryable' => true]]],
            [401, ['error' => ['code' => 'TALOS_OCR_UNAUTHORIZED', 'message' => 'remote', 'retryable' => false]]],
            [500, ['error' => ['code' => 'TALOS_OCR_CONFIGURATION_INVALID', 'message' => 'remote', 'retryable' => false]]],
            [422, ['error' => ['code' => 'TALOS_OCR_SOURCE_INVALID', 'message' => 'remote', 'retryable' => false, 'extra' => true]]],
        ];

        $activeCase = [];
        Http::fake(static function () use (&$activeCase) {
            return Http::response(
                $activeCase['payload'],
                $activeCase['status'],
            );
        });

        foreach ($cases as [$status, $payload]) {
            $activeCase = compact('status', 'payload');

            try {
                (new HttpDeepSeekOcrClient)->extract(
                    $this->sourcePath,
                    'image/png',
                    $this->sourceSha256,
                    (string) Str::uuid(),
                );
                $this->fail('Expected an untrusted worker fault to fail closed.');
            } catch (TalosExtractionException $exception) {
                $this->assertSame('TALOS_OCR_UNAVAILABLE', $exception->errorCode);
                $this->assertStringNotContainsString('remote', $exception->getMessage());
            }
        }
    }

    /** @return array<string, mixed> */
    private function validConfig(): array
    {
        $revision = 'aaa02f3811945a91062062994c5c4a3f4c0af2b0';

        return [
            'enabled' => true,
            'url' => 'http://ocr-worker.test:3200',
            'token' => 'c'.str_repeat('a', 63),
            'protocol' => 'talos.ocr.worker.v1',
            'timeout_seconds' => 180,
            'max_response_bytes' => 10 * 1024 * 1024,
            'expected_model' => 'deepseek-ai/DeepSeek-OCR-2',
            'expected_model_revision' => $revision,
            'expected_served_model' => 'deepseek-ai/DeepSeek-OCR-2@'.$revision,
            'expected_runtime_version' => '0.25.1',
            'expected_pdf_renderer_version' => '5.12.1',
            'expected_image_renderer_version' => '12.3.0',
            'pdf_min_native_chars' => 32,
            'pdf_min_native_chars_per_page' => 12,
        ];
    }

    /** @return array<string, mixed> */
    private function readyPayload(): array
    {
        $config = $this->validConfig();

        return ['data' => [
            'protocol' => $config['protocol'],
            'status' => 'ready',
            'model' => $config['expected_model'],
            'model_revision' => $config['expected_model_revision'],
            'served_model' => $config['expected_served_model'],
            'runtime' => 'vllm',
            'runtime_version' => $config['expected_runtime_version'],
            'pdf_renderer' => 'pypdfium2',
            'pdf_renderer_version' => $config['expected_pdf_renderer_version'],
            'image_renderer' => 'pillow',
            'image_renderer_version' => $config['expected_image_renderer_version'],
        ]];
    }

    /** @return array<string, mixed> */
    private function validResponse(\stdClass $request): array
    {
        $config = $this->validConfig();
        $text = 'TALOS OCR output';
        $pageText = 'TALOS OCR output';

        return ['data' => [
            'protocol' => $config['protocol'],
            'request_id' => $request->request_id,
            'owner_ref' => $request->owner_ref,
            'source_sha256' => $request->input->sha256,
            'text' => $text,
            'text_sha256' => hash('sha256', $text),
            'pages' => [[
                'index' => 1,
                'width' => 1,
                'height' => 1,
                'image_sha256' => str_repeat('d', 64),
                'text' => $pageText,
                'text_sha256' => hash('sha256', $pageText),
                'latency_ms' => 3,
                'usage' => ['prompt_tokens' => 1, 'completion_tokens' => 2],
                'warnings' => [],
            ]],
            'provenance' => [
                'model' => $config['expected_model'],
                'model_revision' => $config['expected_model_revision'],
                'served_model' => $config['expected_served_model'],
                'runtime' => 'vllm',
                'runtime_version' => $config['expected_runtime_version'],
                'renderer' => 'pillow',
                'renderer_version' => $config['expected_image_renderer_version'],
            ],
            'warnings' => [],
        ]];
    }

    private function assertClientFault(string $expectedCode): void
    {
        try {
            (new HttpDeepSeekOcrClient)->extract(
                $this->sourcePath,
                'image/png',
                $this->sourceSha256,
                (string) Str::uuid(),
            );
            $this->fail("Expected OCR fault [{$expectedCode}].");
        } catch (TalosExtractionException $exception) {
            $this->assertSame($expectedCode, $exception->errorCode);
        }
    }
}
