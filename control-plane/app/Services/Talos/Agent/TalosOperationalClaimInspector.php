<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\Autolink\AutolinkExtension;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\Extension\CommonMark\Node\Inline\Image;
use League\CommonMark\Extension\CommonMark\Node\Inline\Link;
use League\CommonMark\Parser\MarkdownParser;
use Throwable;

final class TalosOperationalClaimInspector
{
    private readonly MarkdownParser $parser;

    public function __construct()
    {
        $environment = new Environment([
            'max_delimiters_per_line' => 500,
        ]);
        $environment->addExtension(new CommonMarkCoreExtension);
        $environment->addExtension(new AutolinkExtension);

        $this->parser = new MarkdownParser($environment);
    }

    /** @return list<string> */
    public function talosEvidenceIds(string $markdown): array
    {
        try {
            $document = $this->parser->parse($markdown);
        } catch (Throwable) {
            throw new TalosGroundingException(
                'TALOS_GROUNDING_OUTPUT_INVALID',
                'The provider response could not be validated as bounded Markdown.',
            );
        }

        $ids = [];
        foreach ($document->iterator() as $node) {
            if (! $node instanceof Link && ! $node instanceof Image) {
                continue;
            }

            $id = $this->evidenceIdFromUri($node->getUrl());
            if ($id !== null) {
                $ids[$id] = true;
            }
        }

        return array_keys($ids);
    }

    public function referencesTalosEvidence(string $markdown): bool
    {
        return $this->talosEvidenceIds($markdown) !== [];
    }

    private function evidenceIdFromUri(string $uri): ?string
    {
        $parts = parse_url($uri);
        if (! is_array($parts)) {
            return null;
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        if (in_array($scheme, ['talos-browser-artifact', 'talos-tool-evidence'], true)) {
            $identity = (string) ($parts['host'] ?? '');
            if ($identity === '') {
                $identity = ltrim((string) ($parts['path'] ?? ''), '/');
            }

            return $this->validIdentity($identity);
        }

        $host = strtolower(rtrim((string) ($parts['host'] ?? ''), '.'));
        $path = (string) ($parts['path'] ?? '');
        if (in_array($scheme, ['http', 'https'], true) && $host === 'talo.sh') {
            return $this->identityAtPath($path, ['artifact']);
        }

        if ($scheme === '' && $host === '') {
            return $this->identityAtPath($path, ['api', 'talos', 'browser', 'artifacts'], true)
                ?? $this->identityAtPath($path, ['api', 'talos', 'artifacts'], true);
        }

        return null;
    }

    /** @param list<string> $prefix */
    private function identityAtPath(string $path, array $prefix, bool $allowPreviewSuffix = false): ?string
    {
        $segments = array_values(array_filter(explode('/', trim($path, '/')), static fn (string $segment): bool => $segment !== ''));
        if (array_slice($segments, 0, count($prefix)) !== $prefix) {
            return null;
        }

        $expectedCount = count($prefix) + 1;
        if (count($segments) !== $expectedCount
            && (! $allowPreviewSuffix || count($segments) !== $expectedCount + 1 || $segments[$expectedCount] !== 'preview')) {
            return null;
        }

        return $this->validIdentity(rawurldecode($segments[count($prefix)] ?? ''));
    }

    private function validIdentity(string $identity): ?string
    {
        return preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/D', $identity) === 1
            ? $identity
            : null;
    }
}
