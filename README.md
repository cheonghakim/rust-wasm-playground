# 🎠 CodePlayground

A lightweight **in-browser sandbox** for rapid prototyping with **HTML, CSS, JS, and Rust (WASM)**.  
Instant feedback on the right, zero setup required.

## Core Features

- **Live Preview**: Real-time feedback as you type.
- **CDN Support**: Easily attach external libraries (Three.js, Vue, etc.) via URL.
- **Built-in Formatter**: One-click code tidying using Prettier and rustfmt.
- **Rust → WASM**: Write Rust inline and compile directly to WebAssembly.
- **Client-Side**: Everything runs in your browser for maximum speed and privacy.
- **File Management**: Create, delete, rename, and manage files.

## Integration

Exported Rust functions are automatically compiled and exposed to JavaScript via `window.__rust`.

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}
```

```javascript
// Access the compiled module
const { add } = await window.__rust;
console.log(add(2, 3)); // 5
```

---

![Preview](https://github.com/user-attachments/assets/cf2f4a81-fc16-4583-8fc0-d0c31eb805ff)
