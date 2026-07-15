<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Talos\Browser\TalosBoundedBase64Decoder;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class TalosBoundedBase64DecoderTest extends TestCase
{
    public function test_it_accepts_a_canonical_payload_at_the_exact_decoded_limit(): void
    {
        $bytes = '12345';

        $this->assertSame($bytes, TalosBoundedBase64Decoder::decode(base64_encode($bytes), 5));
    }

    public function test_it_rejects_a_payload_whose_exact_decoded_length_exceeds_the_limit(): void
    {
        $this->assertFalse(TalosBoundedBase64Decoder::decode(base64_encode('123456'), 5));
    }

    #[DataProvider('malformedPayloads')]
    public function test_it_rejects_non_canonical_or_malformed_base64(string $payload): void
    {
        $this->assertFalse(TalosBoundedBase64Decoder::decode($payload, 32));
    }

    /** @return array<string, array{string}> */
    public static function malformedPayloads(): array
    {
        return [
            'empty' => [''],
            'unpadded' => ['YQ'],
            'whitespace' => ["YQ==\n"],
            'invalid alphabet' => ['Y!=='],
            'padding in body' => ['Y=Q='],
            'too much padding' => ['Y==='],
        ];
    }
}
