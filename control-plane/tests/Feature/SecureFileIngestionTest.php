<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Exceptions\TalosMalwareScanException;
use App\Models\TalosFile;
use App\Services\FileIngestion\FileBenchmarkScenarioFactory;
use App\Services\FileIngestion\FileIngestionService;
use App\Services\FileIngestion\Malware\TalosMalwareScanner;
use App\Services\FileIngestion\Malware\TalosMalwareScanResult;
use App\Services\FileIngestion\TalosBenchmarkScenarioMaterializer;
use App\Services\FileIngestion\Ocr\TalosOcrClient;
use App\Services\FileIngestion\Ocr\TalosOcrResult;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\Support\CleanTalosMalwareScanner;
use Tests\Support\FailingTalosBenchmarkScenarioMaterializer;
use Tests\Support\FailOnSecondTalosBenchmarkScenarioMaterializer;
use Tests\Support\FakeTalosOcrClient;
use Tests\TestCase;
use ZipArchive;

final class SecureFileIngestionTest extends TestCase
{
    use RefreshDatabase;

    private CleanTalosMalwareScanner $scanner;

    /** @var list<string> */
    private array $temporaryFiles = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateTalosUser();
        $this->useIsolatedLocalStorage();

        $quarantineRoot = storage_path('framework/testing/talos-quarantine-'.uniqid());
        config([
            'filesystems.disks.talos_quarantine.root' => $quarantineRoot,
            'talos-files.max_upload_bytes' => 10 * 1024 * 1024,
        ]);
        Storage::forgetDisk('talos_quarantine');

