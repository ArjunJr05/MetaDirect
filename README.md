# MetaDirect 🛡️

**MetaDirect** is a high-performance, security-focused link preview engine for Electron applications. It extracts Open Graph and Twitter metadata entirely on the client side, ensuring zero data leakage and total user privacy.

## 🚀 Key Features

- **Privacy-First**: No third-party servers or middlewares. URLs are fetched directly from the user's device.
- **Bypass CORS**: Utilizes Electron's native `net` module to safely scan any website without cross-origin restrictions.
- **Production Hardened**: 
  - **Partial Fetching**: Aborts downloads after reaching the `<head>` section or 128KB limit, making results up to 10x faster.
  - **In-Memory Caching**: Instant results for previously visited links.
  - **Image Normalization**: Automatically resolves relative image paths to absolute URLs.
- **Secure Architecture**: Implements strict `contextIsolation` and `preload` bridges to prevent XSS-to-RCE escalation.

## 🛠️ Security Architecture

MetaDirect follows the **Principle of Least Privilege**:
1. **Renderer Process**: Handles the UI and user input; has no access to Node.js or the system.
2. **Preload Script**: Acts as a secure "Bank Teller" window, exposing only necessary IPC channels.
3. **Main Process**: Performs the system-level fetching and parsing in a protected environment.

## 📦 Installation

```bash
git clone https://github.com/ArjunJr05/MetaDirect.git
cd MetaDirect
npm install
```

## 🖥️ Usage

To start the development environment:

```bash
npm start
```

## 📚 Documentation

To regenerate the professional JSDoc documentation:

```bash
npm run docs
```

The output will be available in the `/docs` directory.
