<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Talos\Browser\BrowserWorkerConfiguration;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use RuntimeException;

final class BrowserWorkerProductionConfigurationTest extends TestCase
{
    public function test_non_production_environments_may_boot_without_a_worker(): void
    {
        (new BrowserWorkerConfiguration('', ''))->assertReadyFor('local');

        $this->addToAssertionCount(1);
    }

    #[DataProvider('invalidProductionConfigurationProvider')]
    public function test_production_fails_closed_for_invalid_worker_configuration(
        string $url,
        string $token,
        string $expectedMessage,
    ): void {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage($expectedMessage);

        (new BrowserWorkerConfiguration($url, $token))->assertReadyFor('production');
    }

    public function test_production_accepts_https_by_default_with_a_strong_shared_secret(): void
    {
        (new BrowserWorkerConfiguration(
            'https://browser-worker.example.internal',
            $this->strongToken(),
        ))->assertReadyFor('production');

        $this->addToAssertionCount(1);
    }

    public function test_production_accepts_http_only_with_the_explicit_insecure_internal_transport_opt_in(): void
    {
        (new BrowserWorkerConfiguration(
            'http://browser-worker:3100',
            $this->strongToken(),
            true,
        ))->assertReadyFor('production');

        $this->addToAssertionCount(1);
    }

    public function test_production_rejects_http_without_the_explicit_insecure_internal_transport_opt_in(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('TALOS_BROWSER_WORKER_ALLOW_INSECURE_INTERNAL_TRANSPORT');

        (new BrowserWorkerConfiguration(
            'http://browser-worker:3100',
            $this->strongToken(),
        ))->assertReadyFor('production');
    }

    private function strongToken(): string
    {
        return str_repeat('0123456789abcdef', 4);
    }

    /**
     * @return iterable<string, array{string, string, string}>
     */
    public static function invalidProductionConfigurationProvider(): iterable
    {
        yield 'missing URL' => ['', str_repeat('a', 64), 'TALOS_BROWSER_WORKER_URL is required'];
        yield 'invalid URL scheme' => ['file:///tmp/browser.sock', str_repeat('a', 64), 'must be an HTTP(S) URL'];
        yield 'missing host' => ['http:///ready', str_repeat('a', 64), 'must be an HTTP(S) URL'];
        yield 'missing token' => ['http://browser-worker:3100', '', 'TALOS_BROWSER_WORKER_TOKEN is required'];
        yield 'weak token' => ['https://browser-worker.example.internal', 'short-token', 'must contain at least 32 characters'];
        yield 'uniform repeated token' => ['https://browser-worker.example.internal', str_repeat('a', 64), 'estimated entropy'];
    }
}
