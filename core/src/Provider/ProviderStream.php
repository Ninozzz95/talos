<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use IteratorAggregate;
use Kadmos\Tool\ProviderTurnResponse;
use LogicException;
use Traversable;
use UnexpectedValueException;

/** @implements IteratorAggregate<int, ProviderStreamEvent> */
final class ProviderStream implements IteratorAggregate
{
    private bool $started = false;
    private bool $completed = false;
    private ?ProviderTurnResponse $outcome = null;

    /** @param iterable<string> $chunks */
    public function __construct(
        private readonly iterable $chunks,
        private readonly ProviderStreamDecoder $decoder,
    ) {}

    public function getIterator(): Traversable
    {
        if ($this->started) {
            throw new LogicException('Provider streams are single-use.');
        }
        $this->started = true;

        $lastSequence = 0;
        try {
            foreach ($this->chunks as $chunk) {
                if (! is_string($chunk)) {
                    throw new UnexpectedValueException('Provider stream transport yielded a non-string chunk.');
                }
                foreach ($this->decoder->push($chunk) as $event) {
                    if (! $event instanceof ProviderStreamEvent) {
                        throw new UnexpectedValueException('Provider stream decoder yielded an invalid event.');
                    }
                    if ($event->isTerminal()) {
                        throw new LogicException('Provider stream decoders cannot emit terminal events before finalization.');
                    }
                    if ($event->sequence !== $lastSequence + 1) {
                        throw new LogicException('Provider stream event sequences must be contiguous.');
                    }
                    $lastSequence = $event->sequence;
                    yield $event;
                }
            }
        } catch (ProviderStreamCancelledException $exception) {
            yield new ProviderStreamEvent(
                ProviderStreamEvent::CANCELLED,
                $lastSequence + 1,
                ['reason' => $exception->reason],
            );
            $this->completed = true;

            return;
        }

        $this->outcome = $this->decoder->finish();
        yield ProviderStreamEvent::fromOutcome($lastSequence + 1, $this->outcome);
        $this->completed = true;
    }

    public function finalOutcome(): ProviderTurnResponse
    {
        if (! $this->completed || ! $this->outcome instanceof ProviderTurnResponse) {
            throw new LogicException('Provider stream final outcome is unavailable before complete consumption.');
        }

        return $this->outcome;
    }
}
