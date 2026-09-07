<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Library\TalosLibraryCursor;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

final class TalosLibraryCursorTest extends TestCase
{
    /** @var array{kind: string, origin: null, query: string} */
    private array $filters = ['kind' => 'image', 'origin' => null, 'query' => 'road trip'];

    public function test_cursor_round_trips_the_owned_filter_bound_position(): void
    {
        $cursor = $this->app->make(TalosLibraryCursor::class);
        $occurredAt = CarbonImmutable::parse('2026-07-28T10:11:12.123456Z');

        $encoded = $cursor->encode(7, $this->filters, $occurredAt, 'item-7');
        $decoded = $cursor->decode($encoded, 7, $this->filters);

        self::assertSame('item-7', $decoded['id']);
        self::assertSame($occurredAt->format('Y-m-d\TH:i:s.u\Z'), $decoded['occurred_at']->format('Y-m-d\TH:i:s.u\Z'));
    }

    public function test_cursor_rejects_tampering_foreign_owner_and_cross_filter_reuse(): void
    {
        $cursor = $this->app->make(TalosLibraryCursor::class);
        $encoded = $cursor->encode(
            7,
            $this->filters,
            CarbonImmutable::parse('2026-07-28T10:11:12Z'),
            'item-7',
        );

        foreach ([
            'tampered' => [substr($encoded, 0, -2).'aa', 7, $this->filters],
            'foreign owner' => [$encoded, 8, $this->filters],
            'cross filter' => [$encoded, 7, ['kind' => 'file', 'origin' => null, 'query' => 'road trip']],
        ] as $scenario => [$candidate, $userId, $filters]) {
            try {
                $cursor->decode($candidate, $userId, $filters);
                self::fail("{$scenario} cursor should fail closed.");
            } catch (ValidationException $exception) {
                self::assertArrayHasKey('cursor', $exception->errors(), $scenario);
            }
        }
    }

    public function test_cursor_rejects_malformed_and_oversized_values(): void
    {
        $cursor = $this->app->make(TalosLibraryCursor::class);

        foreach (['', 'not-a-cursor', str_repeat('x', 5001)] as $candidate) {
            try {
                $cursor->decode($candidate, 7, $this->filters);
                self::fail('Malformed cursor should fail closed.');
            } catch (ValidationException $exception) {
                self::assertArrayHasKey('cursor', $exception->errors());
            }
        }
    }
}
