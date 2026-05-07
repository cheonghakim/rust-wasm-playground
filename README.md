# 🎠 CodePlayground

A lightweight **in-browser sandbox** for rapid prototyping with **HTML, CSS, JS, and Rust (WASM)**.  
Instant feedback on the right, zero setup required.

---

## 💡 Intent & Purpose / 개발 의도 및 목적

### English

**Intent**
To provide a lightweight sandbox on the web browser where developers can experiment with Rust and WebAssembly, combining them with frontend code (HTML, CSS, JS) to see immediate results without any local environment setup.

**Purpose**

- Rapidly prototype Rust-based web logic.
- Test and validate the performance benefits of WebAssembly in real-time.
- Learn and experiment with Rust and JS interoperability using only a browser, eliminating the need for complex toolchain installations.

### 한국어

**의도**
웹 브라우저 상에서 별도의 개발 환경 구축 없이 Rust와 WebAssembly를 실험하고, 프론트엔드 코드(HTML, CSS, JS)와 결합하여 즉각적인 결과를 확인할 수 있는 가벼운 샌드박스를 제공하고자 합니다.

**목적**

- Rust 기반의 웹 로직을 신속하게 프로토타이핑합니다.
- WebAssembly의 성능 이점을 실시간으로 테스트하고 검증합니다.
- 복잡한 툴체인 설치 없이 브라우저만으로 Rust와 JS의 상호 운용성을 학습하고 실험합니다.

---

## 🚀 Advantages / 주요 장점

### English

- **Zero Setup**: Everything runs in the browser, removing the hassle of local configuration.
- **Live Feedback**: Instant preview of code changes enhances development productivity.
- **Seamless Integration**: Effortlessly call Rust functions from JavaScript via `wasm-bindgen`.
- **Performance**: Experience the power and speed of Rust directly in the web environment.
- **User-Friendly**: Provides an intuitive file-system-based interface and built-in code formatting.

### 한국어

- **설치 불필요**: 브라우저에서 모든 것이 실행되므로 로컬 개발 환경 설정이 필요 없습니다.
- **실시간 피드백**: 코드 수정 시 즉각적으로 미리보기에 반영되어 개발 생산성을 높입니다.
- **심리스한 통합**: `wasm-bindgen`을 통해 Rust 함수를 JavaScript에서 직관적으로 호출할 수 있습니다.
- **성능 최적화**: Rust의 강력한 성능을 웹 환경에서 직접 경험할 수 있습니다.
- **편리한 관리**: 파일 시스템 기반의 직관적인 인터페이스와 코드 포맷팅 기능을 제공합니다.

---

## 🛠️ Core Features

- **Live Preview**: Real-time feedback as you type.
- **CDN Support**: Easily attach external libraries (Three.js, Vue, etc.) via URL.
- **Built-in Formatter**: One-click code tidying using Prettier and rustfmt.
- **Rust → WASM**: Write Rust inline and compile directly to WebAssembly.
- **Client-Side Preview**: Everything runs in your browser for maximum speed and privacy.
- **File Management**: Create, delete, rename, and manage files.

## 🔗 Integration

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
