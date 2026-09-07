<?php

declare(strict_types=1);

namespace App\Services\Library;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Validation\ValidationException;
use Throwable;

final class TalosLibraryCursor
{
    private const VERSION = 1;

    private const MAX_CURSOR_BYTES = 4096;

    /** @param array<string, mixed> $filters */
    public function encode(int $userId, array $filters, CarbonInterface $occurredAt, string $id): string
    {
        $payload = json_encode([
            'version' => self::VERSION,
            'user_id' => $userId,
            'filters_hash' => $this->filtersHash($filters),
            'occurred_at' => $occurredAt->copy()->utc()->format('Y-m-d\TH:i:s.u\Z'),
            'id' => $id,
        ], JSON_THROW_ON_ERROR);

        return Crypt::encryptString($payload);
    }

    /**
     * @param array<string, mixed> $filters
     * @return array{occurred_at: CarbonImmutable, id: string}
     */
    public function decode(string $cursor, int $userId, array $filters): array
    {
        try {
            if ($cursor === '' || strlen($cursor) > self::MAX_CURSOR_BYTES) {
                throw new \RuntimeException('Cursor length is invalid.');
            }
            $payload = json_decode(Crypt::decryptString($cursor), true, flags: JSON_THROW_ON_ERROR);
            if (! is_array($payload)
                || array_is_list($payload)
                || array_keys($payload) !== ['version', 'user_id', 'filters_hash', 'occurred_at', 'id']
                || ($payload['version'] ?? null) !== self::VERSION
                || ($payload['user_id'] ?? null) !== $userId
                || ! is_string($payload['filters_hash'] ?? null)
                || ! hash_equals($this->filtersHash($filters), $payload['filters_hash'])
                || ! is_string($payload['occurred_at'] ?? null)
                || ! is_string($payload['id'] ?? null)
                || trim($payload['id']) === ''
                || strlen($payload['id']) > 255) {
                throw new \RuntimeException('Cursor payload is invalid.');
            }

            $occurredAt = CarbonImmutable::createFromFormat(
                'Y-m-d\TH:i:s.u\Z',
                $payload['occurred_at'],
                'UTC',
            );
            if (! $occurredAt instanceof CarbonImmutable) {
                throw new \RuntimeException('Cursor time is invalid.');
            }

            return ['occurred_at' => $occurredAt, 'id' => $payload['id']];
        } catch (Throwable) {
            throw ValidationException::withMessages([
                'cursor' => ['The Library cursor is invalid for this request.'],
            ]);
        }
    }

    /** @param array<string, mixed> $filters */
    private function filtersHash(array $filters): string
    {
        ksort($filters);

        return hash('sha256', json_encode($filters, JSON_THROW_ON_ERROR));
    }
}
