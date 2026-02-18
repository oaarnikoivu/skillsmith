## Authentication

### `BasicAuth`

**Type:** HTTP Basic (`Authorization: Basic ...`)

**How to use:** Provide an HTTP Basic Authorization header using a username and password.

- **Header:** `Authorization: Basic <base64(username:password)>`
- **Do not** place credentials in the URL.
- Use placeholders in automation and examples:
  - `$API_USERNAME`
  - `$API_PASSWORD`

**Example (cURL):**

```bash
curl -u "$API_USERNAME:$API_PASSWORD" https://letztennis.com/basic/admin/depots
```

---

## Operations

### `create_depot_basic_admin_depots_post`

**Summary:** Create Depot  
**Method:** `POST`  
**Path:** `/basic/admin/depots`  
**Base URL:** `https://letztennis.com`

**Authentication:** required: `BasicAuth`

#### Parameters

None.

#### Request Body

**Required:** yes  
**Content-Type:** `application/json`  
**Schema:** [`CreateDepotIn`](#createdepotin)

#### Responses

- **201** — Successful Response  
  **Body schema:** [`DepotOut`](#depotout)
- **422** — Validation Error  
  **Body schema:** [`HTTPValidationError`](#httpvalidationerror)

#### Example request

```bash
curl -X POST "https://letztennis.com/basic/admin/depots" \
  -u "$API_USERNAME:$API_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Central Depot",
    "city": "Springfield",
    "max_vehicles": 120
  }'
```

---

## Schemas

### `CreateDepotIn`

**Type:** `object`  
**Required fields:** `name`, `city`, `max_vehicles`

| Field          |      Type | Required | Constraints                      | Default         | Description                     |
| -------------- | --------: | :------: | -------------------------------- | --------------- | ------------------------------- |
| `name`         |  `string` |   Yes    | `minLength: 2`, `maxLength: 120` | (not specified) | Depot name                      |
| `city`         |  `string` |   Yes    | `minLength: 2`, `maxLength: 120` | (not specified) | City where the depot is located |
| `max_vehicles` | `integer` |   Yes    | `minimum: 1`, `maximum: 500`     | (not specified) | Maximum vehicles supported      |

**Shape:**

```json
{
  "name": "string",
  "city": "string",
  "max_vehicles": 1
}
```

### `DepotOut`

**Type:** `object`  
**Required fields:** `depot_id`, `name`, `city`, `max_vehicles`

| Field          |      Type | Required | Constraints     | Default         | Description                |
| -------------- | --------: | :------: | --------------- | --------------- | -------------------------- |
| `depot_id`     |  `string` |   Yes    | (not specified) | (not specified) | Depot identifier           |
| `name`         |  `string` |   Yes    | (not specified) | (not specified) | Depot name                 |
| `city`         |  `string` |   Yes    | (not specified) | (not specified) | City                       |
| `max_vehicles` | `integer` |   Yes    | (not specified) | (not specified) | Maximum vehicles supported |

**Shape:**

```json
{
  "depot_id": "string",
  "name": "string",
  "city": "string",
  "max_vehicles": 1
}
```

### `HTTPValidationError`

**Type:** `object`  
**Required fields:** (not specified)

| Field    |                Type | Required | Constraints     | Default         | Description              |
| -------- | ------------------: | :------: | --------------- | --------------- | ------------------------ |
| `detail` | `ValidationError[]` |    No    | (not specified) | (not specified) | Validation error details |

**Shape:**

```json
{
  "detail": [
    {
      "loc": ["string", 0],
      "msg": "string",
      "type": "string",
      "input": null,
      "ctx": {}
    }
  ]
}
```

> Note: The IR references `ValidationError` via `"$ref": "#/components/schemas/ValidationError"`. The concrete schema definition is provided below.

### `ValidationError`

**Type:** `object`  
**Required fields:** `loc`, `msg`, `type`

| Field   |                    Type | Required | Constraints     | Default         | Description                                            |
| ------- | ----------------------: | :------: | --------------- | --------------- | ------------------------------------------------------ |
| `loc`   | `(string \| integer)[]` |   Yes    | (not specified) | (not specified) | Location of the error (path elements)                  |
| `msg`   |                `string` |   Yes    | (not specified) | (not specified) | Human-readable error message                           |
| `type`  |                `string` |   Yes    | (not specified) | (not specified) | Error type identifier                                  |
| `input` |           (unspecified) |    No    | (not specified) | (not specified) | Input that caused the error (type not specified in IR) |
| `ctx`   |                `object` |    No    | (not specified) | (not specified) | Additional context                                     |

**Shape:**

```json
{
  "loc": ["string", 0],
  "msg": "string",
  "type": "string",
  "input": null,
  "ctx": {}
}
```
