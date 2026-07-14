<?php

declare(strict_types=1);

namespace App\Services\Talos\Web;

final class FakeWebSearchProvider implements WebSearchProvider
{
    /** @var list<array{query: string, options: array<string, mixed>}> */
    private array $recordedCalls = [];

    public function __construct(private readonly WebSearchResponse $response) {}

    public function search(string $query, array $options = []): WebSearchResponse
    {
        $this->recordedCalls[] = [
            'query' => $query,
            'options' => $options,
        ];

        return $this->response;
    }

    /** @return list<array{query: string, options: array<string, mixed>}> */
    public function calls(): array
    {
        return $this->recordedCalls;
    }
}
