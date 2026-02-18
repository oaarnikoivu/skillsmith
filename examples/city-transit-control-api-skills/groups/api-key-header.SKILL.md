## Authentication

### `ApiKeyHeaderAuth`

**Type:** `apiKey` (in header)  
**Header name:** `x-api-key`

**How to authenticate**

- Include the API key in the `x-api-key` request header.
- Use a placeholder value in tooling and examples (do not hardcode secrets).

**Example (cURL)**

```bash
curl -sS \
  -H "x-api-key: $API_KEY" \
  "https://letztennis.com/apikey-header/system-metrics"
```

## Operations

### `header_key_metrics_apikey_header_system_metrics_get`

**Summary:** Header Key Metrics  
**Method:** `GET`  
**Path:** `/apikey-header/system-metrics`  
**Server:** `https://letztennis.com`

**Authentication:** required: `ApiKeyHeaderAuth`

- Send header `x-api-key: $API_KEY`

#### Parameters

- None

#### Responses

- **200** — Successful Response
  - **Body:** `object` (response fields not specified in the IR)

#### Example request

```bash
curl -sS \
  -H "x-api-key: $API_KEY" \
  "https://letztennis.com/apikey-header/system-metrics"
```
