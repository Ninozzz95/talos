<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Security\PublicHttpUrlPolicy;
use App\Services\Talos\Browser\TalosBrowserPolicy;
use App\Services\Talos\Browser\TalosBrowserUrlIntentResolver;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

final class TalosBrowserUrlIntentResolverTest extends TestCase
{
    #[Test]
    public function query_fragment_punctuation_and_trailing_prose_are_lossless(): void
    {
        $text = 'Analizza https://example.com/vehicles?q=city+car&sort=price#offers, poi riassumi.';

        $collection = $this->resolver()->resolve($text);
        $intent = $collection->singleAllowed();

        $this->assertNotNull($intent);
        $this->assertSame('https://example.com/vehicles?q=city+car&sort=price#offers', $intent->url);
        $this->assertSame($intent->raw, substr($text, $intent->startByte, $intent->endByte - $intent->startByte));
        $this->assertSame('Analizza', $intent->textBefore);
        $this->assertSame(', poi riassumi.', $intent->textAfter);
        $this->assertSame('inspect', $intent->classification);
        $this->assertGreaterThanOrEqual(0.9, $intent->confidence);
        $this->assertSame([], $collection->faults());
    }

    #[Test]
    public function lowercase_s_is_never_treated_as_the_whitespace_boundary(): void
    {
        $text = 'Visita https://stories.example/sessions?status=success#summary subito.';

        $intent = $this->resolver()->resolve($text)->singleAllowed();

        $this->assertNotNull($intent);
        $this->assertSame(
            'https://stories.example/sessions?status=success#summary',
            $intent->url,
        );
        $this->assertSame('subito.', $intent->textAfter);
    }

    #[Test]
    public function markdown_parentheses_and_ordered_multiple_urls_keep_exact_offsets(): void
    {
        $text = 'Confronta [prima](https://one.example/path_(x)?q=1) e <https://two.example/item?ref=a&b=2>.';

        $collection = $this->resolver()->resolve($text);
        $intents = $collection->intents();

        $this->assertCount(2, $intents);
        $this->assertSame([
            'https://one.example/path_(x)?q=1',
            'https://two.example/item?ref=a&b=2',
        ], array_map(static fn ($intent): string => $intent->url, $intents));
        $this->assertSame(['compare', 'compare'], array_map(static fn ($intent): string => $intent->classification, $intents));
        $this->assertLessThan($intents[1]->startByte, $intents[0]->startByte);
        foreach ($intents as $intent) {
            $this->assertSame($intent->raw, substr($text, $intent->startByte, $intent->endByte - $intent->startByte));
        }
        $this->assertTrue($collection->isAmbiguous());
        $this->assertNull($collection->singleAllowed());
    }

    #[Test]
    public function idn_is_normalized_to_ascii_and_resolved_against_the_psl(): void
    {
        $text = 'Apri https://b'."\u{00FC}".'cher.de/catalogo.';

        $intent = $this->resolver()->resolve($text)->singleAllowed();

        $this->assertNotNull($intent);
        $this->assertSame('https://xn--bcher-kva.de/catalogo', $intent->url);
        $this->assertSame('xn--bcher-kva.de', $intent->asciiHost);
        $this->assertSame('b'."\u{00FC}".'cher.de', $intent->unicodeHost);
        $this->assertSame('de', $intent->publicSuffix);
        $this->assertSame('xn--bcher-kva.de', $intent->registrableDomain);
    }

    #[Test]
    public function unsupported_scheme_credentials_and_malformed_port_are_faults(): void
    {
        $collection = $this->resolver()->resolve(
            'Apri ftp://example.com/a, https://user:pass@example.com/private e https://example.com:70000/path.',
        );

        $this->assertSame([], $collection->intents());
        $this->assertCount(3, $collection->faults());
        $this->assertSame([
            'ftp://example.com/a',
            'https://user:pass@example.com/private',
            'https://example.com:70000/path',
        ], array_map(static fn ($fault): string => $fault->raw, $collection->faults()));
        foreach ($collection->faults() as $fault) {
            $this->assertSame('invalid_or_unsupported_url', $fault->code);
        }
    }

    #[Test]
    public function localhost_metadata_private_and_mixed_dns_answers_fail_closed(): void
    {
        $resolver = $this->resolver(static fn (string $host): array => match ($host) {
            'public.example' => ['93.184.216.34', '127.0.0.1'],
            default => ['93.184.216.34'],
        });
        $collection = $resolver->resolve(implode(' ', [
            'http://localhost./',
            'http://metadata.google.internal/latest/meta-data',
            'http://169.254.169.254/latest/meta-data',
            'https://public.example/path',
        ]));

        $this->assertCount(4, $collection->intents());
        foreach ($collection->intents() as $intent) {
            $this->assertFalse($intent->allowed, $intent->url);
            $this->assertNotSame('allowed', $intent->policyReason, $intent->url);
        }
        $this->assertSame([], $collection->allowed());
    }

    private function resolver(?callable $dns = null): TalosBrowserUrlIntentResolver
    {
        $dns ??= static fn (string $host): array => ['93.184.216.34'];
        $publicPolicy = new PublicHttpUrlPolicy(resolver: $dns(...));

        return new TalosBrowserUrlIntentResolver(
            policy: new TalosBrowserPolicy(publicPolicy: $publicPolicy),
        );
    }
}
