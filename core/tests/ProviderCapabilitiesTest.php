<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Provider\ProviderCapabilities;

function assertProviderCapabilities(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function testProviderCapabilitiesExposeNativeInputResourceSupport(): void
{
    $legacy = new ProviderCapabilities('test', 'test_v1', true, false, false, false, false, false, 'test');
    assertProviderCapabilities($legacy->nativeInputImages === false, 'Existing positional constructors must default image input support to false.');
    assertProviderCapabilities($legacy->nativeInputDocuments === false, 'Existing positional constructors must default document input support to false.');

    $native = new ProviderCapabilities(
        provider: 'test',
        adapterVersion: 'test_v2',
        nativeTools: true,
        parallelToolCalls: false,
        strictSchemas: false,
        statefulContinuation: false,
        reasoningContinuationState: false,
        imageToolResults: false,
        source: 'test',
        nativeInputImages: true,
        nativeInputDocuments: true,
    );
    $encoded = $native->toArray();
    assertProviderCapabilities(($encoded['native_input_images'] ?? null) === true, 'Image input support must be explicit in serialized capabilities.');
    assertProviderCapabilities(($encoded['native_input_documents'] ?? null) === true, 'Document input support must be explicit in serialized capabilities.');
}

testProviderCapabilitiesExposeNativeInputResourceSupport();
echo "testProviderCapabilitiesExposeNativeInputResourceSupport passed\n";
