import assert from "node:assert/strict";
import test from "node:test";
import { validateNoSecretLeaks } from "../dist/validate/secret-leak.js";

test("secret-leak: detects OpenAI key pattern", () => {
  const markdown = "Use this key: sk-abcdefghijklmnopqrstuvwxyz1234567890abcd";
  const diagnostics = validateNoSecretLeaks(markdown);
  assert.ok(diagnostics.some((d) => d.code === "OUTPUT_SECRET_LIKELY"));
  assert.ok(diagnostics.some((d) => d.message.includes("OpenAI API key")));
});

test("secret-leak: detects Anthropic key pattern", () => {
  const markdown = "Key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890";
  const diagnostics = validateNoSecretLeaks(markdown);
  assert.ok(diagnostics.some((d) => d.code === "OUTPUT_SECRET_LIKELY"));
  assert.ok(diagnostics.some((d) => d.message.includes("Anthropic API key")));
});

test("secret-leak: detects JWT pattern", () => {
  const markdown =
    "Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
  const diagnostics = validateNoSecretLeaks(markdown);
  assert.ok(diagnostics.some((d) => d.code === "OUTPUT_SECRET_LIKELY"));
  assert.ok(diagnostics.some((d) => d.message.includes("JWT")));
});

test("secret-leak: placeholder $API_KEY is not flagged", () => {
  const markdown = 'curl -H "Authorization: Bearer $API_KEY" "https://api.example.com"';
  const diagnostics = validateNoSecretLeaks(markdown);
  assert.equal(diagnostics.length, 0);
});

test("secret-leak: placeholder <your-token> is not flagged", () => {
  const markdown = 'curl -H "Authorization: Bearer <your-token>" "https://api.example.com"';
  const diagnostics = validateNoSecretLeaks(markdown);
  assert.equal(diagnostics.length, 0);
});

test("secret-leak: Authorization header with real value is detected", () => {
  const markdown =
    'curl -H "Authorization: Bearer real-bearer-token-1234567890" "https://api.example.com"';
  const diagnostics = validateNoSecretLeaks(markdown);
  assert.ok(diagnostics.some((d) => d.code === "OUTPUT_SECRET_HEADER_LITERAL"));
});

test("secret-leak: Authorization header with placeholder is not flagged", () => {
  const markdown = 'curl -H "Authorization: Bearer $BEARER_TOKEN" "https://api.example.com"';
  const diagnostics = validateNoSecretLeaks(markdown);
  assert.equal(diagnostics.length, 0);
});

test("secret-leak: x-api-key header with real value is detected", () => {
  const markdown = 'curl -H "x-api-key: my-secret-api-key-value-here" "https://api.example.com"';
  const diagnostics = validateNoSecretLeaks(markdown);
  assert.ok(diagnostics.some((d) => d.code === "OUTPUT_SECRET_HEADER_LITERAL"));
});

test("secret-leak: x-api-key header with placeholder is not flagged", () => {
  const markdown = 'curl -H "x-api-key: $API_KEY" "https://api.example.com"';
  const diagnostics = validateNoSecretLeaks(markdown);
  assert.equal(diagnostics.length, 0);
});

test("secret-leak: basic auth URL with literal username and placeholder password is not flagged", () => {
  const markdown = 'curl "https://admin:$API_PASSWORD@api.example.com/secure"';
  const diagnostics = validateNoSecretLeaks(markdown);
  assert.equal(diagnostics.length, 0);
});

test("secret-leak: basic auth URL with literal password is detected", () => {
  const markdown = 'curl "https://$API_USERNAME:real-password-123@api.example.com/secure"';
  const diagnostics = validateNoSecretLeaks(markdown);
  assert.ok(diagnostics.some((d) => d.code === "OUTPUT_SECRET_HEADER_LITERAL"));
});

test("secret-leak: detects GitHub token pattern", () => {
  const markdown = "Token: ghp_abcdefghijklmnopqrstuvwxyz1234567890";
  const diagnostics = validateNoSecretLeaks(markdown);
  assert.ok(diagnostics.some((d) => d.code === "OUTPUT_SECRET_LIKELY"));
  assert.ok(diagnostics.some((d) => d.message.includes("GitHub token")));
});

test("secret-leak: detects private key block", () => {
  const markdown = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...";
  const diagnostics = validateNoSecretLeaks(markdown);
  assert.ok(diagnostics.some((d) => d.code === "OUTPUT_SECRET_LIKELY"));
  assert.ok(diagnostics.some((d) => d.message.includes("private key")));
});

test("secret-leak: clean markdown produces no diagnostics", () => {
  const markdown = [
    "# API Skill",
    "",
    "## Operations",
    "",
    "### `list_items`",
    "```bash",
    'curl -H "Authorization: Bearer $API_TOKEN" "https://api.example.com/items"',
    "```",
  ].join("\n");
  const diagnostics = validateNoSecretLeaks(markdown);
  assert.equal(diagnostics.length, 0);
});

test("secret-leak: placeholder YOUR_API_KEY is not flagged", () => {
  const markdown = 'curl -H "Authorization: Bearer YOUR_API_KEY" "https://api.example.com"';
  const diagnostics = validateNoSecretLeaks(markdown);
  assert.equal(diagnostics.length, 0);
});
