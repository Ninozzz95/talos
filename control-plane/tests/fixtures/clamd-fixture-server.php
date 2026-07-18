<?php

declare(strict_types=1);

$port = (int) ($argv[1] ?? 0);
$mode = (string) ($argv[2] ?? 'clean');
$capturePath = (string) ($argv[3] ?? '');

if ($port <= 0 || $capturePath === '') {
    exit(2);
}

$server = stream_socket_server("tcp://127.0.0.1:{$port}", $errorCode, $errorMessage);
if (! is_resource($server)) {
    file_put_contents($capturePath . '.error', "{$errorCode}:{$errorMessage}");
    exit(3);
}

file_put_contents($capturePath . '.ready', 'ready');
$capture = ['mode' => $mode, 'commands' => [], 'payload_sha256' => null, 'chunk_lengths' => []];

/** @return string|false */
function readNulRecord($connection)
{
    $record = '';
    while (! feof($connection)) {
        $byte = fread($connection, 1);
        if ($byte === false || $byte === '') {
            break;
        }
        if ($byte === "\0") {
            return $record;
        }
        $record .= $byte;
    }

    return false;
}

/** @return string|false */
function readExact($connection, int $length)
{
    $value = '';
    while (strlen($value) < $length && ! feof($connection)) {
        $chunk = fread($connection, $length - strlen($value));
        if ($chunk === false || $chunk === '') {
            break;
        }
        $value .= $chunk;
    }

    return strlen($value) === $length ? $value : false;
}

$versionConnection = @stream_socket_accept($server, 10);
if (! is_resource($versionConnection)) {
    fclose($server);
    exit(4);
}
$versionCommand = readNulRecord($versionConnection);
$capture['commands'][] = $versionCommand;

if ($mode === 'timeout') {
    sleep(3);
    fclose($versionConnection);
    file_put_contents($capturePath, json_encode($capture, JSON_THROW_ON_ERROR));
    fclose($server);
    exit(0);
}

$version = $mode === 'version_drift' ? '1.4.5' : '1.5.3';
$commands = $mode === 'missing_instream' ? 'PING VERSION' : 'PING VERSION INSTREAM';
fwrite($versionConnection, "ClamAV {$version}/27891/Fri Jul 17 00:00:00 2026\nCOMMANDS: {$commands}\0");
fclose($versionConnection);

if (in_array($mode, ['version_drift', 'missing_instream'], true)) {
    file_put_contents($capturePath, json_encode($capture, JSON_THROW_ON_ERROR));
    fclose($server);
    exit(0);
}

$scanConnection = @stream_socket_accept($server, 10);
if (! is_resource($scanConnection)) {
    file_put_contents($capturePath, json_encode($capture, JSON_THROW_ON_ERROR));
    fclose($server);
    exit(5);
}
$capture['commands'][] = readNulRecord($scanConnection);
$payload = '';

while (true) {
    $lengthBytes = readExact($scanConnection, 4);
    if (! is_string($lengthBytes)) {
        break;
    }
    $length = unpack('Nlength', $lengthBytes)['length'];
    $capture['chunk_lengths'][] = $length;
    if ($length === 0) {
        break;
    }
    $chunk = readExact($scanConnection, $length);
    if (! is_string($chunk)) {
        break;
    }
    $payload .= $chunk;
}

$capture['payload_sha256'] = hash('sha256', $payload);

match ($mode) {
    'infected' => fwrite($scanConnection, "stream: Eicar-Signature FOUND\0"),
    'error' => fwrite($scanConnection, "stream: temporary scanner failure ERROR\0"),
    'malformed' => fwrite($scanConnection, "not-a-clamd-result\0"),
    'truncated' => fwrite($scanConnection, 'stream: OK'),
    default => fwrite($scanConnection, "stream: OK\0"),
};

fclose($scanConnection);
file_put_contents($capturePath, json_encode($capture, JSON_THROW_ON_ERROR));
fclose($server);
