<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Exceptions\TalosFilePolicyException;
use App\Services\FileIngestion\TalosUploadPolicy;
use Tests\TestCase;
use ZipArchive;

final class TalosUploadPolicyTest extends TestCase
{
    /** @var list<string> */
    private array $temporaryFiles = [];

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'talos-files.max_upload_bytes' => 10 * 1024 * 1024,
            'talos-files.max_original_name_bytes' => 255,
            'talos-files.allowed_extensions' => ['txt', 'md', 'csv', 'json', 'pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg', 'webp'],
            'talos-files.archive.max_entries' => 2048,
            'talos-files.archive.max_expanded_bytes' => 50 * 1024 * 1024,
            'talos-files.archive.max_entry_bytes' => 25 * 1024 * 1024,
            'talos-files.archive.max_compression_ratio' => 100,
        ]);
    }

    protected function tearDown(): void
    {
        foreach ($this->temporaryFiles as $path) {
            @unlink($path);
        }

        parent::tearDown();
    }

    public function test_accepts_only_matching_text_pdf_and_structurally_valid_ooxml(): void
    {
        $policy = new TalosUploadPolicy;
        $text = $this->temporaryFile("TALOS sentinel text.\n");
        $pdf = $this->temporaryFile("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n");
        $docx = $this->ooxmlFile('word/document.xml', '<w:document>TALOS DOCX</w:document>');

        $textDecision = $policy->inspect($text, 'notes.txt', 'text/plain', filesize($text));
        $pdfDecision = $policy->inspect($pdf, 'report.pdf', 'application/pdf', filesize($pdf));
        $docxDecision = $policy->inspect(
            $docx,
            'report.docx',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            filesize($docx),
        );

        $this->assertSame('text/plain', $textDecision->detectedMime);
        $this->assertSame('txt', $textDecision->canonicalExtension);
        $this->assertSame('application/pdf', $pdfDecision->detectedMime);
        $this->assertSame('pdf', $pdfDecision->canonicalExtension);
        $this->assertSame('application/vnd.openxmlformats-officedocument.wordprocessingml.document', $docxDecision->detectedMime);
        $this->assertSame('docx', $docxDecision->canonicalExtension);
    }

    public function test_rejects_double_extension_null_byte_and_mime_spoof(): void
    {
        $policy = new TalosUploadPolicy;
        $plain = $this->temporaryFile('plain text pretending to be another format');

        $this->assertPolicyCode(
            'TALOS_FILE_NAME_AMBIGUOUS',
            fn () => $policy->inspect($plain, 'report.pdf.php', 'application/pdf', filesize($plain)),
        );
        $this->assertPolicyCode(
            'TALOS_FILE_NAME_AMBIGUOUS',
            fn () => $policy->inspect($plain, 'report.php.txt', 'text/plain', filesize($plain)),
        );
        $this->assertPolicyCode(
            'TALOS_FILE_NAME_INVALID',
            fn () => $policy->inspect($plain, "report\0.txt", 'text/plain', filesize($plain)),
        );
        $this->assertPolicyCode(
            'TALOS_FILE_TYPE_MISMATCH',
            fn () => $policy->inspect($plain, 'report.pdf', 'application/pdf', filesize($plain)),
        );
    }

    public function test_accepts_matching_png_jpeg_and_webp_and_rejects_spoofed_images(): void
    {
        $policy = new TalosUploadPolicy;
        $fixtures = [
            ['png', 'image/png', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='],
            ['jpg', 'image/jpeg', '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDxGiiitjI//9k='],
            ['webp', 'image/webp', 'UklGRi4AAABXRUJQVlA4ICIAAABwAQCdASoCAAIAAUAmJZQCdAFAAAD+/DeBV/fU6D4r4AAA'],
        ];

        foreach ($fixtures as [$extension, $mime, $encoded]) {
            $bytes = base64_decode($encoded, true);
            $this->assertIsString($bytes);
            $path = $this->temporaryFile($bytes);
            $decision = $policy->inspect($path, 'image.'.$extension, $mime, filesize($path));
            $this->assertSame($mime, $decision->detectedMime);
            $this->assertSame($extension, $decision->canonicalExtension);
        }

        $png = base64_decode($fixtures[0][2], true);
        $this->assertIsString($png);
        $spoof = $this->temporaryFile($png);
        $this->assertPolicyCode(
            'TALOS_FILE_TYPE_MISMATCH',
            fn () => $policy->inspect($spoof, 'spoof.jpg', 'image/jpeg', filesize($spoof)),
        );
    }

    public function test_rejects_archive_traversal_entry_count_expanded_size_and_ratio_budgets(): void
    {
        $policy = new TalosUploadPolicy;
        $traversal = $this->ooxmlFile('word/document.xml', '<w:document/>', [
            '../outside.txt' => 'escape',
        ]);

        $this->assertPolicyCode(
            'TALOS_FILE_ARCHIVE_PATH_INVALID',
            fn () => $policy->inspect($traversal, 'unsafe.docx', 'application/zip', filesize($traversal)),
        );

        config(['talos-files.archive.max_entries' => 3]);
        $tooManyEntries = $this->ooxmlFile('word/document.xml', '<w:document/>', [
            'word/a.xml' => 'a',
            'word/b.xml' => 'b',
        ]);
        $this->assertPolicyCode(
            'TALOS_FILE_ARCHIVE_ENTRY_LIMIT',
            fn () => (new TalosUploadPolicy)->inspect($tooManyEntries, 'many.docx', 'application/zip', filesize($tooManyEntries)),
        );

        config([
            'talos-files.archive.max_entries' => 2048,
            'talos-files.archive.max_entry_bytes' => 1024,
        ]);
        $largeEntry = $this->ooxmlFile('word/document.xml', str_repeat('A', 2048));
        $this->assertPolicyCode(
            'TALOS_FILE_ARCHIVE_ENTRY_TOO_LARGE',
            fn () => (new TalosUploadPolicy)->inspect($largeEntry, 'large.docx', 'application/zip', filesize($largeEntry)),
        );

        config([
            'talos-files.archive.max_entry_bytes' => 25 * 1024 * 1024,
            'talos-files.archive.max_expanded_bytes' => 4096,
        ]);
        $expanded = $this->ooxmlFile('word/document.xml', str_repeat('B', 5000));
        $this->assertPolicyCode(
            'TALOS_FILE_ARCHIVE_EXPANDED_LIMIT',
            fn () => (new TalosUploadPolicy)->inspect($expanded, 'expanded.docx', 'application/zip', filesize($expanded)),
        );

        config([
            'talos-files.archive.max_expanded_bytes' => 50 * 1024 * 1024,
            'talos-files.archive.max_compression_ratio' => 2,
        ]);
        $ratioBomb = $this->ooxmlFile('word/document.xml', str_repeat('C', 20_000));
        $this->assertPolicyCode(
            'TALOS_FILE_ARCHIVE_RATIO_LIMIT',
            fn () => (new TalosUploadPolicy)->inspect($ratioBomb, 'ratio.docx', 'application/zip', filesize($ratioBomb)),
        );
    }

    public function test_rejects_wrong_ooxml_family_or_missing_package_markers(): void
    {
        $policy = new TalosUploadPolicy;
        $wrongFamily = $this->ooxmlFile('xl/workbook.xml', '<workbook/>');
        $missingMarkers = $this->zipFile(['word/document.xml' => '<w:document/>']);

        $this->assertPolicyCode(
            'TALOS_FILE_OOXML_FAMILY_MISMATCH',
            fn () => $policy->inspect($wrongFamily, 'wrong.docx', 'application/zip', filesize($wrongFamily)),
        );
        $this->assertPolicyCode(
            'TALOS_FILE_OOXML_INVALID',
            fn () => $policy->inspect($missingMarkers, 'missing.docx', 'application/zip', filesize($missingMarkers)),
        );
    }

    public function test_upload_size_limit_fails_before_archive_processing(): void
    {
        config(['talos-files.max_upload_bytes' => 4]);
        $file = $this->temporaryFile('12345');

        $this->assertPolicyCode(
            'TALOS_FILE_TOO_LARGE',
            fn () => (new TalosUploadPolicy)->inspect($file, 'small.txt', 'text/plain', filesize($file)),
        );
    }

    private function temporaryFile(string $contents): string
    {
        $path = tempnam(sys_get_temp_dir(), 'talos-upload-');
        $this->assertIsString($path);
        file_put_contents($path, $contents);
        $this->temporaryFiles[] = $path;

        return $path;
    }

    /** @param array<string, string> $extraEntries */
    private function ooxmlFile(string $familyEntry, string $contents, array $extraEntries = []): string
    {
        return $this->zipFile([
            '[Content_Types].xml' => '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
            '_rels/.rels' => '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
            $familyEntry => $contents,
            ...$extraEntries,
        ]);
    }

    /** @param array<string, string> $entries */
    private function zipFile(array $entries): string
    {
        $path = tempnam(sys_get_temp_dir(), 'talos-ooxml-');
        $this->assertIsString($path);
        @unlink($path);
        $path .= '.zip';

        $zip = new ZipArchive;
        $this->assertTrue($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE));
        foreach ($entries as $name => $contents) {
            $this->assertTrue($zip->addFromString($name, $contents));
        }
        $this->assertTrue($zip->close());
        $this->temporaryFiles[] = $path;

        return $path;
    }

    private function assertPolicyCode(string $expectedCode, callable $operation): void
    {
        try {
            $operation();
            $this->fail("Expected file policy fault [{$expectedCode}].");
        } catch (TalosFilePolicyException $exception) {
            $this->assertSame($expectedCode, $exception->errorCode);
        }
    }
}
