<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Services\FileIngestion\TalosFilePipelineHealth;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Support\HealthyTalosFilePipelineHealth;
use Tests\TestCase;

final class TalosReadinessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->app->instance(TalosFilePipelineHealth::class, new HealthyTalosFilePipelineHealth);
    }

    public function test_readyz_is_public_and_reports_healthy_when_dependencies_are_ready(): void
    {
        config([
            'app.key' => 'base64:'.base64_encode(str_repeat('a', 32)),
            'queue.default' => 'database',
            'services.talos.validator_health_url' => 'http://validator.test/health',
            'services.talos.browser.worker_url' => 'http://browser-worker.test',
            'services.talos.browser.worker_token' => 'test-browser-token',
        ]);

        Http::fake([
            'http://validator.test/health' => Http::response(['status' => 'healthy'], 200),
            'http://browser-worker.test/ready' => Http::response([
                'data' => [
                    'status' => 'ready',
                    'runtime' => 'chromium',
                    'protocols' => ['hmi' => 'talos_browser_hmi_runtime_v2.1.0'],
                ],
            ], 200),
        ]);

        $this->getJson('/readyz')
            ->assertOk()
            ->assertJsonPath('ready', true)
            ->assertJsonPath('status', 'healthy')
            ->assertJsonPath('checks.database.status', 'healthy')
            ->assertJsonPath('checks.storage.status', 'healthy')
            ->assertJsonPath('checks.queue.status', 'healthy')
            ->assertJsonPath('checks.clamav.status', 'healthy')
            ->assertJsonPath('checks.tika.status', 'healthy')
            ->assertJsonPath('checks.validator.status', 'healthy')
            ->assertJsonPath('checks.browser_worker.status', 'healthy')
            ->assertJsonPath('checks.app_key.status', 'healthy')
            ->assertJsonPath('checks.migrations.status', 'healthy');

        Http::assertSent(fn ($request): bool => $request->url() === 'http://browser-worker.test/ready'
            && $request->hasHeader('X-Talos-Worker-Token', 'test-browser-token'));
    }

    public function test_readyz_fails_closed_when_validator_health_url_is_missing(): void
    {
        config([
            'app.key' => 'base64:'.base64_encode(str_repeat('a', 32)),
            'queue.default' => 'database',
            'services.talos.validator_health_url' => null,
        ]);

        $this->getJson('/readyz')
            ->assertStatus(503)
            ->assertJsonPath('ready', false)
            ->assertJsonPath('status', 'degraded')
            ->assertJsonPath('checks.validator.status', 'failed')
            ->assertJsonPath('checks.validator.detail', 'TALOS_VALIDATOR_HEALTH_URL is not configured.');
    }

    public function test_readyz_fails_closed_when_any_migration_file_is_pending(): void
    {
        DB::table('migrations')
            ->where('migration', '2026_07_17_000003_add_security_pipeline_to_talos_files_table')
            ->delete();
        config([
            'app.key' => 'base64:'.base64_encode(str_repeat('a', 32)),
            'queue.default' => 'database',
            'services.talos.validator_health_url' => 'http://validator.test/health',
            'services.talos.browser.worker_url' => 'http://browser-worker.test',
            'services.talos.browser.worker_token' => 'test-browser-token',
        ]);
        Http::fake([
            'http://validator.test/health' => Http::response(['status' => 'healthy']),
            'http://browser-worker.test/ready' => Http::response([
                'data' => [
                    'status' => 'ready',
                    'runtime' => 'chromium',
                    'protocols' => ['hmi' => 'talos_browser_hmi_runtime_v2.1.0'],
                ],
            ]),
        ]);

        $this->getJson('/readyz')
            ->assertStatus(503)
            ->assertJsonPath('ready', false)
            ->assertJsonPath('checks.migrations.status', 'failed')
            ->assertJsonPath(
                'checks.migrations.detail',
                '1 pending migration. Run php artisan migrate --force before serving traffic.',
            );
    }

    public function test_readyz_fails_closed_when_browser_worker_is_not_launchable(): void
    {
        config([
            'app.key' => 'base64:'.base64_encode(str_repeat('a', 32)),
            'queue.default' => 'database',
            'services.talos.validator_health_url' => 'http://validator.test/health',
            'services.talos.browser.worker_url' => 'http://browser-worker.test',
            'services.talos.browser.worker_token' => 'test-browser-token',
        ]);

        Http::fake([
            'http://validator.test/health' => Http::response(['status' => 'healthy'], 200),
            'http://browser-worker.test/ready' => Http::response([
                'data' => ['status' => 'degraded', 'runtime' => 'chromium'],
            ], 503),
        ]);

        $this->getJson('/readyz')
            ->assertStatus(503)
            ->assertJsonPath('ready', false)
            ->assertJsonPath('checks.browser_worker.status', 'failed')
            ->assertJsonPath('checks.browser_worker.detail', 'browser worker readiness returned HTTP 503.');
    }

    public function test_readyz_fails_closed_when_browser_worker_hmi_runtime_is_stale(): void
    {
        config([
            'app.key' => 'base64:'.base64_encode(str_repeat('a', 32)),
            'queue.default' => 'database',
            'services.talos.validator_health_url' => 'http://validator.test/health',
            'services.talos.browser.worker_url' => 'http://browser-worker.test',
            'services.talos.browser.worker_token' => 'test-browser-token',
        ]);

        Http::fake([
            'http://validator.test/health' => Http::response(['status' => 'healthy'], 200),
            'http://browser-worker.test/ready' => Http::response([
                'data' => [
                    'status' => 'ready',
                    'runtime' => 'chromium',
                    'protocols' => ['hmi' => 'talos_browser_hmi_runtime_v2.0.0'],
                ],
            ], 200),
        ]);

        $this->getJson('/readyz')
            ->assertStatus(503)
            ->assertJsonPath('ready', false)
            ->assertJsonPath('checks.browser_worker.status', 'failed')
            ->assertJsonPath('checks.browser_worker.detail', 'browser worker HMI protocol is incompatible.');
    }

    public function test_readyz_fails_closed_when_file_pipeline_sidecars_are_unhealthy(): void
    {
        config([
            'app.key' => 'base64:'.base64_encode(str_repeat('a', 32)),
            'queue.default' => 'database',
            'services.talos.validator_health_url' => 'http://validator.test/health',
            'services.talos.browser.worker_url' => 'http://browser-worker.test',
            'services.talos.browser.worker_token' => 'test-browser-token',
        ]);
        $this->app->instance(TalosFilePipelineHealth::class, new class implements TalosFilePipelineHealth
        {
            public function checks(): array
            {
                return [
                    'clamav' => ['status' => 'failed', 'detail' => 'ClamAV is unavailable.'],
                    'tika' => ['status' => 'healthy', 'detail' => 'Apache Tika 3.3.1 is available.'],
                ];
            }
        });
        Http::fake([
            'http://validator.test/health' => Http::response(['status' => 'healthy']),
            'http://browser-worker.test/ready' => Http::response([
                'data' => [
                    'status' => 'ready',
                    'runtime' => 'chromium',
                    'protocols' => ['hmi' => 'talos_browser_hmi_runtime_v2.1.0'],
                ],
            ]),
        ]);

        $this->getJson('/readyz')
            ->assertStatus(503)
            ->assertJsonPath('ready', false)
            ->assertJsonPath('checks.clamav.status', 'failed')
            ->assertJsonPath('checks.clamav.detail', 'ClamAV is unavailable.')
            ->assertJsonPath('checks.tika.status', 'healthy');
    }

    public function test_disabled_ocr_is_visible_but_does_not_degrade_readiness(): void
    {
        $this->configureHealthyExternalDependencies();
        $this->app->instance(
            TalosFilePipelineHealth::class,
            $this->pipelineHealth([
                'status' => 'disabled',
                'detail' => 'OCR is disabled.',
                'blocking' => false,
            ]),
        );

        $this->getJson('/readyz')
            ->assertOk()
            ->assertJsonPath('ready', true)
            ->assertJsonPath('checks.ocr.status', 'disabled')
            ->assertJsonPath('checks.ocr.detail', 'OCR is disabled.')
            ->assertJsonPath('checks.ocr.blocking', false);
    }

    public function test_enabled_unhealthy_or_revision_drifted_ocr_fails_readiness(): void
    {
        $this->configureHealthyExternalDependencies();
        $this->app->instance(
            TalosFilePipelineHealth::class,
            $this->pipelineHealth([
                'status' => 'failed',
                'detail' => 'DeepSeek OCR-2 is unavailable or incompatible with the configured version pins.',
                'blocking' => true,
            ]),
        );

        $this->getJson('/readyz')
            ->assertStatus(503)
            ->assertJsonPath('ready', false)
            ->assertJsonPath('checks.ocr.status', 'failed')
            ->assertJsonPath('checks.ocr.blocking', true);
    }

    public function test_enabled_exact_ocr_runtime_is_healthy_and_blocking(): void
    {
        $this->configureHealthyExternalDependencies();
        $this->app->instance(
            TalosFilePipelineHealth::class,
            $this->pipelineHealth([
                'status' => 'healthy',
                'detail' => 'Pinned DeepSeek OCR-2 runtime is ready.',
                'blocking' => true,
            ]),
        );

        $this->getJson('/readyz')
            ->assertOk()
            ->assertJsonPath('ready', true)
            ->assertJsonPath('checks.ocr.status', 'healthy')
            ->assertJsonPath('checks.ocr.blocking', true);
    }

    public function test_production_browser_worker_healthcheck_pins_the_hmi_runtime_contract(): void
    {
        $compose = file_get_contents(base_path('../docker-compose.yml'));

        $this->assertIsString($compose);
        $this->assertStringContainsString('talos_browser_hmi_runtime_v2.1.0', $compose);
    }

    public function test_production_file_pipeline_sidecars_are_digest_pinned_and_loopback_bound(): void
    {
        $compose = file_get_contents(base_path('../docker-compose.yml'));

        $this->assertIsString($compose);
        $this->assertStringContainsString(
            'clamav/clamav:1.5.3@sha256:7f5389ccaa2368c383fa80e167ccfe44348d71e685f926fce4755eed1757673a',
            $compose,
        );
        $this->assertStringContainsString(
            'apache/tika:3.3.1.0@sha256:90b7fa1dc018434075fce9e1d9b88b1e3d0ea6979d0cf86e116c79a8073ae973',
            $compose,
        );
        $this->assertStringContainsString('${TALOS_FILE_SIDECAR_BIND:-127.0.0.1}', $compose);
        $this->assertStringContainsString("clamav:\n        condition: service_healthy", $compose);
        $this->assertStringContainsString("tika:\n        condition: service_healthy", $compose);
    }

    public function test_launcher_names_file_sidecars_and_includes_them_in_readiness_failure_logs(): void
    {
        $launcher = file_get_contents(base_path('../talos'));

        $this->assertIsString($launcher);
        $this->assertStringContainsString(
            'Building and starting TALOS, queue, validator, browser worker, ClamAV, and Tika',
            $launcher,
        );
        $this->assertStringContainsString(
            'compose logs --tail=120 talos validator browser-worker clamav tika',
            $launcher,
        );
    }

    public function test_ocr_profile_pins_images_revisions_gpu_and_private_runtime_network(): void
    {
        $compose = file_get_contents(base_path('../docker-compose.yml'));
        $liveOverlay = file_get_contents(base_path('../docker/ocr-live.yml'));
        $talosDockerfile = file_get_contents(base_path('../Dockerfile.talos'));
        $ocrDockerfile = file_get_contents(base_path('../ocr-worker/Dockerfile'));

        $this->assertIsString($compose);
        $this->assertIsString($liveOverlay);
        $this->assertIsString($talosDockerfile);
        $this->assertIsString($ocrDockerfile);
        $fetcher = $this->composeService($compose, 'ocr-model-fetch');
        $runtime = $this->composeService($compose, 'ocr-runtime');
        $worker = $this->composeService($compose, 'ocr-worker');
        $talos = $this->composeService($compose, 'talos');
        $queue = $this->composeService($compose, 'talos-queue');

        $this->assertStringContainsString('profiles: ["ocr"]', $fetcher);
        $this->assertStringContainsString('profiles: ["ocr"]', $runtime);
        $this->assertStringContainsString('profiles: ["ocr"]', $worker);
        $this->assertStringContainsString(
            'vllm/vllm-openai:v0.25.1@sha256:e4f88a835143cd22aee2397a26ec6bb80b3a4a6fe0c882bcbc63822904766089',
            $runtime,
        );
        $this->assertStringContainsString(
            'vllm/vllm-openai:v0.25.1@sha256:e4f88a835143cd22aee2397a26ec6bb80b3a4a6fe0c882bcbc63822904766089',
            $fetcher,
        );
        $this->assertStringContainsString('snapshot_download', $fetcher);
        $this->assertStringContainsString('revision="aaa02f3811945a91062062994c5c4a3f4c0af2b0"', $fetcher);
        $this->assertStringContainsString('ocr-hf-cache:/home/vllm/.cache/huggingface', $fetcher);
        $this->assertStringNotContainsString('ocr-hf-cache:/home/vllm/.cache/huggingface:ro', $fetcher);
        $this->assertStringContainsString('- ocr-egress', $fetcher);
        $this->assertStringNotContainsString('- ocr-private', $fetcher);
        $this->assertStringNotContainsString('- ocr-app', $fetcher);
        $this->assertStringNotContainsString('- default', $fetcher);
        $this->assertStringContainsString('deepseek-ai/DeepSeek-OCR-2', $runtime);
        $this->assertStringContainsString('aaa02f3811945a91062062994c5c4a3f4c0af2b0', $runtime);
        $this->assertStringContainsString('--model-impl', $runtime);
        $this->assertStringContainsString('- vllm', $runtime);
        $this->assertStringContainsString('--generation-config', $runtime);
        $this->assertStringNotContainsString('--trust-remote-code', $runtime);
        $this->assertStringContainsString('--logits-processors', $runtime);
        $this->assertStringContainsString(
            'vllm.model_executor.models.deepseek_ocr:NGramPerReqLogitsProcessor',
            $runtime,
        );
        $this->assertStringContainsString('--no-enable-prefix-caching', $runtime);
        $this->assertStringContainsString('--mm-processor-cache-gb', $runtime);
        $this->assertStringContainsString('VLLM_MEDIA_URL_ALLOW_REDIRECTS=0', $runtime);
        $this->assertStringContainsString('VLLM_MAX_IMAGE_PIXELS=16000000', $runtime);
        $this->assertStringContainsString('HF_HUB_OFFLINE=1', $runtime);
        $this->assertStringContainsString('TRANSFORMERS_OFFLINE=1', $runtime);
        $this->assertStringContainsString('VLLM_CACHE_ROOT=/tmp/vllm-cache', $runtime);
        $this->assertStringContainsString('XDG_CACHE_HOME=/tmp/cache', $runtime);
        $this->assertStringContainsString('ocr-hf-cache:/home/vllm/.cache/huggingface:ro', $runtime);
        $this->assertStringContainsString("ocr-model-fetch:\n        condition: service_completed_successfully", $runtime);
        $this->assertStringNotContainsString('TALOS_OCR_VLLM_API_KEY:?', $runtime);
        $this->assertStringNotContainsString('TALOS_OCR_WORKER_TOKEN:?', $worker);
        $this->assertStringNotContainsString('TALOS_OCR_VLLM_API_KEY:?', $worker);
        $this->assertStringContainsString('user: "2000:0"', $runtime);
        $this->assertStringContainsString('count: 1', $runtime);
        $this->assertStringContainsString('capabilities: [gpu]', $runtime);
        $this->assertStringNotContainsString('ports:', $runtime);
        $this->assertStringNotContainsString('ports:', $worker);
        $normalizedCompose = str_replace("\r\n", "\n", $compose);
        $this->assertStringContainsString("ocr-app:\n    internal: true", $normalizedCompose);
        $this->assertStringContainsString("ocr-private:\n    internal: true", $normalizedCompose);
        $this->assertStringContainsString('- ocr-app', $talos);
        $this->assertStringContainsString('- ocr-app', $queue);
        $this->assertStringContainsString('- ocr-private', $runtime);
        $this->assertStringNotContainsString('- ocr-egress', $runtime);
        $this->assertStringNotContainsString('- default', $runtime);
        $this->assertStringContainsString('- ocr-app', $worker);
        $this->assertStringContainsString('- ocr-private', $worker);
        $this->assertStringNotContainsString('- default', $worker);
        $this->assertStringContainsString(
            'TALOS_OCR_REQUEST_TIMEOUT_SECONDS=${TALOS_OCR_REQUEST_TIMEOUT_SECONDS:-170}',
            $worker,
        );
        $this->assertStringContainsString('mem_limit: "2g"', $worker);
        $this->assertStringContainsString('memswap_limit: "2g"', $worker);
        $this->assertStringContainsString('pids_limit: 128', $worker);
        $this->assertStringContainsString('init: true', $worker);
        $this->assertStringContainsString('"--limit-concurrency", "4"', $ocrDockerfile);
        $this->assertStringNotContainsString("ocr-runtime:\n        condition", $talos);
        $this->assertStringNotContainsString("ocr-worker:\n        condition", $talos);
        $this->assertStringNotContainsString("ocr-runtime:\n        condition", $queue);
        $this->assertStringNotContainsString("ocr-worker:\n        condition", $queue);
        $this->assertStringContainsString('127.0.0.1:${TALOS_OCR_LIVE_HOST_PORT:-13200}:3200', $liveOverlay);
        $normalizedTalosDockerfile = strtolower($talosDockerfile);
        $this->assertStringNotContainsString('python', $normalizedTalosDockerfile);
        $this->assertStringNotContainsString('pip install', $normalizedTalosDockerfile);
        $this->assertStringNotContainsString('deepseek', $normalizedTalosDockerfile);
        $this->assertStringNotContainsString('vllm', $normalizedTalosDockerfile);
    }

    public function test_launcher_generates_ocr_credentials_and_auto_enables_profile_only_when_requested(): void
    {
        $launcher = file_get_contents(base_path('../talos'));
        $rootEnvironment = file_get_contents(base_path('../.env.example'));
        $controlPlaneEnvironment = file_get_contents(base_path('.env.example'));

        $this->assertIsString($launcher);
        $this->assertIsString($rootEnvironment);
        $this->assertIsString($controlPlaneEnvironment);
        $this->assertStringContainsString('effective_env_value TALOS_OCR_ENABLED', $launcher);
        $this->assertStringContainsString('compose_args+=(--profile ocr)', $launcher);
        $this->assertStringContainsString('reconcile_stale_ocr_services', $launcher);
        $this->assertStringContainsString('talos_runtime_compose --profile ocr rm -sf ocr-worker ocr-runtime ocr-model-fetch', $launcher);
        $this->assertStringContainsString(
            'set_env_value .env TALOS_OCR_WORKER_TOKEN "$(random_hex_32)"',
            $launcher,
        );
        $this->assertStringContainsString(
            'set_env_value .env TALOS_OCR_VLLM_API_KEY "$(random_hex_32)"',
            $launcher,
        );
        $this->assertStringContainsString('ocr_services+=(ocr-worker ocr-runtime ocr-model-fetch)', $launcher);
        $this->assertStringContainsString('ocr_startup_timeout_seconds', $launcher);
        $this->assertStringContainsString('ready_attempts=$(( (ocr_startup_timeout + 1) / 2 ))', $launcher);
        $this->assertStringContainsString('TALOS_OCR_ENABLED=false', $rootEnvironment);
        $this->assertStringContainsString('TALOS_OCR_WORKER_TOKEN=', $rootEnvironment);
        $this->assertStringContainsString('TALOS_OCR_VLLM_API_KEY=', $rootEnvironment);
        $this->assertStringContainsString('TALOS_OCR_STARTUP_TIMEOUT_SECONDS=900', $rootEnvironment);
        $this->assertStringContainsString('TALOS_OCR_REQUEST_TIMEOUT_SECONDS=170', $rootEnvironment);
        $this->assertStringContainsString('TALOS_OCR_ENABLED=false', $controlPlaneEnvironment);
    }

    /** @param array{status: string, detail: string, blocking: bool} $ocr */
    private function pipelineHealth(array $ocr): TalosFilePipelineHealth
    {
        return new class($ocr) implements TalosFilePipelineHealth
        {
            /** @param array{status: string, detail: string, blocking: bool} $ocr */
            public function __construct(private readonly array $ocr) {}

            public function checks(): array
            {
                return [
                    'clamav' => ['status' => 'healthy', 'detail' => 'ClamAV 1.5.3 is available.'],
                    'tika' => ['status' => 'healthy', 'detail' => 'Apache Tika 3.3.1 is available.'],
                    'ocr' => $this->ocr,
                ];
            }
        };
    }

    private function configureHealthyExternalDependencies(): void
    {
        config([
            'app.key' => 'base64:'.base64_encode(str_repeat('a', 32)),
            'queue.default' => 'database',
            'services.talos.validator_health_url' => 'http://validator.test/health',
            'services.talos.browser.worker_url' => 'http://browser-worker.test',
            'services.talos.browser.worker_token' => 'test-browser-token',
        ]);
        Http::fake([
            'http://validator.test/health' => Http::response(['status' => 'healthy']),
            'http://browser-worker.test/ready' => Http::response([
                'data' => [
                    'status' => 'ready',
                    'runtime' => 'chromium',
                    'protocols' => ['hmi' => 'talos_browser_hmi_runtime_v2.1.0'],
                ],
            ]),
        ]);
    }

    private function composeService(string $compose, string $service): string
    {
        $normalized = str_replace("\r\n", "\n", $compose);
        $matched = preg_match(
            '/^  '.preg_quote($service, '/').':\n.*?(?=^  [a-zA-Z0-9_-]+:\n|^[a-zA-Z][a-zA-Z0-9_-]*:\n|\z)/ms',
            $normalized,
            $matches,
        );
        $this->assertSame(1, $matched, "Compose service [{$service}] is missing.");

        return $matches[0];
    }
}
