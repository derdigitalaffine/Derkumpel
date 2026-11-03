# Security and privacy

## Threat model priorities

Derkumpel holds work-order content and attachments on personally assigned municipal phones. The primary risks are credential theft, unintended cross-user access, data left on a lost device, unsafe proxying to Redmine, and offline sync overwriting authoritative work.

## Credentials

- HTTPS is mandatory in production.
- Never store Redmine credentials in localStorage, sessionStorage or IndexedDB.
- The encrypted session cookie is `HttpOnly`, `Secure` in production, `SameSite=Strict`, path `/`.
- `SESSION_SECRET` must be 32 random bytes encoded as base64 and supplied via environment variable.
- Plaintext credentials exist only transiently in BFF memory for a Redmine request.
- Login errors must not reveal whether a username exists.
- Password changes/invalid credentials result in HTTP 401 and local reauthentication prompt on next online sync.

## Stateless BFF

- No generic arbitrary URL proxy.
- Only configured Redmine origin may be contacted.
- Validate numeric IDs and accepted query parameters.
- Limit upload size.
- Apply request timeouts.
- Do not log Authorization headers, cookies, passwords, request bodies containing credentials or file contents.
- Do not trust client-supplied Redmine permissions; Redmine API response is authoritative.

## Offline device data

The user explicitly chose no additional app PIN/biometric gate. Therefore rely on OS device lock and browser origin isolation. Provide one-tap local data deletion and automatic retention cleanup. Cache only data needed for work and do not indefinitely retain unassigned/closed issues.

## Location

Geolocation is optional and local-only. Never send current employee coordinates to the BFF or Redmine. Ticket coordinates from Redmine are business data and may be cached.

## Images

The product does not deliberately remove EXIF/GPS metadata. Compression code must preserve EXIF when supported. This means operators should understand that uploaded images may retain source metadata. Optimized offline previews do not need to preserve all metadata because they are not uploaded as the authoritative attachment.

## Headers

Production response headers should include CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, restrictive `Permissions-Policy` with geolocation allowed only for self, and frame protection.

## Secrets

`.env` is ignored. `.env.example` contains placeholders only. Compose never embeds production passwords.
