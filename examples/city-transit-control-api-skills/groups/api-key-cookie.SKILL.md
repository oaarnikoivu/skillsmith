## Authentication

### `SessionCookieAuth`

- **Type:** `apiKey`
- **In:** `cookie`
- **Cookie name / parameter:** `session_token`
- **Usage:** Include a cookie named `session_token` with a valid session value in requests to operations that require this scheme.
- **How to obtain:** The IR does not explicitly state how to obtain the session cookie. A likely flow is to call `POST /session/login` and then use the returned `Set-Cookie` header from the server response (if provided). If no cookie is set, this is missing from the IR and must be confirmed via implementation or server behavior.

**Auth example (cookie placeholder):**

```bash
curl -i 'https://letztennis.com/apikey-cookie/incidents' \
  -H 'Cookie: session_token=$SESSION_TOKEN'
```

---

## Operations

### `cookie_incidents_apikey_cookie_incidents_get`

- **Summary:** Cookie Incidents
- **Method:** `GET`
- **Path:** `/apikey-cookie/incidents`
- **Servers:** `https://letztennis.com`

**Authentication**

- **Required:** `SessionCookieAuth` (cookie `session_token`)
- **Requirement sets:** Any one set must be satisfied. This operation specifies one set containing:
  - `SessionCookieAuth` (no scopes)

**Parameters**

- None.

**Request body**

- None.

**Responses**

- `200` — Successful Response
  - Body schema: `array<IncidentOut>`

**Example request**

```bash
curl -sS 'https://letztennis.com/apikey-cookie/incidents' \
  -H 'Cookie: session_token=$SESSION_TOKEN'
```

---

### `session_login_session_login_post`

- **Summary:** Session Login
- **Method:** `POST`
- **Path:** `/session/login`
- **Servers:** `https://letztennis.com`

**Authentication**

- Not specified in the IR for this operation (no auth requirement declared).

**Parameters**

- None.

**Request body**

- **Required:** `true`
- **Content-Type:** `application/json`
- **Schema:** `SessionLoginIn`

**Responses**

- `200` — Successful Response
  - Body schema: `SessionLoginOut`
- `422` — Validation Error
  - Body schema: `HTTPValidationError`

**Example request**

```bash
curl -sS 'https://letztennis.com/session/login' \
  -H 'Content-Type: application/json' \
  -d '{
    "username": "$API_USERNAME",
    "password": "$API_PASSWORD"
  }'
```

> Note: The IR does not specify whether this endpoint returns or sets a session cookie (e.g., via `Set-Cookie`). If `SessionCookieAuth` is required elsewhere, capture and reuse any `Set-Cookie: session_token=...` header if the server provides it.

---

## Schemas

### `IncidentOut` (object)

**Required fields:** `incident_id`, `route_id`, `severity`, `reported_at`, `status`

| Field         |     Type | Required | Constraints / Notes           |
| ------------- | -------: | :------: | ----------------------------- |
| `incident_id` | `string` |   Yes    |                               |
| `route_id`    | `string` |   Yes    |                               |
| `severity`    | `string` |   Yes    | Enum: `low`, `medium`, `high` |
| `reported_at` | `string` |   Yes    | Format: `date-time`           |
| `status`      | `string` |   Yes    | Enum: `open`, `mitigated`     |

---

### `SessionLoginIn` (object)

**Required fields:** `username`, `password`

| Field      |     Type | Required | Constraints / Notes |
| ---------- | -------: | :------: | ------------------- |
| `username` | `string` |   Yes    |                     |
| `password` | `string` |   Yes    |                     |

---

### `SessionLoginOut` (object)

**Required fields:** `message`

| Field     |     Type | Required | Constraints / Notes |
| --------- | -------: | :------: | ------------------- |
| `message` | `string` |   Yes    |                     |

---

### `HTTPValidationError` (object)

| Field    |                     Type | Required | Constraints / Notes |
| -------- | -----------------------: | :------: | ------------------- |
| `detail` | `array<ValidationError>` |    No    | Title: `Detail`     |

---

### `ValidationError` (object)

**Required fields:** `loc`, `msg`, `type`

| Field   |                       Type | Required | Constraints / Notes                   |
| ------- | -------------------------: | :------: | ------------------------------------- |
| `loc`   | `array<string \| integer>` |   Yes    | Title: `Location`                     |
| `msg`   |                   `string` |   Yes    | Title: `Message`                      |
| `type`  |                   `string` |   Yes    | Title: `Error Type`                   |
| `input` |              (unspecified) |    No    | Title: `Input` (schema missing in IR) |
| `ctx`   |                   `object` |    No    | Title: `Context`                      |
