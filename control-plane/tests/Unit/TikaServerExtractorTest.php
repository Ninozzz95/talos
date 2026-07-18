<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Exceptions\TalosExtractionException;
use App\Services\FileIngestion\Extraction\TikaServerExtractor;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class TikaServerExtractorTest extends TestCase
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
        ]);
    }

    protected function tearDown(): void
    {
        foreach ($this->temporaryFiles as $path) {
            @unlink($path);
        }
        parent::tearDown();
    }

    public function test_validates_pinned_version_and_normalizes_recursive_metadata_text(): void
    {
        $file = $this->temporaryFile("%PDF-1.4\nTALOS PDF bytes\n%%EOF");
        Http::fake(function (Request $request) use ($file) {
            if (str_ends_with($request->url(), '/version')) {
                return Http::response('Apache Tika 3.3.1', 200, ['Content-Type' => 'text/plain']);
            }

            $this->assertSame('PUT', $request->method());
            $this->assertStringEndsWith('/rmeta/text', $request->url());
            $this->assertSame((string) file_get_contents($file), $request->body());
            $this->assertSame('application/json', $request->header('Accept')[0] ?? null);
            $this->assertSame('application/pdf', $request->header('Content-Type')[0] ?? null);

            return Http::response([
                [
                    'X-TIKA:content' => "Primary PDF sentinel\n",
                    'Content-Type' => 'application/pdf',
                    'xmpTPg:NPages' => '2',
                ],
                [
                    'X-TIKA:content' => 'Embedded sentinel',
                    'resourceName' => 'embedded.txt',
                    'Content-Type' => 'text/plain',
                ],
            ], 200, ['Content-Type' => 'application/json']);
        });

        $result = (new TikaServerExtractor)->extract($file, 'application/pdf');

        $this->assertSame("Primary PDF sentinel\n\nEmbedded sentinel", $result->text);
        $this->assertSame('apache_tika', $result->extractor);
        $this->assertSame('3.3.1', $result->extractorVersion);
        $this->assertFalse($result->requiresOcr);
        $this->assertSame(2, $result->metadata['page_count']);
        $this->assertSame(1, $result->metadata['embedded_count']);
        $this->assertSame('embedded.txt', $result->metadata['embedded_resources'][0]);
        Http::assertSentCount(2);
    }

    public function test_http_failure_malformed_shape_empty_output_and_output_budget_fail_closed(): void
    {
        $file = $this->temporaryFile("%PDF-1.4\nfixture\n%%EOF");

        $cases = [
            'version_mismatch' => ['TALOS_TIKA_VERSION_MISMATCH', 'Apache Tika 3.2.3', [], 200],
            'http_failure' => ['TALOS_TIKA_EXTRACTION_FAILED', 'Apache Tika 3.3.1', 'failed', 500],
            'malformed' => ['TALOS_TIKA_RESPONSE_MALFORMED', 'Apache Tika 3.3.1', ['not' => 'a list'], 200],
            'empty' => ['TALOS_TIKA_EMPTY_OUTPUT', 'Apache Tika 3.3.1', [['Content-Type' => 'application/pdf']], 200],
            'text_budget' => ['TALOS_FILE_EXTRACTED_TEXT_TOO_LARGE', 'Apache Tika 3.3.1', [['X-TIKA:content' => '12345']], 200],
            'response_budget' => ['TALOS_TIKA_RESPONSE_TOO_LARGE', 'Apache Tika 3.3.1', str_repeat('x', 128), 200],
        ];

        $activeCase = $cases['version_mismatch'];
        Http::fake(static function (Request $request) use (&$activeCase) {
            [, $versionBody, $extractBody, $extractStatus] = $activeCase;

            return str_ends_with($request->url(), '/version')
                ? Http::response($versionBody)
                : Http::response($extractBody, $extractStatus);
        });

        foreach ($cases as $name => [$expectedCode, $versionBody, $extractBody, $extractStatus]) {
            $activeCase = [$expectedCode, $versionBody, $extractBody, $extractStatus];
            config([
                'talos-files.tika.max_extracted_bytes' => $name === 'text_budget' ? 4 : 5 * 1024 * 1024,
                'talos-files.tika.max_response_bytes' => $name === 'response_budget' ? 64 : 10 * 1024 * 1024,
            ]);

            try {
                (new TikaServerExtractor)->extract($file, 'application/pdf');
                $this->fail("Expected Tika fault [{$expectedCode}] for [{$name}].");
            } catch (TalosExtractionException $exception) {
                $this->assertSame($expectedCode, $exception->errorCode, $name);
            }
        }
    }

    private function temporaryFile(string $contents): string
    {
        $path = tempnam(sys_get_temp_dir(), 'talos-tika-file-');
        $this->assertIsString($path);
        file_put_contents($path, $contents);
        $this->temporaryFiles[] = $path;

        return $path;
    }
}