        $this->scanner = new CleanTalosMalwareScanner;
        $this->app->instance(TalosMalwareScanner::class, $this->scanner);
    }

    protected function tearDown(): void
    {
        foreach ($this->temporaryFiles as $path) {
            @unlink($path);
        }
        parent::tearDown();
    }

    public function test_bytes_are_quarantined_under_a_server_name_before_scanning(): void
    {
        $response = $this->postJson('/api/files/ingest', [
            'file' => UploadedFile::fake()->createWithContent('workflow.txt', 'quarantine sentinel'),
        ])->assertCreated();

        $this->assertCount(1, $this->scanner->scannedPaths);
        $this->assertStringContainsString('talos-quarantine', str_replace('\\', '/', $this->scanner->scannedPaths[0]));
        $this->assertStringNotContainsString('workflow.txt', $this->scanner->scannedPaths[0]);

        $file = TalosFile::query()->findOrFail($response->json('data.id'));
        $this->assertSame('available', $file->status);
        $this->assertSame('clean', $file->scan_status);
        $this->assertSame('complete', $file->extraction_status);
        $this->assertSame('local', $file->storage_disk);
        Storage::disk('local')->assertExists($file->storage_path);
        $this->assertSame([], Storage::disk('talos_quarantine')->allFiles());
    }

    public function test_policy_rejection_never_reaches_scanner_extractor_or_context(): void
    {
        $response = $this->postJson('/api/files/ingest', [
            'file' => UploadedFile::fake()->createWithContent('spoofed.pdf', 'this is not a PDF'),
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonPath('error_code', 'TALOS_FILE_TYPE_MISMATCH')
            ->assertJsonPath('data.status', 'rejected');

        $this->assertSame([], $this->scanner->scannedPaths);
        $this->assertDatabaseCount('talos_file_chunks', 0);
        $this->assertDatabaseCount('talos_context_sets', 0);
        $this->assertDatabaseHas('talos_files', [
            'original_name' => 'spoofed.pdf',
            'status' => 'rejected',
            'scan_status' => 'not_run',
            'extraction_status' => 'not_run',
        ]);
    }

    public function test_policy_rejection_records_a_rejection_audit_event_instead_of_uploaded(): void
    {
        $response = $this->postJson('/api/files/ingest', [
            'file' => UploadedFile::fake()->createWithContent('spoofed.pdf', 'this is not a PDF'),
        ])->assertUnprocessable();

        $fileId = $response->json('data.id');
        $this->assertIsString($fileId);
        $this->assertDatabaseHas('talos_audit_events', [
            'event_type' => 'file.rejected',
            'subject_type' => 'file',
            'subject_id' => $fileId,
        ]);
        $this->assertDatabaseMissing('talos_audit_events', [
            'event_type' => 'file.uploaded',
            'subject_id' => $fileId,
        ]);
    }

    public function test_malware_or_scanner_failure_never_reaches_extraction(): void
    {
        $this->scanner->result = new TalosMalwareScanResult(
            status: 'infected',
            threat: 'Eicar-Signature',
            engineVersion: '1.5.3',
            signatureVersion: '27891',
        );

        $infected = $this->postJson('/api/files/ingest', [
            'file' => UploadedFile::fake()->createWithContent('infected.txt', 'runtime EICAR fixture substitute'),
        ]);

        $infected
            ->assertUnprocessable()
            ->assertJsonPath('error_code', 'TALOS_FILE_MALWARE_DETECTED')
            ->assertJsonPath('data.status', 'quarantined')
            ->assertJsonPath('data.scan_status', 'infected')
            ->assertJsonPath('data.extraction_status', 'not_run');
        $this->assertDatabaseCount('talos_file_chunks', 0);
        $this->assertNotSame([], Storage::disk('talos_quarantine')->allFiles());

        $this->scanner->result = null;
        $this->scanner->failure = new TalosMalwareScanException(
            'TALOS_CLAMAV_VERSION_MISMATCH',
            'The malware scanner version does not match the configured security pin.',
        );

        $failed = $this->postJson('/api/files/ingest', [
            'file' => UploadedFile::fake()->createWithContent('scanner-failed.txt', 'scanner failure sentinel'),
        ]);

        $failed
            ->assertServiceUnavailable()
            ->assertJsonPath('error_code', 'TALOS_CLAMAV_VERSION_MISMATCH')
            ->assertJsonPath('data.status', 'scanning_failed')
            ->assertJsonPath('data.scan_status', 'failed')
            ->assertJsonPath('data.extraction_status', 'not_run');
        $this->assertDatabaseCount('talos_file_chunks', 0);
        $this->assertDatabaseCount('talos_context_sets', 0);
    }

    public function test_file_changed_after_clean_scan_fails_before_extraction(): void
    {
        $this->scanner->afterScan = static function (string $absolutePath): void {
            file_put_contents($absolutePath, 'changed after the clean verdict');
        };

        $response = $this->postJson('/api/files/ingest', [
            'file' => UploadedFile::fake()->createWithContent('race.txt', 'original bytes scanned by ClamAV'),
        ]);

        $response
            ->assertServiceUnavailable()
            ->assertJsonPath('error_code', 'TALOS_FILE_CHANGED_AFTER_SCAN')
            ->assertJsonPath('data.status', 'scanning_failed')
            ->assertJsonPath('data.scan_status', 'failed')
            ->assertJsonPath('data.extraction_status', 'not_run');
        $this->assertDatabaseCount('talos_file_chunks', 0);
        $this->assertDatabaseCount('talos_context_sets', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_clean_pdf_and_ooxml_use_tika_then_promote_and_materialize_context(): void
    {
        config([
            'talos-files.tika.url' => 'http://tika.test:9998',
            'talos-files.tika.timeout_seconds' => 3,
            'talos-files.tika.max_response_bytes' => 10 * 1024 * 1024,
            'talos-files.tika.max_extracted_bytes' => 5 * 1024 * 1024,
            'talos-files.tika.expected_version' => '3.3.1',
        ]);
        Http::fake(function (Request $request) {
            if (str_ends_with($request->url(), '/version')) {
                return Http::response('Apache Tika 3.3.1');
            }

            $sentinel = str_starts_with($request->body(), '%PDF-')
                ? 'PDF extraction sentinel with sufficient native text'
                : 'DOCX extraction sentinel';

            return Http::response([[
                'X-TIKA:content' => $sentinel,
                'Content-Type' => $request->header('Content-Type')[0] ?? null,
            ]]);
        });

        $pdf = UploadedFile::fake()->createWithContent(
            'report.pdf',
            "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n",
        );
        $docxPath = $this->ooxmlFile();
        $docx = new UploadedFile(
            $docxPath,
            'report.docx',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            null,
            true,
        );

        $pdfResponse = $this->postJson('/api/files/ingest', ['file' => $pdf])
            ->assertCreated()
            ->assertJsonPath('data.extracted_text', 'PDF extraction sentinel with sufficient native text')
            ->assertJsonPath('data.extractor', 'apache_tika')
            ->assertJsonPath('data.extractor_version', '3.3.1');
        $docxResponse = $this->postJson('/api/files/ingest', ['file' => $docx])
            ->assertCreated()
            ->assertJsonPath('data.extracted_text', 'DOCX extraction sentinel')
            ->assertJsonPath('data.extractor', 'apache_tika')
            ->assertJsonPath('data.extractor_version', '3.3.1');

        $this->assertDatabaseHas('talos_file_chunks', ['file_id' => $pdfResponse->json('data.id')]);
        $this->assertDatabaseHas('talos_file_chunks', ['file_id' => $docxResponse->json('data.id')]);
        $this->assertDatabaseHas('talos_context_sets', ['name' => 'report.pdf', 'status' => 'available']);
        $this->assertDatabaseHas('talos_context_sets', ['name' => 'report.docx', 'status' => 'available']);
        $this->assertSame([], Storage::disk('talos_quarantine')->allFiles());
    }

    public function test_clean_image_is_scanned_ocr_extracted_promoted_and_materialized(): void
    {
        $ocr = new FakeTalosOcrClient(result: new TalosOcrResult(
            text: 'image OCR ingestion sentinel',
            metadata: ['trust_level' => 'untrusted', 'pages' => [['index' => 1]], 'provenance' => ['renderer' => 'pillow']],
            modelRevision: 'aaa02f3811945a91062062994c5c4a3f4c0af2b0',
        ));
        $this->app->instance(TalosOcrClient::class, $ocr);
        $png = base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            true,
        );
        $this->assertIsString($png);

        $response = $this->postJson('/api/files/ingest', [
            'file' => UploadedFile::fake()->createWithContent('receipt.png', $png),
        ])->assertCreated()
            ->assertJsonPath('data.status', 'available')
            ->assertJsonPath('data.scan_status', 'clean')
            ->assertJsonPath('data.extraction_status', 'complete')
            ->assertJsonPath('data.extractor', 'deepseek_ocr_2_vllm')
            ->assertJsonPath('data.extracted_text', 'image OCR ingestion sentinel')
            ->assertJsonPath('data.metadata.requires_ocr', true)
            ->assertJsonPath('data.metadata.extraction.trust_level', 'untrusted');

        $this->assertCount(1, $ocr->calls);
        $this->assertSame('image/png', $ocr->calls[0]['mime_type']);
        $this->assertDatabaseHas('talos_file_chunks', ['file_id' => $response->json('data.id')]);
        $this->assertDatabaseHas('talos_context_sets', ['name' => 'receipt.png', 'status' => 'available']);
        $this->assertSame([], Storage::disk('talos_quarantine')->allFiles());
    }

    public function test_scanned_pdf_falls_back_to_ocr_without_regressing_native_pdf(): void
    {
        config([
            'talos-files.tika.url' => 'http://tika.test:9998',
            'talos-files.tika.timeout_seconds' => 3,
            'talos-files.tika.max_response_bytes' => 10 * 1024 * 1024,
            'talos-files.tika.max_extracted_bytes' => 5 * 1024 * 1024,
            'talos-files.tika.expected_version' => '3.3.1',
            'talos-files.ocr.pdf_min_native_chars' => 32,
            'talos-files.ocr.pdf_min_native_chars_per_page' => 12,
        ]);
        Http::fake(static function (Request $request) {
            if (str_ends_with($request->url(), '/version')) {
                return Http::response('Apache Tika 3.3.1');
            }

            return Http::response([['xmpTPg:NPages' => '1']]);
        });
        $ocr = new FakeTalosOcrClient(result: new TalosOcrResult(
            text: 'scanned PDF ingestion sentinel',
            metadata: ['trust_level' => 'untrusted', 'pages' => [['index' => 1]], 'provenance' => ['renderer' => 'pypdfium2']],
            modelRevision: 'aaa02f3811945a91062062994c5c4a3f4c0af2b0',
        ));
        $this->app->instance(TalosOcrClient::class, $ocr);

        $response = $this->postJson('/api/files/ingest', [
            'file' => UploadedFile::fake()->createWithContent(
                'scan.pdf',
                "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n",
            ),
        ])->assertCreated()
            ->assertJsonPath('data.extractor', 'deepseek_ocr_2_vllm')
            ->assertJsonPath('data.extracted_text', 'scanned PDF ingestion sentinel')
            ->assertJsonPath('data.metadata.requires_ocr', true);

        $this->assertCount(1, $ocr->calls);
        $this->assertSame('application/pdf', $ocr->calls[0]['mime_type']);
        $this->assertDatabaseHas('talos_file_chunks', ['file_id' => $response->json('data.id')]);
    }

    public function test_database_materialization_failure_compensates_final_copy_and_retains_quarantine(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE TRIGGER talos_fail_chunk_materialization
            BEFORE INSERT ON talos_file_chunks
            BEGIN
                SELECT RAISE(ABORT, 'forced chunk materialization failure');
            END
            SQL);

        try {
            $response = $this->postJson('/api/files/ingest', [
                'file' => UploadedFile::fake()->createWithContent('rollback.txt', 'rollback sentinel'),
            ]);
        } finally {
            DB::unprepared('DROP TRIGGER IF EXISTS talos_fail_chunk_materialization');
        }

        $response
            ->assertServiceUnavailable()
            ->assertJsonPath('error_code', 'TALOS_FILE_EXTRACTION_FAILED')
            ->assertJsonPath('data.status', 'extraction_failed');

        $file = TalosFile::query()->findOrFail($response->json('data.id'));
        $this->assertSame('talos_quarantine', $file->storage_disk);
        Storage::disk('talos_quarantine')->assertExists($file->storage_path);
        $this->assertSame([], Storage::disk('local')->allFiles());
        $this->assertDatabaseCount('talos_file_chunks', 0);
        $this->assertDatabaseCount('talos_context_sets', 0);
    }

    public function test_initial_database_failure_discards_unowned_quarantine_bytes(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE TRIGGER talos_fail_file_ownership
            BEFORE INSERT ON talos_files
            BEGIN
                SELECT RAISE(ABORT, 'forced file ownership failure');
            END
            SQL);

        $failure = null;

        try {
            $this->app->make(FileIngestionService::class)->ingest(
                UploadedFile::fake()->createWithContent('orphan.txt', 'unowned quarantine sentinel'),
            );
        } catch (QueryException $exception) {
            $failure = $exception;
        } finally {
            DB::unprepared('DROP TRIGGER IF EXISTS talos_fail_file_ownership');
        }

        $this->assertInstanceOf(QueryException::class, $failure);
        $this->assertDatabaseCount('talos_files', 0);
        $this->assertSame([], Storage::disk('talos_quarantine')->allFiles());
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_indeterminate_ownership_probe_retains_quarantine_after_insert_ack_failure(): void
    {
        $failOwnershipProbe = false;
        $ownershipProbeFailed = false;

        TalosFile::created(static function () use (&$failOwnershipProbe): void {
            $failOwnershipProbe = true;

            throw new \RuntimeException('forced post-insert acknowledgement failure');
        });

        DB::connection()->beforeExecuting(static function (string $query) use (&$failOwnershipProbe, &$ownershipProbeFailed): void {
            $normalized = strtolower(ltrim($query));
            if (! $failOwnershipProbe
                || $ownershipProbeFailed
                || ! str_starts_with($normalized, 'select exists')
                || ! str_contains($normalized, 'talos_files')
            ) {
                return;
            }

            $ownershipProbeFailed = true;

            throw new \RuntimeException('forced ownership probe failure');
        });

        $failure = null;

        try {
            $this->app->make(FileIngestionService::class)->ingest(
                UploadedFile::fake()->createWithContent('indeterminate.txt', 'retained quarantine sentinel'),
            );
        } catch (\RuntimeException $exception) {
            $failure = $exception;
        }

        $this->assertInstanceOf(\RuntimeException::class, $failure);
        $this->assertSame('forced post-insert acknowledgement failure', $failure->getMessage());
        $this->assertTrue($ownershipProbeFailed);

        $file = TalosFile::query()->sole();
        $this->assertSame('talos_quarantine', $file->storage_disk);
        Storage::disk('talos_quarantine')->assertExists($file->storage_path);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_scenario_materialization_failure_compensates_final_copy_before_database_commit(): void
    {
        $this->app->instance(
            TalosBenchmarkScenarioMaterializer::class,
            new FailingTalosBenchmarkScenarioMaterializer,
        );

        $response = $this->postJson('/api/files/ingest', [
            'file' => UploadedFile::fake()->createWithContent('scenario-failure.txt', 'scenario failure sentinel'),
        ]);

        $response
            ->assertServiceUnavailable()
            ->assertJsonPath('error_code', 'TALOS_FILE_EXTRACTION_FAILED')
            ->assertJsonPath('data.status', 'extraction_failed');

        $file = TalosFile::query()->findOrFail($response->json('data.id'));
        $this->assertSame('talos_quarantine', $file->storage_disk);
        Storage::disk('talos_quarantine')->assertExists($file->storage_path);
        $this->assertSame([], Storage::disk('local')->allFiles());
        $this->assertDatabaseCount('talos_file_chunks', 0);
        $this->assertDatabaseCount('talos_context_sets', 0);
    }

    public function test_failed_duplicate_ingestion_preserves_prior_available_file_and_scenario(): void
    {
        $this->app->instance(
            TalosBenchmarkScenarioMaterializer::class,
            new FailOnSecondTalosBenchmarkScenarioMaterializer(
                $this->app->make(FileBenchmarkScenarioFactory::class),
            ),
        );

        $firstResponse = $this->postJson('/api/files/ingest', [
            'file' => UploadedFile::fake()->createWithContent('first.txt', 'shared bytes'),
        ])->assertCreated();
        $firstFile = TalosFile::query()->findOrFail($firstResponse->json('data.id'));
        $firstScenarioPath = $firstFile->metadata['benchmark_scenario_storage_path'] ?? null;
        $this->assertIsString($firstScenarioPath);

        $secondResponse = $this->postJson('/api/files/ingest', [
            'file' => UploadedFile::fake()->createWithContent('second.txt', 'shared bytes'),
        ])->assertServiceUnavailable();

        $secondFile = TalosFile::query()->findOrFail($secondResponse->json('data.id'));
        $this->assertSame('available', $firstFile->fresh()->status);
        $this->assertSame('extraction_failed', $secondFile->status);
        $this->assertNotSame($firstFile->storage_path, $secondFile->storage_path);
        Storage::disk('local')->assertExists($firstFile->storage_path);
        Storage::disk('local')->assertExists($firstScenarioPath);
        Storage::disk('talos_quarantine')->assertExists($secondFile->storage_path);
    }

    private function ooxmlFile(): string
    {
        $path = tempnam(sys_get_temp_dir(), 'talos-secure-docx-');
        $this->assertIsString($path);
        @unlink($path);
        $path .= '.docx';

        $zip = new ZipArchive;
        $this->assertTrue($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE));
        $this->assertTrue($zip->addFromString('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'));
        $this->assertTrue($zip->addFromString('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'));
        $this->assertTrue($zip->addFromString('word/document.xml', '<w:document>DOCX input sentinel</w:document>'));
        $this->assertTrue($zip->close());
        $this->temporaryFiles[] = $path;

        return $path;
    }
}
