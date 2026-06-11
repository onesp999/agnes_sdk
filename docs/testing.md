# Agnes SDK Testing

This repository keeps default tests fully mocked. They must pass without
`AGNES_API_KEY`, without Agnes network access, and without writing secrets into
fixtures or logs.

## Python SDK

Run the default Python SDK test suite:

```bash
cd packages/python
pytest
```

Run only one layer:

```bash
pytest tests/unit
pytest tests/contract
pytest tests/integration
```

`tests/integration` is skipped unless both variables are set:

```bash
$env:AGNES_API_KEY="..."
$env:RUN_AGNES_INTEGRATION_TESTS="1"
pytest tests/integration
```

## JavaScript SDK

Run the default JavaScript SDK test suite:

```bash
cd packages/javascript
npm test
```

Run only one layer:

```bash
npm run test:unit
npm run test:contract
npm run test:integration
```

`npm test` excludes `tests/integration`. `npm run test:integration` still skips
real API smoke tests unless both environment variables are set:

```bash
$env:AGNES_API_KEY="..."
$env:RUN_AGNES_INTEGRATION_TESTS="1"
npm run test:integration
```

## Playground

Run the playground frontend safety tests:

```bash
cd apps/playground
npm test
```

The playground frontend must call only local backend routes such as `/api/chat`,
`/api/images`, `/api/videos`, and `/api/videos/:id`. It must not read, store, or
send `AGNES_API_KEY`; the key belongs only in a backend proxy environment.

## Coverage Intent

- Unit tests cover request construction, response parsing, streaming chunks,
  image URL/base64 responses, image-to-image `extra_body.image`, video polling
  completion/failure/timeout, and compatible video URL fields.
- Contract tests pin public endpoint paths, missing-key behavior, and safe error
  redaction.
- Integration tests are manual smoke tests for Chat, Image, and Video create.

Do not paste real Agnes responses with credentials into fixtures. If an upstream
error echoes an authorization header, SDK and playground errors should redact it
before surfacing it.
