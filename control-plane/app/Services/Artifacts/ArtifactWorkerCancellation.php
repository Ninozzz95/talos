<?php

declare(strict_types=1);

namespace App\Services\Artifacts;

use JsonException;
use stdClass;

final readonly class ArtifactWorkerCancellation
{
    private function __construct(
        public string $requestId,
        public string $status,
    ) {}

    public static function fromJson(string $json, string $expectedRequestId): self
    {
        try {
            $value = json_decode($json, false, 8, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw ArtifactWorkerException::protocol('Artifact worker cancellation returned invalid JSON.');
        }
        if (! $value instanceof stdClass) {
            throw ArtifactWorkerException::protocol();
        }
        $keys = array_keys(get_object_vars($value));
        sort($keys);
        if ($keys !== ['contract', 'request_id', 'status']
            || $value->contract !== 'talos.artifact.cancellation.v1'
            || ! is_string($value->request_id)
            || ! hash_equals($expectedRequestId, $value->request_id)
            || $value->status !== 'cancellation_requested') {
            throw ArtifactWorkerException::protocol();
        }

        return new self($value->request_id, $value->status);
    }
}
