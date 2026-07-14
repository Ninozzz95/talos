<?php

declare(strict_types=1);

namespace App\Services\Talos\Web;

interface WebSearchProvider
{
    /**
     * @param  array{language?: string, pageno?: int, time_range?: ?string, safesearch?: int}  $options
     */
    public function search(string $query, array $options = []): WebSearchResponse;
}
