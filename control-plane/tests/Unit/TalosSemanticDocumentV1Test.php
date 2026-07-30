<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Artifacts\TalosArtifactGenerationException;
use App\Services\Artifacts\TalosSemanticDocumentV1;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

final class TalosSemanticDocumentV1Test extends TestCase
{
    public function test_accepts_the_complete_canonical_semantic_document_contract(): void
    {
        $document = TalosSemanticDocumentV1::fromRequestValue($this->validDocument());

        $this->assertSame('talos.semantic_document.v1', $document->toArray()['contract']);
        $this->assertSame('Revenue Q3', $document->toArray()['sheets'][0]['name']);
        $this->assertSame('Executive summary', $document->toArray()['slides'][0]['title']);
    }

    #[DataProvider('invalidShapeProvider')]
    public function test_rejects_unknown_keys_malformed_discriminators_and_executable_fields(
        callable $mutate,
    ): void {
        $value = $this->validDocument();
        $mutate($value);

        try {
            TalosSemanticDocumentV1::fromRequestValue($value);
            $this->fail('Malformed semantic documents must fail closed.');
        } catch (TalosArtifactGenerationException $exception) {
            $this->assertSame('TALOS_ARTIFACT_DOCUMENT_INVALID', $exception->errorCode);
            $this->assertSame(422, $exception->httpStatus);
        }
    }

    /**
     * @return iterable<string, array{callable(array<string, mixed>&): void}>
     */
    public static function invalidShapeProvider(): iterable
    {
        yield 'unknown root key' => [
            static function (array &$value): void {
                $value['html'] = '<script>alert(1)</script>';
            },
        ];
        yield 'unknown nested key' => [
            static function (array &$value): void {
                $value['sections'][0]['style'] = 'position:fixed';
            },
        ];
        yield 'unknown section discriminator' => [
            static function (array &$value): void {
                $value['sections'][0]['type'] = 'html';
            },
        ];
        yield 'row undeclared column' => [
            static function (array &$value): void {
                $value['sections'][3]['rows'][0]['formula'] = '=CMD()';
            },
        ];
        yield 'invalid sheet name' => [
            static function (array &$value): void {
                $value['sheets'][0]['name'] = 'Revenue/Q3';
            },
        ];
        yield 'wrong sheet width' => [
            static function (array &$value): void {
                $value['sheets'][0]['rows'][0][] = 'extra';
            },
        ];
    }

    public function test_enforces_all_structural_and_text_limits_before_worker_dispatch(): void
    {
        $document = $this->validDocument();
        $document['title'] = str_repeat('x', 241);

        $this->expectException(TalosArtifactGenerationException::class);
        $this->expectExceptionMessage('Semantic document');

        TalosSemanticDocumentV1::fromRequestValue($document);
    }

    public function test_canonical_json_is_deterministic_for_equivalent_input_key_order(): void
    {
        $first = $this->validDocument();
        $second = [
            'sections' => $first['sections'],
            'author' => $first['author'],
            'locale' => $first['locale'],
            'title' => $first['title'],
            'contract' => $first['contract'],
            'sheets' => $first['sheets'],
            'slides' => $first['slides'],
        ];

        $this->assertSame(
            TalosSemanticDocumentV1::fromRequestValue($first)->toCanonicalJson(),
            TalosSemanticDocumentV1::fromRequestValue($second)->toCanonicalJson(),
        );
    }

    /** @return array<string, mixed> */
    private function validDocument(): array
    {
        return [
            'contract' => 'talos.semantic_document.v1',
            'title' => 'Quarterly operating review',
            'locale' => 'en-US',
            'author' => 'TALOS',
            'sections' => [
                ['type' => 'heading', 'level' => 1, 'text' => 'Quarterly operating review'],
                ['type' => 'paragraph', 'text' => 'Evidence-backed performance summary.'],
                ['type' => 'bullets', 'ordered' => false, 'items' => ['Revenue grew', 'Risk declined']],
                [
                    'type' => 'table',
                    'columns' => [
                        ['key' => 'metric', 'label' => 'Metric'],
                        ['key' => 'value', 'label' => 'Value'],
                    ],
                    'rows' => [
                        ['metric' => 'Revenue', 'value' => 42.5],
                        ['metric' => 'Verified', 'value' => true],
                    ],
                ],
            ],
            'slides' => [
                ['title' => 'Executive summary', 'body' => 'Quarterly review.', 'bullets' => ['Verified']],
            ],
            'sheets' => [
                [
                    'name' => 'Revenue Q3',
                    'columns' => ['Metric', 'Value'],
                    'rows' => [['Revenue', 42.5], ['Verified', true]],
                ],
            ],
        ];
    }
}
