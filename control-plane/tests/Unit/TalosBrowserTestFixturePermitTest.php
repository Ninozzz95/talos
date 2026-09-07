<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Talos\Browser\TalosBrowserPolicy;
use App\Services\Talos\Browser\TalosBrowserTestFixturePermit;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

final class TalosBrowserTestFixturePermitTest extends TestCase
{
    public function test_hj_cp_permit_001_is_disabled_when_absent_or_outside_testing(): void
    {
        $this->assertFalse(TalosBrowserTestFixturePermit::fromEnvironment(null, true)->enabled);
        $this->assertFalse(TalosBrowserTestFixturePermit::fromEnvironment('not-a-url', false)->enabled);
    }

    #[DataProvider('invalidTestingOrigins')]
    public function test_hj_cp_permit_001_rejects_malformed_or_broadened_testing_origins(string $origin): void
    {
        $this->expectException(RuntimeException::class);
        TalosBrowserTestFixturePermit::fromEnvironment($origin, true);
    }

    public function test_hj_cp_permit_002_testing_container_allows_only_the_exact_fixture_origin(): void
    {
        config(['services.talos.browser.test_fixture_origin' => 'http://127.0.0.1:43125']);
        $this->app->forgetInstance(TalosBrowserPolicy::class);

        $policy = $this->app->make(TalosBrowserPolicy::class);
        $allowed = $policy->inspect('http://127.0.0.1:43125/catalog?view=accessible');

        $this->assertTrue($allowed['allowed']);
        $this->assertSame('test fixture origin', $allowed['reason']);
        $this->assertSame('127.0.0.1', $allowed['host']);
        $this->assertSame(['127.0.0.1'], $allowed['resolved_ips']);

        foreach ([
            'http://127.0.0.1:43126/catalog',
            'http://127.1:43125/catalog',
            'http://2130706433:43125/catalog',
            'http://user:pass@127.0.0.1:43125/catalog',
            'https://127.0.0.1:43125/catalog',
            'http://localhost:43125/catalog',
            'http://169.254.169.254/latest/meta-data',
        ] as $blockedUrl) {
            $this->assertFalse($policy->inspect($blockedUrl)['allowed'], $blockedUrl);
        }
    }

    /** @return array<string, array{string}> */
    public static function invalidTestingOrigins(): array
    {
        return [
            'empty' => [''],
            'wildcard' => ['http://*:43125'],
            'localhost' => ['http://localhost:43125'],
            'alternate IPv4' => ['http://127.1:43125'],
            'credentialed' => ['http://user:pass@127.0.0.1:43125'],
            'path' => ['http://127.0.0.1:43125/path'],
            'query' => ['http://127.0.0.1:43125?query=1'],
            'fragment' => ['http://127.0.0.1:43125#fragment'],
            'privileged port' => ['http://127.0.0.1:80'],
            'port range' => ['http://127.0.0.1:1-65535'],
            'https' => ['https://127.0.0.1:43125'],
        ];
    }
}
