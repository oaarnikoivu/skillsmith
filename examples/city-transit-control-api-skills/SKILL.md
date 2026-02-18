# City Transit Control API — Skill Router (v1.0.0)

Base server: `https://letztennis.com`

This root `SKILL.md` routes you to the correct segmented skill file based on the authentication method and task domain. Use it to quickly select the right file and understand which operation IDs are available where.

## How to use these files (for autonomous agents)

1. **Start with `groups/public.SKILL.md`** for connectivity checks and public route lookups (`health_public_health_get`, route listing, route detail).
2. **Identify the required auth method** for your task (API key in cookie, API key in header, Basic, Bearer, OAuth2, or Hybrid) and open the corresponding segment file below.
3. **Execute only the operation IDs listed in that file**; do not assume operations exist in other segments.
4. **Multi-step workflows** often require combining segment files (notably OAuth2 token acquisition + OAuth2-protected calls). Follow the “Cross-file workflows” guidance at the bottom to sequence operations correctly.

## Skill Files

### `groups/api-key-cookie.SKILL.md`

**When to use:**  
Use this file when the API requires an **API key delivered via cookie** and/or you must establish a session via a login endpoint.

**Covers operations (operation IDs):**

- `cookie_incidents_apikey_cookie_incidents_get`
- `session_login_session_login_post`

**Typical workflows within this file:**

- **Session-first flow:** call `session_login_session_login_post`, then use returned/installed cookies to call `cookie_incidents_apikey_cookie_incidents_get`.
- **Incident retrieval with cookie auth:** directly call `cookie_incidents_apikey_cookie_incidents_get` when the required cookie is already present.

---

### `groups/api-key-header.SKILL.md`

**When to use:**  
Use this file when the API requires an **API key passed via an HTTP header** (header-based key auth), typically for system/telemetry endpoints.

**Covers operations (operation IDs):**

- `header_key_metrics_apikey_header_system_metrics_get`

**Typical workflows within this file:**

- Provide the required API-key header and call `header_key_metrics_apikey_header_system_metrics_get` to retrieve system metrics.

---

### `groups/basic-auth.SKILL.md`

**When to use:**  
Use this file when the endpoint is protected by **HTTP Basic Authentication**, typically for administrative actions.

**Covers operations (operation IDs):**

- `create_depot_basic_admin_depots_post`

**Typical workflows within this file:**

- Authenticate with Basic Auth credentials and call `create_depot_basic_admin_depots_post` to create a depot (admin action).

---

### `groups/bearer-auth.SKILL.md`

**When to use:**  
Use this file when you already have a **Bearer token** (e.g., issued out-of-band) and need to access bearer-protected operator profile functionality.

**Covers operations (operation IDs):**

- `bearer_profile_bearer_operators_me_get`

**Typical workflows within this file:**

- Supply `Authorization: Bearer <token>` and call `bearer_profile_bearer_operators_me_get` to fetch the current operator’s profile.

---

### `groups/hybrid-auth.SKILL.md`

**When to use:**  
Use this file when the endpoint requires **hybrid authentication** (a combination of mechanisms as defined by that segment), commonly for secured alert access.

**Covers operations (operation IDs):**

- `hybrid_alert_hybrid_alerts_get`

**Typical workflows within this file:**

- Provide whatever hybrid auth inputs are required by the segment and call `hybrid_alert_hybrid_alerts_get` to retrieve alerts.

---

### `groups/oauth2.SKILL.md`

**When to use:**  
Use this file for **OAuth2-based authentication** flows and for endpoints that require an OAuth2 access token.

**Covers operations (operation IDs):**

- `oauth_token_oauth_token_post`
- `oauth_profile_oauth_profile_get`
- `create_dispatch_oauth_dispatches_post`

**Typical workflows within this file:**

- **Token then call protected endpoints:**
  1. Acquire an access token with `oauth_token_oauth_token_post`.
  2. Use the token to call `oauth_profile_oauth_profile_get` (profile) and/or `create_dispatch_oauth_dispatches_post` (create dispatch).

---

### `groups/public.SKILL.md`

**When to use:**  
Use this file for **unauthenticated/public** endpoints such as health checks and route discovery.

**Covers operations (operation IDs):**

- `health_public_health_get`
- `list_routes_public_routes_get`
- `get_route_public_routes__route_id__get`

**Typical workflows within this file:**

- Call `health_public_health_get` to verify service availability.
- Use `list_routes_public_routes_get` to enumerate routes.
- Use `get_route_public_routes__route_id__get` to fetch details for a specific route ID.

---

## Cross-file workflows (how to combine segments)

- **Public discovery → Authenticated action**
  - Use `groups/public.SKILL.md` to confirm the API is up (`health_public_health_get`) and to find route context (`list_routes_public_routes_get`, `get_route_public_routes__route_id__get`).
  - Then switch to the required auth segment depending on the task:
    - OAuth2 dispatch creation: `groups/oauth2.SKILL.md` (`oauth_token_oauth_token_post` → `create_dispatch_oauth_dispatches_post`).
    - Incident retrieval via cookie auth: `groups/api-key-cookie.SKILL.md` (`session_login_session_login_post` → `cookie_incidents_apikey_cookie_incidents_get`).
    - Metrics via header key: `groups/api-key-header.SKILL.md` (`header_key_metrics_apikey_header_system_metrics_get`).
    - Admin depot creation: `groups/basic-auth.SKILL.md` (`create_depot_basic_admin_depots_post`).
    - Operator profile with existing token: `groups/bearer-auth.SKILL.md` (`bearer_profile_bearer_operators_me_get`).
    - Alerts with hybrid auth: `groups/hybrid-auth.SKILL.md` (`hybrid_alert_hybrid_alerts_get`).

- **OAuth2 multi-step (single segment, ordered operations)**
  - Stay within `groups/oauth2.SKILL.md` and sequence:
    1. `oauth_token_oauth_token_post`
    2. `oauth_profile_oauth_profile_get` and/or `create_dispatch_oauth_dispatches_post`

Choose the segment file based on the auth mechanism your task requires; do not mix operation IDs across segments unless explicitly performing a cross-file workflow as described above.
