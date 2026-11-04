# Security and privacy

## Threat model priorities

Derkumpel holds work-order content and attachments on personally assigned municipal phones. The primary risks are credential theft, unintended cross-user access, data left on a lost device, unsafe proxying to Redmine, and offline sync overwriting authoritative work.

## Credentials

- HTTPS is mandatory in production.
- Never store Redmine credentials in localStorage, sessionStorage or IndexedDB.
- The encrypted session cookie is `HttpOnly`, `Secure` in production, `SameSite=Strict`, path `/`.
- `SESSION_SECRET` must be 32 random bytes encoded as base64 and supplied via environment variable.
- Core session plaintext credentials exist only transiently in BFF memory for a Redmine request. **Optional Web Push is a separate, informed-opt-in exception**: its durable database stores Redmine credentials AES-256-GCM encrypted with an independent, stable `PUSH_ENCRYPTION_SECRET` to poll Redmine while the app is closed. This must be treated as highly sensitive credential storage with restricted host access, volume backups and deletion policies.
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

## Push privacy & abuse boundaries

- Push is **disabled by default** and cannot be enabled without HTTPS, distinct VAPID keys, a contact address, stable 32-byte encryption secret and a writable SQLite volume.
- Only the employee's own Redmine account is used; changing its password causes stored push credentials and subscriptions to be discarded after the next 401.
- Subscription endpoints are restricted to known HTTPS browser push providers to prevent arbitrary server-side fetch / SSRF.
- Each subscription is bound to the authenticated Redmine user ID; clients cannot choose recipient account IDs.
- Redmine remains the authorization check for all assignments, group memberships and journal visibility. Notifications for tickets that become inaccessible are suppressed.
- Push message content is generic: no issue title, description, employee location, personal contact data or private notes. The link contains the ticket ID; opening it still goes through Redmine authorization.
- The API must not log push credentials, subscriptions, response bodies or stored encrypted values.
- Device preferences are opt-in and configurable by category. Unsubscribe removes its server endpoint; the last unsubscribe also removes the encrypted user credential and snapshots.
- Regular backups of `push_data` and the encryption key must be secured together. If the volume/key is lost, employees must re-enable Push. Do not roll encryption keys without a migration/re-enrollment plan.

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
