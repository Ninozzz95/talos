<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Services\FileIngestion\Extraction\TikaServerExtractor;
use App\Services\FileIngestion\Malware\ClamAvInstreamClient;
use App\Services\FileIngestion\Ocr\DisabledTalosOcrClient;
use App\Services\FileIngestion\TalosFileSidecarHealth;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;
use ZipArchive;

#[Group('live-file-sidecars')]
final class TalosFileSidecarLiveTest extends TestCase
{
    /** @var list<string> */
    private array $temporaryFiles = [];

    protected function setUp(): void
    {
        parent::setUp();

        if (! filter_var(getenv('TALOS_FILE_SIDECAR_LIVE'), FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set TALOS_FILE_SIDECAR_LIVE=1 to run the real ClamAV and Apache Tika gates.');
        }

        config([
            'talos-files.max_upload_bytes' => 10 * 1024 * 1024,
            'talos-files.clamav.host' => $this->environment('TALOS_CLAMAV_HOST', '127.0.0.1'),
            'talos-files.clamav.port' => (int) $this->environment('TALOS_CLAMAV_PORT', '13310'),
            'talos-files.clamav.connect_timeout_seconds' => 3,
            'talos-files.clamav.read_timeout_seconds' => 30,
            'talos-files.clamav.chunk_bytes' => 65_536,
            'talos-files.clamav.expected_version' => '1.5.3',
            'talos-files.tika.url' => $this->environment('TALOS_TIKA_URL', 'http://127.0.0.1:19998'),
            'talos-files.tika.timeout_seconds' => 30,
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

    public function test_real_clamav_rejects_eicar_and_accepts_clean_text(): void
    {
        $scanner = new ClamAvInstreamClient;
        $clean = $scanner->scan($this->temporaryFile('TALOS clean ClamAV integration sentinel.'));
        $infected = $scanner->scan($this->temporaryFile(
            'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
        ));

        $this->assertSame('clean', $clean->status);
        $this->assertSame('1.5.3', $clean->engineVersion);
        $this->assertSame('infected', $infected->status);
        $this->assertIsString($infected->threat);
        $this->assertStringContainsStringIgnoringCase('eicar', $infected->threat);
    }

    public function test_real_tika_extracts_pdf_and_docx_sentinels_with_pinned_version(): void
    {
        $extractor = new TikaServerExtractor;
        $pdf = $extractor->extract(
            $this->temporaryFile($this->pdfDocument('TALOS PDF LIVE SENTINEL')),
            'application/pdf',
        );
        $docx = $extractor->extract(
            $this->docxDocument('TALOS DOCX LIVE SENTINEL'),
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        );

        $this->assertSame('apache_tika', $pdf->extractor);
        $this->assertSame('3.3.1', $pdf->extractorVersion);
        $this->assertStringContainsString('TALOS PDF LIVE SENTINEL', $pdf->text);
        $this->assertSame('apache_tika', $docx->extractor);
        $this->assertSame('3.3.1', $docx->extractorVersion);
        $this->assertStringContainsString('TALOS DOCX LIVE SENTINEL', $docx->text);

        $checks = (new TalosFileSidecarHealth(
            new ClamAvInstreamClient,
            $extractor,
            new DisabledTalosOcrClient,
        ))->checks();
        $this->assertSame('healthy', $checks['clamav']['status']);
        $this->assertSame('healthy', $checks['tika']['status']);
    }

    public function test_ocr_disabled_does_not_change_clamav_or_tika_live_gate(): void
    {
        $checks = (new TalosFileSidecarHealth(
            new ClamAvInstreamClient,
            new TikaServerExtractor,
            new DisabledTalosOcrClient,
        ))->checks();

        $this->assertSame('healthy', $checks['clamav']['status']);
        $this->assertSame('healthy', $checks['tika']['status']);
        $this->assertSame('disabled', $checks['ocr']['status']);
        $this->assertSame('OCR is disabled.', $checks['ocr']['detail']);
        $this->assertFalse($checks['ocr']['blocking']);
    }

    private function temporaryFile(string $contents): string
    {
        $path = tempnam(sys_get_temp_dir(), 'talos-live-sidecar-');
        $this->assertIsString($path);
        file_put_contents($path, $contents);
        $this->temporaryFiles[] = $path;

        return $path;
    }

    private function docxDocument(string $sentinel): string
    {
        $path = tempnam(sys_get_temp_dir(), 'talos-live-docx-');
        $this->assertIsString($path);
        @unlink($path);
        $path .= '.docx';

        $zip = new ZipArchive;
        $this->assertTrue($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE));
        $this->assertTrue($zip->addFromString('[Content_Types].xml', <<<'XML'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
XML));
        $this->assertTrue($zip->addFromString('_rels/.rels', <<<'XML'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
XML));
        $escaped = htmlspecialchars($sentinel, ENT_XML1 | ENT_QUOTES, 'UTF-8');
        $this->assertTrue($zip->addFromString('word/document.xml', <<<XML
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>{$escaped}</w:t></w:r></w:p></w:body>
</w:document>
XML));
        $this->assertTrue($zip->close());
        $this->temporaryFiles[] = $path;

        return $path;
    }

    private function pdfDocument(string $sentinel): string
    {
        $escaped = str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $sentinel);
        $stream = "BT /F1 18 Tf 72 720 Td ({$escaped}) Tj ET";
        $objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
            '<< /Length '.strlen($stream)." >>\nstream\n{$stream}\nendstream",
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        ];
        $pdf = "%PDF-1.4\n";
        $offsets = [0];
        foreach ($objects as $index => $object) {
            $offsets[] = strlen($pdf);
            $pdf .= ($index + 1)." 0 obj\n{$object}\nendobj\n";
        }
        $xref = strlen($pdf);
        $pdf .= "xref\n0 ".(count($objects) + 1)."\n0000000000 65535 f \n";
        foreach (array_slice($offsets, 1) as $offset) {
            $pdf .= sprintf("%010d 00000 n \n", $offset);
        }
        $pdf .= 'trailer << /Size '.(count($objects) + 1)." /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF\n";

        return $pdf;
    }

    private function environment(string $name, string $default): string
    {
        $value = getenv($name);

        return is_string($value) && trim($value) !== '' ? trim($value) : $default;
    }
}
