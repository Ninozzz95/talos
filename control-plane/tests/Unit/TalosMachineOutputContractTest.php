<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Talos\Agent\TalosMachineOutputContract;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class TalosMachineOutputContractTest extends TestCase
{
    public function test_it_detects_and_releases_an_explicit_json_array_contract(): void
    {
        $contract = TalosMachineOutputContract::fromPrompt(
            'Restituisci esclusivamente un array JSON con marca, modello e URL.',
        );

        $this->assertNotNull($contract);
        $this->assertSame('application/json', $contract->responseMimeType());
        $this->assertStringContainsString(
            '{"talos_output":[]}',
            $contract->systemInstruction(),
        );
        $this->assertSame(
            '[{"marca":"Opel","prezzo":15000.0}]',
            $contract->release('{"talos_output":[{"marca":"Opel","prezzo":15000.0}]}'),
        );
    }

    public function test_it_detects_and_releases_an_explicit_json_object_contract(): void
    {
        $contract = TalosMachineOutputContract::fromPrompt(
            'Return only a JSON object with the selected vehicle.',
        );

        $this->assertNotNull($contract);
        $this->assertStringContainsString(
            '{"talos_output":{}}',
            $contract->systemInstruction(),
        );
        $this->assertSame(
            '{"marca":"Opel"}',
            $contract->release('{"talos_output":{"marca":"Opel"}}'),
        );
    }

    public function test_it_ignores_json_requests_that_do_not_require_exclusive_machine_output(): void
    {
        $this->assertNull(TalosMachineOutputContract::fromPrompt(
            'Spiegami come funziona JSON e mostrami un esempio.',
        ));
    }

    public function test_it_does_not_misclassify_an_unrelated_only_verified_data_qualifier(): void
    {
        $this->assertNull(TalosMachineOutputContract::fromPrompt(
            'Use only verified data and explain the result as a JSON array.',
        ));
    }

    public function test_it_rejects_a_prompt_over_the_contract_byte_budget(): void
    {
        $this->expectException(InvalidArgumentException::class);

        TalosMachineOutputContract::fromPrompt(
            str_repeat('x', 262145).' Return only a JSON array.',
        );
    }

    #[DataProvider('invalidEnvelopeProvider')]
    public function test_it_fails_closed_for_invalid_or_mismatched_envelopes(
        string $prompt,
        string $providerText,
    ): void {
        $contract = TalosMachineOutputContract::fromPrompt($prompt);
        $this->assertNotNull($contract);

        $this->expectException(InvalidArgumentException::class);
        $contract->release($providerText);
    }

    /** @return iterable<string, array{string, string}> */
    public static function invalidEnvelopeProvider(): iterable
    {
        yield 'prose around envelope' => [
            'Restituisci soltanto un array JSON.',
            "Ecco il risultato:\n{\"talos_output\":[]}",
        ];
        yield 'direct requested value without envelope' => [
            'Restituisci soltanto un array JSON.',
            '[]',
        ];
        yield 'wrong requested root' => [
            'Restituisci soltanto un array JSON.',
            '{"talos_output":{"marca":"Opel"}}',
        ];
        yield 'extra envelope key' => [
            'Restituisci soltanto un array JSON.',
            '{"talos_output":[],"explanation":"none"}',
        ];
        yield 'malformed JSON' => [
            'Restituisci soltanto un array JSON.',
            '{"talos_output":[',
        ];
        yield 'object requested but list returned' => [
            'Return only a JSON object.',
            '{"talos_output":[]}',
        ];
    }
}
