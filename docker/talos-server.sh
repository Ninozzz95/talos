#!/usr/bin/env sh
set -eu

php_pid=''
nginx_pid=''

stop_servers() {
    trap - EXIT INT TERM
    if [ -n "$php_pid" ]; then
        kill "$php_pid" 2>/dev/null || true
    fi
    if [ -n "$nginx_pid" ]; then
        kill "$nginx_pid" 2>/dev/null || true
    fi
    [ -z "$php_pid" ] || wait "$php_pid" 2>/dev/null || true
    [ -z "$nginx_pid" ] || wait "$nginx_pid" 2>/dev/null || true
}

trap 'exit 143' INT TERM
trap stop_servers EXIT

php-fpm --nodaemonize &
php_pid=$!
nginx -g 'daemon off;' &
nginx_pid=$!

status=0
while kill -0 "$php_pid" 2>/dev/null && kill -0 "$nginx_pid" 2>/dev/null; do
    sleep 1
done

if ! kill -0 "$php_pid" 2>/dev/null; then
    wait "$php_pid" || status=$?
else
    wait "$nginx_pid" || status=$?
fi

exit "$status"
