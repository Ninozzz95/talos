<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Exceptions\TalosExtractionException;
use App\Services\FileIngestion\Extraction\PlainTextExtractor;
use App\Services\FileIngestion\Extraction\TalosExtractorRegistry;
use App\Services\FileIngestion\Extraction\TalosFileExtractionPipeline;
use App\Services\FileIngestion\Extraction\TikaServerExtractor;
use App\Services\FileIngestion\Ocr\DisabledTalosOcrClient;
use App\Services\FileIngestion\Ocr\TalosOcrResult;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\Support\FakeTalosOcrClient;
use Tests\TestCase;

final class TalosFileExtractionPipelineTest extends TestCase
{
    /** @var list<string> */
    private array $temporaryFiles = [];

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'talos-files.tika.url' => 'http://tika.test:9998',
            'talos-files.tika.timeout_seconds' => 3,
            'talos-files.tika.max_response_bytes' => 10 * 1024 * 1024,
            'talos-files.tika.max_extracted_bytes' => 5 * 1024 * 1024,
            'talos-files.tika.expected_version' => '3.3.1',
            'talos-files.ocr.pdf_min_native_chars' => 32,
            'talos-files.ocr.pdf_min_native_chars_per_page' => 12,
        ]);
    }

    protected function tearDown(): void
    {
        foreach ($this->temporaryFiles as $path) {
            @unlink($path);
        }
        parent::tearDown();
    }

    public function test_image_routes_to_ocr_and_preserves_untrusted_page_provenance(): void
    {
        $ocr = new FakeTalosOcrClient(result: new TalosOcrResult(
            text: 'image OCR sentinel',
            metadata: ['pages' => [['index' => 1]], 'trust_level' => 'untrusted'],
            modelRevision: 'aaa02f3811945a91062062994c5c4a3f4c0af2b0',
        ));
        $path = $this->temporaryFile('image bytes');
        $sha256 = hash_file('sha256', $path);
        $this->assertIsString($sha256);

        $result = $this->pipeline($ocr)->extract($path, 'image/png', $sha256, 'owner-1');

        $this->assertSame('image OCR sentinel', $result->text);
        $this->assertSame('deepseek_ocr_2_vllm', $result->extractor);
        $this->assertTrue($result->requiresOcr);
        $this->assertSame('untrusted', $result->metadata['trust_level']);
        $this->assertSame([['index' => 1]], $result->metadata['pages']);
        $this->assertSame('owner-1', $ocr->calls[0]['owner_ref']);
        $this->assertSame($sha256, $ocr->calls[0]['source_sha256']);
    }

    public function test_pdf_with_sufficient_native_text_never_invokes_ocr(): void
    {
        $ocr = new FakeTalosOcrClient;
        $this->fakeTika(str_repeat('native PDF text ', 4), 1);
        $path = $this->temporaryFile('%PDF native sentinel %%EOF');
        $sha256 = hash_file('sha256', $path);
        $this->assertIsString($sha256);

        $result = $this->pipeline($ocr)->extract($path, 'application/pdf', $sha256, 'owner-2');

        $this->assertSame('apache_tika', $result->extractor);
        $this->assertFalse($result->requiresOcr);
        $this->assertSame([], $ocr->calls);
    }

    public function test_scanned_or_insufficient_pdf_falls_back_to_ocr(): void
    {
        foreach ([null, 'tiny'] as $nativeText) {
            $ocr = new FakeTalosOcrClient(result: new TalosOcrResult(
                text: 'scanned PDF OCR sentinel',
                metadata: ['pages' => [['index' => 1]], 'trust_level' => 'untrusted'],
                modelRevision: 'aaa02f3811945a91062062994c5c4a3f4c0af2b0',
            ));
            $this->fakeTika($nativeText, 2);
            $path = $this->temporaryFile('%PDF scanned sentinel %%EOF');
            $sha256 = hash_file('sha256', $path);
            $this->assertIsString($sha256);

            $result = $this->pipeline($ocr)->extract($path, 'application/pdf', $sha256, 'owner-3');

            $this->assertSame('scanned PDF OCR sentinel', $result->text);
            $this->assertTrue($result->requiresOcr);
            $this->assertCount(1, $ocr->calls);
        }
    }

    public function test_required_ocr_fails_explicitly_when_capability_is_disabled(): void
    {
        $path = $this->temporaryFile('image bytes');
        $sha256 = hash_file('sha256', $path);
        $this->assertIsString($sha256);

        try {
            $this->pipeline(new DisabledTalosOcrClient)->extract($path, 'image/png', $sha256, 'owner-4');
            $this->fail('Expected disabled OCR fault.');
        } catch (TalosExtractionException $exception) {
            $this->assertSame('TALOS_OCR_REQUIRED', $exception->errorCode);
        }
    }

    public function test_empty_office_document_never_uses_ocr_as_an_extraction_bypass(): void
    {
        $ocr = new FakeTalosOcrClient;
        $this->fakeTika(null, null);
        $path = $this->temporaryFile('office bytes');
        $sha256 = hash_file('sha256', $path);
        $this->assertIsString($sha256);

        try {
            $this->pipeline($ocr)->extract(
                $path,
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                $sha256,
                'owner-5',
            );
            $this->fail('Expected empty Office extraction fault.');
        } catch (TalosExtractionException $exception) {
            $this->assertSame('TALOS_TIKA_EMPTY_OUTPUT', $exception->errorCode);
            $this->assertSame([], $ocr->calls);
        }
    }

    private function pipeline(FakeTalosOcrClient|DisabledTalosOcrClient $ocr): TalosFileExtractionPipeline
    {
        return new TalosFileExtractionPipeline(
            new TalosExtractorRegistry(new PlainTextExtractor, new TikaServerExtractor),
            $ocr,
        );
    }

    private function fakeTika(?string $text, ?int $pageCount): void
    {
        Http::fake(static function (Request $request) use ($text, $pageCount) {
            if (str_ends_with($request->url(), '/version')) {
                return Http::response('Apache Tika 3.3.1');
            }

            $resource = [];
            if ($text !== null) {
                $resource['X-TIKA:content'] = $text;
            }
            if ($pageCount !== null) {
                $resource['xmpTPg:NPages'] = (string) $pageCount;
            }

            return Http::response([$resource]);
        });
    }

    private function temporaryFile(string $contents): string
    {
        $path = tempnam(sys_get_temp_dir(), 'talos-extraction-pipeline-');
        $this->assertIsString($path);
        file_put_contents($path, $contents);
        $this->temporaryFiles[] = $path;

        return $path;
    }
}

