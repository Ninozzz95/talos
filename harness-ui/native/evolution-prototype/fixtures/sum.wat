(component
  (import "read" (func $read (param "lease-high" u64) (param "lease-low" u64)
    (param "target" u32) (result (list u8))))
  (core module $memory
    (memory (export "memory") 1)
    (global $next (mut i32) (i32.const 32))
    (func (export "realloc") (param i32 i32 i32) (param $size i32) (result i32)
      (local $old i32)
      global.get $next local.tee $old local.get $size i32.add global.set $next
      local.get $old))
  (core instance $mem (instantiate $memory))
  (alias core export $mem "memory" (core memory $linear))
  (alias core export $mem "realloc" (core func $allocate))
  (core func $lower (canon lower (func $read)
    (memory $linear) (realloc $allocate)))
  (core module $code
    (import "host" "read" (func $read (param i64 i64 i32 i32)))
    (import "host" "memory" (memory 1))
    (func (export "run") (param $high i64) (param $low i64) (param $target i32) (result i32)
      (local $ptr i32) (local $len i32) (local $sum i32)
      local.get $high local.get $low local.get $target i32.const 0 call $read
      ;; SECOND_READ
      i32.const 0 i32.load local.set $ptr
      i32.const 4 i32.load local.set $len
      block $done
        loop $next
          local.get $len i32.eqz br_if $done
          local.get $sum local.get $ptr i32.load8_u i32.add local.set $sum
          local.get $ptr i32.const 1 i32.add local.set $ptr
          local.get $len i32.const 1 i32.sub local.set $len
          br $next
        end
      end
      ;; RESULT
      local.get $sum))
  (core instance $code (instantiate $code
    (with "host" (instance (export "read" (func $lower)) (export "memory" (memory $linear))))))
  (func (export "run") (param "lease-high" u64) (param "lease-low" u64) (param "target" u32)
    (result u32) (canon lift (core func $code "run"))))
