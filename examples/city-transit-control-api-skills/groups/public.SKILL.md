## Operations

### `health_public_health_get`

**Summary:** Health

- **Method:** GET
- **Path:** `/public/health`
- **Servers:**
  - `https://letztennis.com`

**Parameters:** (none)

**Responses:**

- **200** — Successful Response
  - Body schema: [`HealthOut`](#healthout)

**Example request**

```bash
curl -sS -X GET "https://letztennis.com/public/health"
```

---

### `list_routes_public_routes_get`

**Summary:** List Routes

- **Method:** GET
- **Path:** `/public/routes`
- **Servers:**
  - `https://letztennis.com`

**Parameters:**

- `city` (query, optional)
  - Schema: nullable string
- `transport_type` (query, optional)
  - Schema: nullable enum(`bus`, `tram`, `metro`)
  - Allowed values: `bus`, `tram`, `metro`
- `limit` (query, optional)
  - Schema: integer
  - Default: `20`
- `offset` (query, optional)
  - Schema: integer
  - Default: `0`

**Responses:**

- **200** — Successful Response
  - Body schema: [`RouteSearchOut`](#routesearchout)
- **422** — Validation Error
  - Body schema: [`HTTPValidationError`](#httpvalidationerror)

**Example request**

```bash
curl -sS -X GET "https://letztennis.com/public/routes?city=Berlin&transport_type=tram&limit=20&offset=0"
```

---

### `get_route_public_routes__route_id__get`

**Summary:** Get Route

- **Method:** GET
- **Path:** `/public/routes/{route_id}`
- **Servers:**
  - `https://letztennis.com`

**Parameters:**

- `route_id` (path, required)
  - Schema: string

**Responses:**

- **200** — Successful Response
  - Body schema: [`RouteOut`](#routeout)
- **422** — Validation Error
  - Body schema: [`HTTPValidationError`](#httpvalidationerror)

**Example request**

```bash
curl -sS -X GET "https://letztennis.com/public/routes/ROUTE_123"
```

---

## Schemas

### `HealthOut`

**Type:** object  
**Required:** `status`, `time`

| Field    | Type               | Required | Description           |
| -------- | ------------------ | -------: | --------------------- |
| `status` | string             |      yes | (not specified in IR) |
| `time`   | string (date-time) |      yes | RFC 3339 timestamp    |

**Shape**

```json
{
  "status": "string",
  "time": "2026-01-01T00:00:00Z"
}
```

---

### `RouteOut`

**Type:** object  
**Required:** `route_id`, `name`, `city`, `transport_type`, `active_stops`

| Field            | Type          | Required | Description                    |
| ---------------- | ------------- | -------: | ------------------------------ |
| `route_id`       | string        |      yes | Route identifier               |
| `name`           | string        |      yes | Route name                     |
| `city`           | string        |      yes | City name                      |
| `transport_type` | string (enum) |      yes | One of: `bus`, `tram`, `metro` |
| `active_stops`   | integer       |      yes | Number of active stops         |

**Shape**

```json
{
  "route_id": "string",
  "name": "string",
  "city": "string",
  "transport_type": "bus",
  "active_stops": 0
}
```

---

### `RouteSearchOut`

**Type:** object  
**Required:** `total`, `items`

| Field   | Type       | Required | Description           |
| ------- | ---------- | -------: | --------------------- |
| `total` | integer    |      yes | Total matching routes |
| `items` | RouteOut[] |      yes | List of routes        |

**Shape**

```json
{
  "total": 0,
  "items": [
    {
      "route_id": "string",
      "name": "string",
      "city": "string",
      "transport_type": "tram",
      "active_stops": 12
    }
  ]
}
```

---

### `HTTPValidationError`

**Type:** object  
**Required:** (none specified in IR)

| Field    | Type              | Required | Description              |
| -------- | ----------------- | -------: | ------------------------ |
| `detail` | ValidationError[] |       no | Validation error details |

**Shape**

```json
{
  "detail": [
    {
      "loc": ["query", "limit"],
      "msg": "string",
      "type": "string",
      "input": null,
      "ctx": {}
    }
  ]
}
```

---

### `ValidationError`

**Type:** object  
**Required:** `loc`, `msg`, `type`

| Field   | Type                  | Required | Description                                                   |
| ------- | --------------------- | -------: | ------------------------------------------------------------- |
| `loc`   | (string \| integer)[] |      yes | Location of the error (e.g., `["query","limit"]`)             |
| `msg`   | string                |      yes | Human-readable error message                                  |
| `type`  | string                |      yes | Error type identifier                                         |
| `input` | (unspecified)         |       no | Input value related to the error (schema not specified in IR) |
| `ctx`   | object                |       no | Additional context                                            |

**Shape**

```json
{
  "loc": ["string", 0],
  "msg": "string",
  "type": "string",
  "input": null,
  "ctx": {}
}
```
