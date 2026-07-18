<?php

declare(strict_types=1);

namespace Kadmos\Provider;

use Kadmos\Tool\ToolContractGuard;

final readonly class ProviderCapabilities
{
    /** @param list<string> $limitations */
    public function __construct(
        public string $provider,
        public string $adapterVersion,
        public bool $nativeTools,
        public bool $parallelToolCalls,
        public bool $strictSchemas,
        public bool $statefulContinuation,
        public bool $reasoningContinuationState,
        public bool $imageToolResults,
        public string $source,
        public bool $modelVerified = false,
        public array $limitations = [],
        public bool $nativeInputImages = false,
        public bool $nativeInputDocuments = false,
    ) {
        ToolContractGuard::nonEmptyString($provider, 'Provider capability provider', 64);
        ToolContractGuard::nonEmptyString($adapterVersion, 'Provider capability adapter version', 128);
        ToolContractGuard::nonEmptyString($source, 'Provider capability source', 64);
        ToolContractGuard::listArray($limitations, 'Provider capability limitations');
        foreach ($limitations as $limitation) {
            ToolContractGuard::nonEmptyString($limitation, 'Provider capability limitation', 1024);
        }
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'provider' => $this->provider,
            'adapter_version' => $this->adapterVersion,
            'native_tools' => $this->nativeTools,
            'parallel_tool_calls' => $this->parallelToolCalls,
            'strict_schemas' => $this->strictSchemas,
            'stateful_continuation' => $this->statefulContinuation,
            'reasoning_continuation_state' => $this->reasoningContinuationState,
            'image_tool_results' => $this->imageToolResults,
            'native_input_images' => $this->nativeInputImages,
            'native_input_documents' => $this->nativeInputDocuments,
            'source' => $this->source,
            'model_verified' => $this->modelVerified,
            'limitations' => $this->limitations,
        ];
    }
}
