<?php

declare(strict_types=1);

namespace App\Services\Talos\Web;

use InvalidArgumentException;

final readonly class UnavailableWebSearchProvider implements WebSearchProvider
{
    public function __construct(private string $reason = 'provider_not_configured')
    {
        if (trim($this->reason) === '' || strlen($this->reason) > 128) {
            throw new InvalidArgumentException('Unavailable search provider reason is invalid.');
        }
    }

    public function search(string $query, array $options = []): WebSearchResponse
    {
        return WebSearchResponse::unavailable($this->reason);
    }
}
