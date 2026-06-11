# Agnes AI TypeScript SDK

This package will provide the server-side TypeScript SDK for Agnes AI Chat,
Image, and Video APIs. The current milestone defines shared constants,
configuration, errors, and video compatibility helpers before implementing the
HTTP client.

This package is intended for Node.js backends. Do not use it directly from a
browser application because that would expose the Agnes API key.

## Development

```bash
npm install
npm test
npm run build
```
