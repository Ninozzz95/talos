<?php

declare(strict_types=1);

namespace App\Services\Policy;

enum TalosCapability: string
{
    case ARTIFACTS_GENERATE = 'artifacts.generate';
    case FILES_WRITE = 'files.write';
    case FILES_TRANSFER_TO_PROVIDER = 'files.transfer_to_provider';
    case WEB_SEARCH = 'web.search';
    case WEB_FETCH = 'web.fetch';
    case BROWSER_READ = 'browser.read';
    case BROWSER_WRITE = 'browser.write';
    case BROWSER_UPLOAD = 'browser.upload';
    case EMAIL_READ = 'email.read';
    case EMAIL_SEND = 'email.send';
    case CALENDAR_READ = 'calendar.read';
    case CALENDAR_WRITE = 'calendar.write';
    case FILESYSTEM_READ = 'filesystem.read';
    case FILESYSTEM_WRITE = 'filesystem.write';
    case INTEGRATIONS_EXTERNAL = 'integrations.external';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(
            static fn (self $capability): string => $capability->value,
            self::cases(),
        );
    }

    public function risk(): TalosCapabilityRisk
    {
        return match ($this) {
            self::WEB_SEARCH,
            self::WEB_FETCH,
            self::BROWSER_READ => TalosCapabilityRisk::LOW,

            self::ARTIFACTS_GENERATE,
            self::FILES_WRITE => TalosCapabilityRisk::MEDIUM,

            self::BROWSER_WRITE,
            self::EMAIL_READ,
            self::CALENDAR_READ,
            self::FILESYSTEM_READ,
            self::INTEGRATIONS_EXTERNAL => TalosCapabilityRisk::HIGH,

            self::FILES_TRANSFER_TO_PROVIDER,
            self::BROWSER_UPLOAD,
            self::EMAIL_SEND,
            self::CALENDAR_WRITE,
            self::FILESYSTEM_WRITE => TalosCapabilityRisk::CRITICAL,
        };
    }

    public function group(): string
    {
        return match ($this) {
            self::ARTIFACTS_GENERATE => 'artifacts',
            self::FILES_WRITE, self::FILES_TRANSFER_TO_PROVIDER => 'files',
            self::WEB_SEARCH, self::WEB_FETCH => 'web',
            self::BROWSER_READ, self::BROWSER_WRITE, self::BROWSER_UPLOAD => 'browser',
            self::EMAIL_READ, self::EMAIL_SEND => 'email',
            self::CALENDAR_READ, self::CALENDAR_WRITE => 'calendar',
            self::FILESYSTEM_READ, self::FILESYSTEM_WRITE => 'filesystem',
            self::INTEGRATIONS_EXTERNAL => 'integrations',
        };
    }

    public function label(): string
    {
        return match ($this) {
            self::ARTIFACTS_GENERATE => 'Generate artifacts',
            self::FILES_WRITE => 'Write TALOS files',
            self::FILES_TRANSFER_TO_PROVIDER => 'Transfer files to providers',
            self::WEB_SEARCH => 'Search the web',
            self::WEB_FETCH => 'Fetch web pages',
            self::BROWSER_READ => 'Read browser pages',
            self::BROWSER_WRITE => 'Interact with browser pages',
            self::BROWSER_UPLOAD => 'Upload files in the browser',
            self::EMAIL_READ => 'Read email',
            self::EMAIL_SEND => 'Send email',
            self::CALENDAR_READ => 'Read calendars',
            self::CALENDAR_WRITE => 'Change calendars',
            self::FILESYSTEM_READ => 'Read the host filesystem',
            self::FILESYSTEM_WRITE => 'Write the host filesystem',
            self::INTEGRATIONS_EXTERNAL => 'Use external integrations',
        };
    }

    public function description(): string
    {
        return match ($this) {
            self::ARTIFACTS_GENERATE => 'Generate managed documents or images.',
            self::FILES_WRITE => 'Create or change files inside TALOS-managed storage.',
            self::FILES_TRANSFER_TO_PROVIDER => 'Send selected file bytes to an external model provider.',
            self::WEB_SEARCH => 'Query a configured web-search provider.',
            self::WEB_FETCH => 'Fetch a public web resource.',
            self::BROWSER_READ => 'Navigate, inspect, snapshot, or screenshot a browser page.',
            self::BROWSER_WRITE => 'Click, type, submit, or otherwise change remote browser state.',
            self::BROWSER_UPLOAD => 'Upload an authorized user file through a browser page.',
            self::EMAIL_READ => 'Read data from a connected mailbox.',
            self::EMAIL_SEND => 'Send an external email.',
            self::CALENDAR_READ => 'Read data from a connected calendar.',
            self::CALENDAR_WRITE => 'Create or change external calendar data.',
            self::FILESYSTEM_READ => 'Read files outside TALOS-managed storage.',
            self::FILESYSTEM_WRITE => 'Write files outside TALOS-managed storage.',
            self::INTEGRATIONS_EXTERNAL => 'Invoke another external integration.',
        };
    }

    public function masterEnableEligible(): bool
    {
        return match ($this) {
            self::WEB_SEARCH, self::WEB_FETCH, self::BROWSER_READ => true,
            default => false,
        };
    }

    public function requiresRiskAcknowledgement(TalosCapabilityDecision $decision): bool
    {
        return $decision->allows() && $this->risk()->isHighOrCritical();
    }

    /** @return array<string, mixed> */
    public function toMetadataArray(): array
    {
        return [
            'capability' => $this->value,
            'group' => $this->group(),
            'label' => $this->label(),
            'description' => $this->description(),
            'risk' => $this->risk()->value,
            'master_enable_eligible' => $this->masterEnableEligible(),
        ];
    }
}
