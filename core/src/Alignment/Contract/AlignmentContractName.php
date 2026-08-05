<?php

declare(strict_types=1);

namespace Kadmos\Alignment\Contract;

enum AlignmentContractName: string
{
    case ToolDefinition = 'tool-definition';
    case CapabilityPolicySet = 'capability-policy-set';
    case ModelCatalogEntry = 'model-catalog-entry';
    case ModelTransfer = 'model-transfer';
    case FileAuthorityGrant = 'file-authority-grant';
    case LibraryItem = 'library-item';

    public function schemaFile(): string
    {
        return $this->value.'.schema.json';
    }

    public function label(): string
    {
        return match ($this) {
            self::ToolDefinition => 'Tool definition',
            self::CapabilityPolicySet => 'Capability policy set',
            self::ModelCatalogEntry => 'Model catalog entry',
            self::ModelTransfer => 'Model transfer',
            self::FileAuthorityGrant => 'File authority grant',
            self::LibraryItem => 'Library item',
        };
    }
}
