<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class TalosReadinessTest extends TestCase
{
    use RefreshDatabase;

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

    public function test_production_browser_worker_healthcheck_pins_the_hmi_runtime_contract(): void
    {
        $compose = file_get_contents(base_path('../docker-compose.yml'));

        $this->assertIsString($compose);
        $this->assertStringContainsString('talos_browser_hmi_runtime_v2.1.0', $compose);
    }
}
