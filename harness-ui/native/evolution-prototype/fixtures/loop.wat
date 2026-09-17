(component
  (core module $code
    (func (export "run") (param i64 i64 i32) (result i32)
      (loop $forever br $forever) i32.const 0))
  (core instance $code (instantiate $code))
  (func (export "run") (param "lease-high" u64) (param "lease-low" u64) (param "target" u32)
    (result u32) (canon lift (core func $code "run"))))
