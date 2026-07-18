<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Services\FileIngestion\Ocr\HttpDeepSeekOcrClient;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('live-ocr')]
final class TalosOcrSidecarLiveTest extends TestCase
{
    private const MODEL_REVISION = 'aaa02f3811945a91062062994c5c4a3f4c0af2b0';

    /** @var list<string> */
    private array $temporaryFiles = [];

    protected function setUp(): void
    {
        parent::setUp();

        if (! filter_var(getenv('TALOS_OCR_LIVE'), FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set TALOS_OCR_LIVE=1 to run the real DeepSeek OCR-2/vLLM gate.');
        }

        $token = trim((string) getenv('TALOS_OCR_WORKER_TOKEN'));
        $this->assertMatchesRegularExpression(
            '/^[0-9a-fA-F]{64,}$/',
            $token,
            'TALOS_OCR_WORKER_TOKEN must contain the credential generated for the live OCR stack.',
        );
        config([
            'talos-files.ocr.enabled' => true,
            'talos-files.ocr.url' => $this->environment('TALOS_OCR_URL', 'http://127.0.0.1:13200'),
            'talos-files.ocr.token' => $token,
            'talos-files.ocr.protocol' => 'talos.ocr.worker.v1',
            'talos-files.ocr.timeout_seconds' => 180,
            'talos-files.ocr.max_response_bytes' => 10 * 1024 * 1024,
            'talos-files.ocr.expected_model' => 'deepseek-ai/DeepSeek-OCR-2',
            'talos-files.ocr.expected_model_revision' => self::MODEL_REVISION,
            'talos-files.ocr.expected_served_model' => 'deepseek-ai/DeepSeek-OCR-2@'.self::MODEL_REVISION,
            'talos-files.ocr.expected_runtime_version' => '0.25.1',
            'talos-files.ocr.expected_pdf_renderer_version' => '5.12.1',
            'talos-files.ocr.expected_image_renderer_version' => '12.3.0',
            'talos-files.tika.max_extracted_bytes' => 5 * 1024 * 1024,
        ]);
    }

    protected function tearDown(): void
    {
        foreach ($this->temporaryFiles as $path) {
            @unlink($path);
        }

        parent::tearDown();
    }

    public function test_real_worker_extracts_image_and_pdf_sentinels_with_exact_provenance(): void
    {
        $client = new HttpDeepSeekOcrClient;
        $readiness = $client->readiness();
        $raster = $this->blockTextRaster('TALOS OCR LIVE');
        $png = $this->png($raster['width'], $raster['height'], $raster['rgb']);
        $pdf = $this->imagePdf($raster['width'], $raster['height'], $raster['rgb']);
        $imagePath = $this->temporaryFile($png);
        $pdfPath = $this->temporaryFile($pdf);
        $imageHash = hash('sha256', $png);
        $pdfHash = hash('sha256', $pdf);

        $image = $client->extract($imagePath, 'image/png', $imageHash, (string) Str::uuid());
        $document = $client->extract($pdfPath, 'application/pdf', $pdfHash, (string) Str::uuid());

        $this->assertSame('healthy', $readiness->status);
        $this->assertTrue($readiness->blocking);
        $this->assertStringContainsString('TALOS', strtoupper($image->text));
        $this->assertStringContainsString('TALOS', strtoupper($document->text));
        $this->assertExactProvenance($image->metadata, $imageHash, 'pillow', '12.3.0');
        $this->assertExactProvenance($document->metadata, $pdfHash, 'pypdfium2', '5.12.1');
        $this->assertSame(self::MODEL_REVISION, $image->modelRevision);
        $this->assertSame(self::MODEL_REVISION, $document->modelRevision);
    }

    /** @param array<string, mixed> $metadata */
    private function assertExactProvenance(
        array $metadata,
        string $sourceHash,
        string $renderer,
        string $rendererVersion,
    ): void {
        $this->assertSame('untrusted', $metadata['trust_level'] ?? null);
        $this->assertSame('talos.ocr.worker.v1', $metadata['protocol'] ?? null);
        $this->assertSame($sourceHash, $metadata['source_sha256'] ?? null);
        $this->assertSame('deepseek-ai/DeepSeek-OCR-2', $metadata['provenance']['model'] ?? null);
        $this->assertSame(self::MODEL_REVISION, $metadata['provenance']['model_revision'] ?? null);
        $this->assertSame('vllm', $metadata['provenance']['runtime'] ?? null);
        $this->assertSame('0.25.1', $metadata['provenance']['runtime_version'] ?? null);
        $this->assertSame($renderer, $metadata['provenance']['renderer'] ?? null);
        $this->assertSame($rendererVersion, $metadata['provenance']['renderer_version'] ?? null);
        $this->assertIsArray($metadata['pages'] ?? null);
        $this->assertNotEmpty($metadata['pages']);
        foreach ($metadata['pages'] as $page) {
            $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $page['image_sha256'] ?? '');
            $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $page['text_sha256'] ?? '');
        }
    }

    /** @return array{width: int, height: int, rgb: string} */
    private function blockTextRaster(string $text): array
    {
        $glyphs = [
            ' ' => ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
            'A' => ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
            'C' => ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
            'E' => ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
            'I' => ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
            'L' => ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
            'O' => ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
            'R' => ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
            'S' => ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
            'T' => ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
            'V' => ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
        ];
        $scale = 12;
        $margin = 24;
        $characters = str_split($text);
        $width = $margin * 2 + ((count($characters) * 6) - 1) * $scale;
        $height = $margin * 2 + 7 * $scale;
        $rgb = '';

        for ($y = 0; $y < $height; $y++) {
            for ($x = 0; $x < $width; $x++) {
                $glyphX = $x - $margin;
                $glyphY = $y - $margin;
                $black = false;
                if ($glyphX >= 0 && $glyphY >= 0 && $glyphY < 7 * $scale) {
                    $characterIndex = intdiv($glyphX, 6 * $scale);
                    $columnWithinCell = $glyphX % (6 * $scale);
                    if ($characterIndex < count($characters) && $columnWithinCell < 5 * $scale) {
                        $glyph = $glyphs[$characters[$characterIndex]] ?? $glyphs[' '];
                        $black = $glyph[intdiv($glyphY, $scale)][intdiv($columnWithinCell, $scale)] === '1';
                    }
                }
                $rgb .= $black ? "\x00\x00\x00" : "\xff\xff\xff";
            }
        }

        return ['width' => $width, 'height' => $height, 'rgb' => $rgb];
    }

    private function png(int $width, int $height, string $rgb): string
    {
        $scanlines = '';
        $stride = $width * 3;
        for ($row = 0; $row < $height; $row++) {
            $scanlines .= "\x00".substr($rgb, $row * $stride, $stride);
        }

        return "\x89PNG\r\n\x1a\n"
            .$this->pngChunk('IHDR', pack('NNCCCCC', $width, $height, 8, 2, 0, 0, 0))
            .$this->pngChunk('IDAT', gzcompress($scanlines, 9))
            .$this->pngChunk('IEND', '');
    }

    private function pngChunk(string $type, string $contents): string
    {
        return pack('N', strlen($contents)).$type.$contents.pack('N', crc32($type.$contents));
    }

    private function imagePdf(int $width, int $height, string $rgb): string
    {
        $compressed = gzcompress($rgb, 9);
        $content = "q {$width} 0 0 {$height} 0 0 cm /Im0 Do Q";
        $objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {$width} {$height}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>",
            '<< /Length '.strlen($content).">>\nstream\n{$content}\nendstream",
            "<< /Type /XObject /Subtype /Image /Width {$width} /Height {$height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ".strlen($compressed).">>\nstream\n{$compressed}\nendstream",
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

        return $pdf.'trailer << /Size '.(count($objects) + 1)." /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF\n";
    }

    private function temporaryFile(string $contents): string
    {
        $path = tempnam(sys_get_temp_dir(), 'talos-live-ocr-');
        $this->assertIsString($path);
        file_put_contents($path, $contents);
        $this->temporaryFiles[] = $path;

        return $path;
    }

    private function environment(string $name, string $default): string
    {
        $value = getenv($name);

        return is_string($value) && trim($value) !== '' ? trim($value) : $default;
    }
}
