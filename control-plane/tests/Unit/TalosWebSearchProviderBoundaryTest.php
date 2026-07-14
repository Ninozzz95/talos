<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Talos\Web\FakeWebSearchProvider;
use App\Services\Talos\Web\UnavailableWebSearchProvider;
use App\Services\Talos\Web\WebFetchResult;
use App\Services\Talos\Web\WebSearchResponse;
use App\Services\Talos\Web\WebSearchResult;
use ReflectionClass;
use Tests\TestCase;

final class TalosWebSearchProviderBoundaryTest extends TestCase
{
    public function test_unavailable_provider_never_claims_search_capability(): void
    {
        $response = (new UnavailableWebSearchProvider('provider_not_configured'))->search('current news');

        $this->assertFalse($response->available);
        $this->assertSame([], $response->results);
        $this->assertSame('provider_not_configured', $response->reason);
        $this->assertSame('untrusted_web_search', $response->provenance);
    }

    public function test_fake_provider_returns_only_the_injected_deterministic_response_and_records_calls(): void
    {
        $expected = WebSearchResponse::available([
            WebSearchResult::fromFields(
                title: 'Fixture result',
                url: 'https://example.com/result',
                snippet: 'Deterministic fixture content.',
                source: 'fixture',
                rank: 1,
                timestamp: '2026-07-13T08:00:00+00:00',
            ),
        ]);
        $provider = new FakeWebSearchProvider($expected);

        $actual = $provider->search('fixture query', ['language' => 'en']);

        $this->assertSame($expected, $actual);
        $this->assertSame([
            ['query' => 'fixture query', 'options' => ['language' => 'en']],
        ], $provider->calls());
    }

    public function test_search_result_factory_computes_evidence_from_the_exact_canonical_fields(): void
    {
        $result = WebSearchResult::fromFields(
            title: 'Bound result',
            url: 'https://example.com/result',
            snippet: 'Evidence text.',
            source: 'fixture',
            rank: 2,
            timestamp: '2026-07-13T08:00:00+00:00',
        );
        $expectedSource = [
            'title' => 'Bound result',
            'url' => 'https://example.com/result',
            'snippet' => 'Evidence text.',
            'source' => 'fixture',
            'rank' => 2,
            'timestamp' => '2026-07-13T08:00:00+00:00',
        ];

        $this->assertSame(
            'sha256:'.hash('sha256', json_encode($expectedSource, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)),
            $result->evidenceHash,
        );
        $this->assertFalse((new ReflectionClass(WebSearchResult::class))->getConstructor()?->isPublic());
    }

    public function test_fetch_result_factory_binds_byte_count_and_evidence_hash_to_the_raw_body(): void
    {
        $result = WebFetchResult::fromFetchedBody(
            url: 'https://example.com/page',
            contentType: 'text/html',
            content: 'Extracted text.',
            rawBody: '<p>Extracted text.</p>',
            fetchedAt: '2026-07-13T08:00:00+00:00',
            redirectChain: [],
        );

        $this->assertSame(strlen('<p>Extracted text.</p>'), $result->bytes);
        $this->assertSame('sha256:'.hash('sha256', '<p>Extracted text.</p>'), $result->evidenceHash);
        $this->assertTrue($result->untrusted);
        $this->assertFalse((new ReflectionClass(WebFetchResult::class))->getConstructor()?->isPublic());
    }
}
