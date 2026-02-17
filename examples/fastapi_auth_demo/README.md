# FastAPI Auth Demo Example

This example API is designed to produce an OpenAPI schema with:

- multiple route styles (path params, query params, body models)
- multiple auth schemes
  - HTTP Basic
  - HTTP Bearer
  - API key in header
  - API key in cookie
  - OAuth2 password flow
  - hybrid route accepting bearer **or** header key

Domain: city transit operations (not tennis-related).

## Files

- `app.py`: FastAPI server with demo routes and auth
- `export_openapi.py`: writes OpenAPI JSON to disk
- `pyproject.toml`: uv-managed project/dependencies

## Run the server (uv)

### macOS / Linux

```bash
cd examples/fastapi_auth_demo
uv sync
uv run uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

### Windows (PowerShell)

```powershell
cd examples/fastapi_auth_demo
uv sync
uv run uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

OpenAPI URL while running:

- `http://127.0.0.1:8000/openapi.json`

## Export OpenAPI JSON to file

```bash
cd examples/fastapi_auth_demo
uv run python export_openapi.py --output openapi.generated.json
```

## Demo credentials / secrets

- Basic auth: `admin` / `admin-password`
- Bearer token: `demo-bearer-token`
- Header API key (`x-api-key`): `demo-header-api-key`
- Session cookie (`session_token`): `demo-session-token`
- OAuth password grant user/pass: `oauth-user` / `oauth-password`
- OAuth access token: `demo-oauth-token`

## Quick auth route checks

### Public

```bash
curl "http://127.0.0.1:8000/public/health"
```

### Basic auth

```bash
curl -u admin:admin-password -X POST \
  "http://127.0.0.1:8000/basic/admin/depots" \
  -H "content-type: application/json" \
  -d '{"name":"Central Depot","city":"Helsinki","max_vehicles":220}'
```

### Bearer auth

```bash
curl -H "Authorization: Bearer demo-bearer-token" \
  "http://127.0.0.1:8000/bearer/operators/me"
```

### API key header

```bash
curl -H "x-api-key: demo-header-api-key" \
  "http://127.0.0.1:8000/apikey-header/system-metrics"
```

### API key cookie via login

```bash
curl -c /tmp/demo.cookies -X POST \
  "http://127.0.0.1:8000/session/login" \
  -H "content-type: application/json" \
  -d '{"username":"admin","password":"admin-password"}'

curl -b /tmp/demo.cookies "http://127.0.0.1:8000/apikey-cookie/incidents"
```

### OAuth2 password flow

```bash
curl -X POST "http://127.0.0.1:8000/oauth/token" \
  -H "content-type: application/x-www-form-urlencoded" \
  -d "username=oauth-user&password=oauth-password"

curl -H "Authorization: Bearer demo-oauth-token" \
  "http://127.0.0.1:8000/oauth/profile"
```

## Use with openapi-to-skillmd

Example URL input:

```bash
node dist/cli.js generate \
  --input http://127.0.0.1:8000/openapi.json \
  --provider openai \
  --model gpt-5.2
```

If you prefer file input:

```bash
node dist/cli.js generate \
  --input examples/fastapi_auth_demo/openapi.generated.json \
  --provider openai \
  --model gpt-5.2
```
