<?php

declare(strict_types=1);

$coreSource = dirname(__DIR__, 2).'/core/src';

if (is_dir($coreSource)) {
    spl_autoload_register(static function (string $class) use ($coreSource): void {
        $prefix = 'Kadmos\\';
        if (! str_starts_with($class, $prefix)) {
            return;
        }

        $path = $coreSource.'/'.str_replace('\\', '/', substr($class, strlen($prefix))).'.php';
        if (is_file($path)) {
            require_once $path;
        }
    }, true, true);
}
