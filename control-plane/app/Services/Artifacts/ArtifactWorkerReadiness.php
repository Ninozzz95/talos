<?php

declare(strict_types=1);

namespace App\Services\Artifacts;

use JsonException;
use stdClass;

final readonly class ArtifactWorkerReadiness
{
    /** @var list<string> */
    private const FORMATS = ['docx', 'pdf', 'pptx', 'xlsx', 'thumbnail'];

    /** @var array<string, int> */
    private const LIMITS = [
        'max_output_bytes' => 25_000_000,
        'max_duration_ms' => 120_000,
        'max_sections' => 200,
        'max_rows' => 5_000,
        'max_slides' => 100,
        'max_input_pixels' => 16_000_000,
    ];

    /**
     * @param  list<string>  $formats
     * @param  array<string, int>  $limits
     */
    private function __construct(
        public string $status,
        public string $workerVersion,
        public int $protocolVersion,
        public array $formats,
        public array $limits,
    ) {}

    public static function fromJson(string $json): self
    {
        try {
            $value = json_decode($json, false, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw ArtifactWorkerException::protocol('Artifact worker readiness returned invalid JSON.');
        }

        if (! $value instanceof stdClass) {
            throw ArtifactWorkerException::protocol();
        }
        self::assertExactKeys(
            $value,
            ['contract', 'formats', 'limits', 'protocol_version', 'status', 'worker_version'],
        );
        if ($value->contract !== 'talos.artifact.readiness.v1'
            || ! is_string($value->status)
            || ! in_array($value->status, ['ready', 'degraded'], true)
            || ! is_string($value->worker_version)
            || preg_match('/^\d+\.\d+\.\d+$/', $value->worker_version) !== 1
            || $value->protocol_version !== 1) {
            throw ArtifactWorkerException::protocol('Artifact worker readiness is incompatible with protocol version 1.');
        }

        if (! is_array($value->formats)
            || $value->formats === []
            || count($value->formats) > count(self::FORMATS)
            || count(array_unique($value->formats, SORT_REGULAR)) !== count($value->formats)) {
            throw ArtifactWorkerException::protocol();
        }
        $formats = [];
        foreach ($value->formats as $format) {
            if (! is_string($format) || ! in_array($format, self::FORMATS, true)) {
                throw ArtifactWorkerException::protocol();
            }
            $formats[] = $format;
        }

        if (! $value->limits instanceof stdClass) {
            throw ArtifactWorkerException::protocol();
        }
        self::assertExactKeys($value->limits, array_keys(self::LIMITS));
        $limits = [];
        foreach (self::LIMITS as $key => $maximum) {
            $limit = $value->limits->{$key};
            if (! is_int($limit) || $limit < 1 || $limit > $maximum) {
                throw ArtifactWorkerException::protocol();
            }
            $limits[$key] = $limit;
        }

        return new self(
            $value->status,
            $value->worker_version,
            $value->protocol_version,
            $formats,
            $limits,
        );
    }

    /** @param list<string> $expected */
    private static function assertExactKeys(stdClass $value, array $expected): void
    {
        $actual = array_keys(get_object_vars($value));
        sort($actual);
        sort($expected);
        if ($actual !== $expected) {
            throw ArtifactWorkerException::protocol();
        }
    }
}
