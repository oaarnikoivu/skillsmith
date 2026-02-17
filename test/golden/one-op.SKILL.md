# demo Skill

## Scope

Use this skill to interact with the demo API (version `1.0.0`).

## Servers

- `https://api.example.com`

## Operations

### `create_club`

Method: `POST`
Path: `/clubs`
Summary: Create club

Parameters:
| Name | In | Required | Type | Default | Enum | Description |
| --- | --- | --- | --- | --- | --- | --- |
`include_meta` | `query` | no | `boolean` | `false` | |

Request Body:

- Required: yes
- Content types: `application/json`
- Schema: `object(1 properties)`

Responses:

- `201` - Created (`object(1 properties)`)

Example request:

```bash
curl -X POST "https://api.example.com/clubs?include_meta=true" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example Club"}'
```
