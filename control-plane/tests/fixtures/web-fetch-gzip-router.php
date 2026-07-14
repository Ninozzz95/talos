<?php

declare(strict_types=1);

$body = str_repeat('decompressed evidence ', 128);
$compressed = gzencode($body, 9);

if (! is_string($compressed)) {
    http_response_code(500);
    exit;
}

header('Content-Type: text/plain; charset=utf-8');
header('Content-Encoding: gzip');
header('Content-Length: '.strlen($compressed));
echo $compressed;
