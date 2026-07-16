<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use InvalidArgumentException;

final readonly class TalosBrowserUrlIntentCollection
{
    /**
     * @param  list<TalosBrowserUrlIntent>  $urlIntents
     * @param  list<TalosBrowserUrlIntentFault>  $urlFaults
     */
    public function __construct(private array $urlIntents, private array $urlFaults)
    {
        foreach ($urlIntents as $intent) {
            if (! $intent instanceof TalosBrowserUrlIntent) {
                throw new InvalidArgumentException('Browser URL intents must be typed values.');
            }
        }
        foreach ($urlFaults as $fault) {
            if (! $fault instanceof TalosBrowserUrlIntentFault) {
                throw new InvalidArgumentException('Browser URL intent faults must be typed values.');
            }
        }
    }

    /** @return list<TalosBrowserUrlIntent> */
    public function intents(): array
    {
        return $this->urlIntents;
    }

    /** @return list<TalosBrowserUrlIntentFault> */
    public function faults(): array
    {
        return $this->urlFaults;
    }

    /** @return list<TalosBrowserUrlIntent> */
    public function allowed(): array
    {
        return array_values(array_filter(
            $this->urlIntents,
            static fn (TalosBrowserUrlIntent $intent): bool => $intent->allowed,
        ));
    }

    public function singleAllowed(): ?TalosBrowserUrlIntent
    {
        $allowed = $this->allowed();

        return count($allowed) === 1 ? $allowed[0] : null;
    }

    public function isAmbiguous(): bool
    {
        return count($this->allowed()) > 1;
    }

    /** @return array{intents: list<array<string, mixed>>, faults: list<array<string, mixed>>, ambiguous: bool} */
    public function toSafeArray(): array
    {
        return [
            'intents' => array_map(
                static fn (TalosBrowserUrlIntent $intent): array => $intent->toSafeArray(),
                $this->urlIntents,
            ),
            'faults' => array_map(
                static fn (TalosBrowserUrlIntentFault $fault): array => $fault->toSafeArray(),
                $this->urlFaults,
            ),
            'ambiguous' => $this->isAmbiguous(),
        ];
    }
}
