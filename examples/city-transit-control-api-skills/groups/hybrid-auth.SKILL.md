## Authentication

### `ApiKeyHeaderAuth`

**Type:** `apiKey` (in `header`)  
**Header name:** `x-api-key`

**How to use:** Include an API key in the `x-api-key` header.

**Example (cURL):**

```bash
curl -X GET "https://letztennis.com/hybrid/alerts" \
  -H "x-api-key: $API_KEY"
```

### `BearerAuth`

**Type:** `http` bearer

**How to use:** Include a bearer token in the `Authorization` header.

**Example (cURL):**

```bash
curl -X GET "https://letztennis.com/hybrid/alerts" \
  -H "Authorization: Bearer $BEARER_TOKEN"
```

## Operations

### `hybrid_alert_hybrid_alerts_get`

**Summary:** Hybrid Alert  
**Method:** `GET`  
**Path:** `/hybrid/alerts`  
**Servers:** `https://letztennis.com`

**Authentication (required):** `BearerAuth` **OR** `ApiKeyHeaderAuth`

- Provide **either**:
  - `Authorization: Bearer $BEARER_TOKEN`, **or**
  - `x-api-key: $API_KEY`

**Parameters:** None

**Responses:**

- **200** Successful Response
  - **Response body schema:** [`AlertOut`](#alertout)

#### Example request

**Option A: Bearer token**

```bash
curl -X GET "https://letztennis.com/hybrid/alerts" \
  -H "Authorization: Bearer $BEARER_TOKEN"
```

**Option B: API key header**

```bash
curl -X GET "https://letztennis.com/hybrid/alerts" \
  -H "x-api-key: $API_KEY"
```

## Schemas

### `AlertOut`

**Type:** `object`  
**Required fields:** `id`, `level`, `message`

| Field     | Type     | Required | Enum                    | Default | Description           |
| --------- | -------- | -------: | ----------------------- | ------- | --------------------- |
| `id`      | `string` |      Yes | —                       | —       | (Not specified in IR) |
| `level`   | `string` |      Yes | `low`, `medium`, `high` | —       | (Not specified in IR) |
| `message` | `string` |      Yes | —                       | —       | (Not specified in IR) |

**Shape:**

```json
{
  "id": "string",
  "level": "low | medium | high",
  "message": "string"
}
```
