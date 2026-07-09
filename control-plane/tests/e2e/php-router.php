<?php

declare(strict_types=1);

$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$requestPath = is_string($requestPath) ? urldecode($requestPath) : '/';
$publicPath = realpath(__DIR__ . '/../../public') ?: (__DIR__ . '/../../public');
$requestedFile = realpath($publicPath . $requestPath);
$publicPrefix = rtrim($publicPath, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;

if (
    $requestPath !== '/'
    && is_string($requestedFile)
    && str_starts_with($requestedFile, $publicPrefix)
    && is_file($requestedFile)
) {
    return false;
}

require $publicPath . '/index.php';
