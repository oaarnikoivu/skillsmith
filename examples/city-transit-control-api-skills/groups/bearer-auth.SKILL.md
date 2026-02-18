## Authentication

### `BearerAuth`

**Type:** HTTP Bearer (`Authorization: Bearer <token>`)

**How to use:**  
Send an `Authorization` header with a bearer token.

**Example header (placeholder):**

```http
Authorization: Bearer $BEARER_TOKEN
```

**Notes / missing details:**

- The API IR does not specify how to obtain or refresh bearer tokens.

---

## Operations

### `bearer_profile_bearer_operators_me_get`

**Summary:** Bearer Profile  
**Method:** `GET`  
**Path:** `/bearer/operators/me`

**Authentication:** required: `BearerAuth`

**Parameters:** none

**Responses:**

- **200** Successful Response
  - **Body schema:** [`ProfileOut`](#profileout)

#### Example request

```bash
curl -X GET "https://letztennis.com/bearer/operators/me" \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Accept: application/json"
```

---

## Schemas

### `ProfileOut`

**Type:** `object`  
**Required fields:** `subject`, `auth_method`

| Field         | Type     | Required | Description |
| ------------- | -------- | -------- | ----------- |
| `subject`     | `string` | Yes      | Subject     |
| `auth_method` | `string` | Yes      | Auth Method |

**Shape:**

```json
{
  "subject": "string",
  "auth_method": "string"
}
```
