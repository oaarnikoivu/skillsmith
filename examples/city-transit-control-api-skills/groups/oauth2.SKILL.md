## Authentication

### `OAuth2PasswordAuth`

**Type:** OAuth2 (`password` flow)  
**Token URL:** `https://letztennis.com/oauth/token`  
**Scopes:** none

**How to obtain an access token**

- Call `POST /oauth/token` with `application/x-www-form-urlencoded` body as defined by `Body_oauth_token_oauth_token_post`.
- Use the returned `access_token` as a Bearer token for authenticated operations.

**How to use the access token**

- Send the token on requests requiring auth via:
  - `Authorization: Bearer $BEARER_TOKEN`

> Note: The IR does not specify token expiration, refresh tokens, or additional fields beyond `TokenOut`.

---

## Operations

### `create_dispatch_oauth_dispatches_post`

**Summary:** Create Dispatch  
**Method:** `POST`  
**Path:** `/oauth/dispatches`  
**Server:** `https://letztennis.com`

**Authentication:** required: `OAuth2PasswordAuth`

- Header: `Authorization: Bearer $BEARER_TOKEN`

**Parameters:** none

**Request Body**

- Required: yes
- Content-Type: `application/json`
- Schema: [`DispatchIn`](#dispatchin)

**Responses**

- `201` Successful Response — Schema: [`DispatchOut`](#dispatchout)
- `422` Validation Error — Schema: [`HTTPValidationError`](#httpvalidationerror)

**Example request**

```bash
curl -X POST "https://letztennis.com/oauth/dispatches" \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vehicle_id": "vehicle_123",
    "route_id": "route_456",
    "departs_at": "2026-01-01T08:30:00Z",
    "driver_notes": "Optional note for the driver"
  }'
```

---

### `oauth_profile_oauth_profile_get`

**Summary:** Oauth Profile  
**Method:** `GET`  
**Path:** `/oauth/profile`  
**Server:** `https://letztennis.com`

**Authentication:** required: `OAuth2PasswordAuth`

- Header: `Authorization: Bearer $BEARER_TOKEN`

**Parameters:** none

**Request Body:** none

**Responses**

- `200` Successful Response — Schema: [`ProfileOut`](#profileout)

**Example request**

```bash
curl -X GET "https://letztennis.com/oauth/profile" \
  -H "Authorization: Bearer $BEARER_TOKEN"
```

---

### `oauth_token_oauth_token_post`

**Summary:** Oauth Token  
**Method:** `POST`  
**Path:** `/oauth/token`  
**Server:** `https://letztennis.com`

**Authentication:** Not specified in IR for this operation.

**Parameters:** none

**Request Body**

- Required: yes
- Content-Type: `application/x-www-form-urlencoded`
- Schema: [`Body_oauth_token_oauth_token_post`](#body_oauth_token_oauth_token_post)

**Responses**

- `200` Successful Response — Schema: [`TokenOut`](#tokenout)
- `422` Validation Error — Schema: [`HTTPValidationError`](#httpvalidationerror)

**Example request**

```bash
curl -X POST "https://letztennis.com/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=password" \
  --data-urlencode "username=$API_USERNAME" \
  --data-urlencode "password=$API_PASSWORD" \
  --data-urlencode "scope=" \
  --data-urlencode "client_id=" \
  --data-urlencode "client_secret="
```

---

## Schemas

### `Body_oauth_token_oauth_token_post`

**Type:** object  
**Required:** `username`, `password`

| Field           | Type             | Required | Constraints / Notes                        |
| --------------- | ---------------- | -------- | ------------------------------------------ |
| `grant_type`    | `string \| null` | no       | If string, must match pattern `^password$` |
| `username`      | `string`         | yes      |                                            |
| `password`      | `string`         | yes      | format: `password`                         |
| `scope`         | `string`         | no       | default: `""`                              |
| `client_id`     | `string \| null` | no       |                                            |
| `client_secret` | `string \| null` | no       | format: `password`                         |

Concrete shape:

```json
{
  "grant_type": "password",
  "username": "string",
  "password": "string",
  "scope": "",
  "client_id": "string",
  "client_secret": "string"
}
```

---

### `DispatchIn`

**Type:** object  
**Required:** `vehicle_id`, `route_id`, `departs_at`

| Field          | Type             | Required | Constraints / Notes |
| -------------- | ---------------- | -------- | ------------------- |
| `vehicle_id`   | `string`         | yes      |                     |
| `route_id`     | `string`         | yes      |                     |
| `departs_at`   | `string`         | yes      | format: `date-time` |
| `driver_notes` | `string \| null` | no       |                     |

Concrete shape:

```json
{
  "vehicle_id": "string",
  "route_id": "string",
  "departs_at": "2026-01-01T08:30:00Z",
  "driver_notes": "string"
}
```

---

### `DispatchOut`

**Type:** object  
**Required:** `dispatch_id`, `vehicle_id`, `route_id`, `departs_at`, `status`

| Field         | Type     | Required | Constraints / Notes  |
| ------------- | -------- | -------- | -------------------- |
| `dispatch_id` | `string` | yes      |                      |
| `vehicle_id`  | `string` | yes      |                      |
| `route_id`    | `string` | yes      |                      |
| `departs_at`  | `string` | yes      | format: `date-time`  |
| `status`      | `string` | yes      | const: `"scheduled"` |

Concrete shape:

```json
{
  "dispatch_id": "string",
  "vehicle_id": "string",
  "route_id": "string",
  "departs_at": "2026-01-01T08:30:00Z",
  "status": "scheduled"
}
```

---

### `HTTPValidationError`

**Type:** object  
**Required:** none specified in IR

| Field    | Type    | Required | Constraints / Notes                          |
| -------- | ------- | -------- | -------------------------------------------- |
| `detail` | `array` | no       | Items: [`ValidationError`](#validationerror) |

Concrete shape:

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

---

### `ProfileOut`

**Type:** object  
**Required:** `subject`, `auth_method`

| Field         | Type     | Required | Constraints / Notes |
| ------------- | -------- | -------- | ------------------- |
| `subject`     | `string` | yes      |                     |
| `auth_method` | `string` | yes      |                     |

Concrete shape:

```json
{
  "subject": "string",
  "auth_method": "string"
}
```

---

### `TokenOut`

**Type:** object  
**Required:** `access_token`

| Field          | Type     | Required | Constraints / Notes |
| -------------- | -------- | -------- | ------------------- |
| `access_token` | `string` | yes      |                     |
| `token_type`   | `string` | no       | default: `"bearer"` |

Concrete shape:

```json
{
  "access_token": "string",
  "token_type": "bearer"
}
```

---

### `ValidationError`

**Type:** object  
**Required:** `loc`, `msg`, `type`

| Field   | Type          | Required | Constraints / Notes             |
| ------- | ------------- | -------- | ------------------------------- |
| `loc`   | `array`       | yes      | items are `string` or `integer` |
| `msg`   | `string`      | yes      |                                 |
| `type`  | `string`      | yes      |                                 |
| `input` | (unspecified) | no       | IR does not specify a type      |
| `ctx`   | `object`      | no       |                                 |

Concrete shape:

```json
{
  "loc": ["string", 0],
  "msg": "string",
  "type": "string",
  "input": null,
  "ctx": {}
}
```
