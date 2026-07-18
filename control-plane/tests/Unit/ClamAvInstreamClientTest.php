<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Exceptions\TalosMalwareScanException;
use App\Services\FileIngestion\Malware\ClamAvInstreamClient;
use Tests\TestCase;

final class ClamAvInstreamClientTest extends TestCase
{
    /** @var list<string> */
    private array $temporaryFiles = [];

    protected function tearDown(): void
    {
        foreach ($this->temporaryFiles as $path) {
            @unlink($path);
            @unlink($path.'.ready');
            @unlink($path.'.error');
        }

        parent::tearDown();
    }

    public function test_uses_nul_framed_version_and_instream_chunk_protocol(): void
    {
        $contents = str_repeat('chunked-clamav-payload-', 10);
        $file = $this->temporaryFile($contents);

        $this->withFixtureServer('clean', function (ClamAvInstreamClient $client, string $capturePath) use ($file, $contents): void {
            config(['talos-files.clamav.chunk_bytes' => 17]);
            $result = $client->scan($file);

            $this->assertSame('clean', $result->status);
            $this->assertSame('1.5.3', $result->engineVersion);
            $this->assertSame('27891', $result->signatureVersion);

            $capture = $this->waitForCapture($capturePath);
            $this->assertSame(['zVERSIONCOMMANDS', 'zINSTREAM'], $capture['commands']);
            $this->assertSame(hash('sha256', $contents), $capture['payload_sha256']);
            $this->assertSame(0, array_pop($capture['chunk_lengths']));
            foreach ($capture['chunk_lengths'] as $length) {
                $this->assertLessThanOrEqual(17, $length);
                $this->assertGreaterThan(0, $length);
            }
        });
    }

    public function test_normalizes_clean_and_infected_replies(): void
    {
        $file = $this->temporaryFile('malware protocol fixture');

        $this->withFixtureServer('infected', function (ClamAvInstreamClient $client) use ($file): void {
            $result = $client->scan($file);

            $this->assertSame('infected', $result->status);
            $this->assertSame('Eicar-Signature', $result->threat);
            $this->assertSame('1.5.3', $result->engineVersion);
            $this->assertSame('27891', $result->signatureVersion);
        });
    }

    public function test_timeout_version_drift_truncation_and_error_reply_fail_closed(): void
    {
        $file = $this->temporaryFile('fail closed fixture');

        foreach ([
            'timeout' => 'TALOS_CLAMAV_TIMEOUT',
            'version_drift' => 'TALOS_CLAMAV_VERSION_MISMATCH',
            'missing_instream' => 'TALOS_CLAMAV_PROTOCOL_UNSUPPORTED',
            'truncated' => 'TALOS_CLAMAV_RESPONSE_TRUNCATED',
            'error' => 'TALOS_CLAMAV_SCAN_ERROR',
            'malformed' => 'TALOS_CLAMAV_RESPONSE_MALFORMED',
        ] as $mode => $expectedCode) {
            $this->withFixtureServer($mode, function (ClamAvInstreamClient $client) use ($file, $expectedCode): void {
                try {
                    $client->scan($file);
                    $this->fail("Expected ClamAV fault [{$expectedCode}].");
                } catch (TalosMalwareScanException $exception) {
                    $this->assertSame($expectedCode, $exception->errorCode);
                }
            });
        }
    }

    private function withFixtureServer(string $mode, callable $assertion): void
    {
        $reservation = stream_socket_server('tcp://127.0.0.1:0', $errorCode, $errorMessage);
        $this->assertIsResource($reservation, "Could not reserve ClamAV fixture port: {$errorCode} {$errorMessage}");
        $address = stream_socket_get_name($reservation, false);
        fclose($reservation);
        $this->assertIsString($address);
        $port = (int) substr(strrchr($address, ':'), 1);

        $capturePath = tempnam(sys_get_temp_dir(), 'talos-clamd-capture-');
        $this->assertIsString($capturePath);
        @unlink($capturePath);
        $this->temporaryFiles[] = $capturePath;

        $fixture = dirname(__DIR__).'/fixtures/clamd-fixture-server.php';
        $nullDevice = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
        $process = proc_open(
            [PHP_BINARY, $fixture, (string) $port, $mode, $capturePath],
            [
                0 => ['file', $nullDevice, 'r'],
                1 => ['file', $nullDevice, 'a'],
                2 => ['file', $nullDevice, 'a'],
            ],
            $pipes,
            dirname($fixture),
        );
        $this->assertIsResource($process);

        try {
            $ready = false;
            for ($attempt = 0; $attempt < 100; $attempt++) {
                if (is_file($capturePath.'.ready')) {
                    $ready = true;
                    break;
                }
                usleep(20_000);
            }
            $this->assertTrue($ready, 'The ClamAV fixture server did not become ready.');

            config([
                'talos-files.clamav.host' => '127.0.0.1',
                'talos-files.clamav.port' => $port,
                'talos-files.clamav.connect_timeout_seconds' => 1,
                'talos-files.clamav.read_timeout_seconds' => 1,
                'talos-files.clamav.chunk_bytes' => 65_536,
                'talos-files.clamav.expected_version' => '1.5.3',
            ]);

            $assertion(new ClamAvInstreamClient, $capturePath);
        } finally {
            proc_terminate($process);
            proc_close($process);
        }
    }

    /** @return array<string, mixed> */
    private function waitForCapture(string $capturePath): array
    {
        for ($attempt = 0; $attempt < 100; $attempt++) {
            if (is_file($capturePath)) {
                $decoded = json_decode((string) file_get_contents($capturePath), true, flags: JSON_THROW_ON_ERROR);
                $this->assertIsArray($decoded);

                return $decoded;
            }
            usleep(20_000);
        }

        $this->fail('The ClamAV fixture did not persist its protocol capture.');
    }

    private function temporaryFile(string $contents): string
    {
        $path = tempnam(sys_get_temp_dir(), 'talos-clamd-file-');
        $this->assertIsString($path);
        file_put_contents($path, $contents);
        $this->temporaryFiles[] = $path;

        return $path;
    }
}
