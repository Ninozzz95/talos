<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

final readonly class BrowserCapabilityManifest
{
    /**
     * @param list<BrowserCapability> $capabilities
     * @param array{max_tabs: int, max_viewport_width: int, max_viewport_height: int, max_artifact_bytes: int} $limits
     */
    private function __construct(
        public string $protocolVersion,
        public string $adapterName,
        public string $adapterVersion,
        public array $capabilities,
        public array $limits,
        public ?string $degradedReason,
    ) {}

    public static function fromJson(string $json): self
    {
        return self::fromValidatedArray(BrowserContractDecoder::decode($json, 'browser-capability-manifest', 'Browser capability manifest'));
    }

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value): self
    {
        return self::fromJson(BrowserContractDecoder::encodeServerArray($value, ['limits']));
    }

    public function supports(BrowserCapability $capability): bool
    {
        return in_array($capability, $this->capabilities, true);
    }

    /** @return array<string, mixed> */
    public function toCanonicalArray(): array
    {
        return [
            'schema_version' => BrowserContractVersion::CAPABILITIES,
            'protocol_version' => $this->protocolVersion,
            'adapter_name' => $this->adapterName,
            'adapter_version' => $this->adapterVersion,
            'capabilities' => array_map(static fn (BrowserCapability $capability): string => $capability->value, $this->capabilities),
            'limits' => BrowserContractGuard::object($this->limits),
            'degraded_reason' => $this->degradedReason,
        ];
    }

    /** @param array<string, mixed> $value */
    private static function fromValidatedArray(array $value): self
    {
        /** @var list<BrowserCapability> $capabilities */
        $capabilities = BrowserContractGuard::enumList($value['capabilities'], BrowserCapability::class, 'Browser capability');

        return new self(
            $value['protocol_version'],
            $value['adapter_name'],
            $value['adapter_version'],
            $capabilities,
            $value['limits'],
            $value['degraded_reason'],
        );
    }
}
