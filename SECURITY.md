# Security Policy

## Local-First Security Model

OpenHepta is a local-first desktop application built on Electron. All user data (notes, whiteboards, PDF/EPUB documents, and highlights) is stored locally in SQLite databases and the local file store.

- The built-in CLI control server binds strictly to loopback (`127.0.0.1:48921`) and is not exposed to external network interfaces.
- Renderer processes run with `contextIsolation` enabled and communicate with the main process strictly through typed IPC channels defined in `shared/api.ts`.

## Reporting a Vulnerability

If you discover a security vulnerability in OpenHepta, please do **not** open a public GitHub issue. Instead, report it privately via GitHub Security Advisories (the **Security → Report a vulnerability** tab on the repository) with:

- A clear description of the vulnerability and its potential impact.
- Steps to reproduce or a minimal proof of concept.
- Any suggested mitigations if known.

We will acknowledge receipt and work with you to resolve the issue promptly.
