<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Exceptions\TalosExtractionException;
use App\Services\FileIngestion\Extraction\PlainTextExtractor;
use Tests\TestCase;

final class PlainTextExtractorTest extends TestCase
{
    /** @var list<string> */
    private array $temporaryFiles = [];

    protected function setUp(): void
    {
        parent::setUp();
        config(['talos-files.tika.max_extracted_bytes' => 5 * 1024 * 1024]);
    }

    protected function tearDown(): void
    {
        foreach ($this->temporaryFiles as $path) {
            @unlink($path);
        }
        parent::tearDown();
    }

    public function test_json_is_canonical_and_invalid_json_fails_closed(): void
    {
        $extractor = new PlainTextExtractor;
        $valid = $this->temporaryFile('{"b":2,"a":[1,true]}');
        $invalid = $this->temporaryFile('{"broken":');

        $result = $extractor->extract($valid, 'application/json');

        $this->assertSame("{\n    \"b\": 2,\n    \"a\": [\n        1,\n        true\n    ]\n}", $result->text);
        $this->assertSame('talos_plain', $result->extractor);
        $this->assertSame('1', $result->extractorVersion);
        $this->assertFalse($result->requiresOcr);
        $this->assertSame('application/json', $result->metadata['content_type']);

        try {
            $extractor->extract($invalid, 'application/json');
            $this->fail('Invalid JSON must not silently become raw text.');
        } catch (TalosExtractionException $exception) {
            $this->assertSame('TALOS_FILE_JSON_INVALID', $exception->errorCode);
        }
    }

    public function test_plain_text_requires_utf8_and_respects_the_extracted_byte_budget(): void
    {
        $extractor = new PlainTextExtractor;
        $invalidUtf8 = $this->temporaryFile("valid\xC3\x28invalid");

        try {
            $extractor->extract($invalidUtf8, 'text/plain');
            $this->fail('Invalid UTF-8 must fail closed.');
        } catch (TalosExtractionException $exception) {
            $this->assertSame('TALOS_FILE_TEXT_ENCODING_INVALID', $exception->errorCode);
        }

        config(['talos-files.tika.max_extracted_bytes' => 4]);
        $tooLarge = $this->temporaryFile('12345');

        try {
            (new PlainTextExtractor)->extract($tooLarge, 'text/plain');
            $this->fail('Extracted text must obey its byte budget.');
        } catch (TalosExtractionException $exception) {
            $this->assertSame('TALOS_FILE_EXTRACTED_TEXT_TOO_LARGE', $exception->errorCode);
        }
    }

    private function temporaryFile(string $contents): string
    {
        $path = tempnam(sys_get_temp_dir(), 'talos-plain-extractor-');
        $this->assertIsString($path);
        file_put_contents($path, $contents);
        $this->temporaryFiles[] = $path;

        return $path;
    }
}
