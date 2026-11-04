# DerKumpel

DerKumpel ist ein **offline-first, touch-optimierter PWA-Client für Redmine** im kommunalen Bauhof. Redmine bleibt das führende System für Benutzer, Gruppen, Rollen, Workflows, Tracker, Issues, Kommentare und Anhänge; DerKumpel macht diese Abläufe auf Diensthandys deutlich komfortabler und mehrere Stunden ohne Netz arbeitsfähig.

## Was DerKumpel kann

- `Meine Arbeit`: offene persönliche **und Gruppen-Zuweisungen** aus Redmine
- `Tickets`: Redmine-Browser für offene, geschlossene oder alle sichtbaren Tickets mit kompakter oder großer Kartenansicht, schlanker Suche und aufklappbaren Tracker-/Projektfiltern
- Smartphone-first Mantine UI mit großen Touch-Zielen
- einfacher Ticketmodus plus aufklappbares `Alle Angaben`
- Redmine-Statuswechsel inklusive `In Arbeit`, `unterbrochen`, `Erledigt` soweit der Workflow sie erlaubt
- Kommentare und private Notizen
- dynamische Custom Fields, Priorität, Zuweisung, Beginn/Fälligkeit und `% erledigt`
- Kamera -> Vorschau -> Verwenden/Verwerfen; Upload wird komprimiert und EXIF wird nicht absichtlich entfernt
- Bilder und sonstige Anhänge im Offline-Cache; fehlende Dateien können online gezielt nachgeladen werden
- moderne Timeline; technische Feldänderungen separat aufklappbar
- MapLibre + basemap.de Web Raster, native Navigation über die Karten-App des Handys, aufklappbare Kartenfilter für Umfang, Status, Priorität, Tracker und Projekt
- Karten-Fallback auf die Verbandsgemeinde Otterbach-Otterberg, wenn die aktuelle Auswahl keine Ticket-Koordinaten enthält
- eigene GPS-Position ausschließlich lokal auf dem Gerät
- optionale Offline-Karte, standardmäßig deaktiviert
- lokale gespeicherte Filter und Tracker-Ausschlüsse
- automatische Synchronisation bei Rückkehr ins Netz sowie manueller `Jetzt synchronisieren`-Button
- sichere Auto-Merges und sichtbare Konflikte bei echten Paralleländerungen
- Cache-Bereinigung standardmäßig nach 30 Tagen, einstellbar
- eigenes DerKumpel-PNG-Branding für App, Favicon, Apple-Touch-Icon und PWA-Manifest
- optionales Web Push mit individuell erlaubten Ereignisarten, VAPID, geschlossener PWA und direktem Ticket-Link

Das geplante elektronische **Rapportzettel-/Zeiterfassungssystem** wird bewusst noch nicht implementiert. Die Architektur hält dafür eine separate Backend-/Service-Grenze frei.

## Architektur

```text
Smartphone/PWA
  ├─ App Shell / Service Worker
  ├─ IndexedDB (Issues, Anhänge, Outbox, Settings)
  └─ same-origin /api
          │
          ▼
  stateless Fastify BFF
          │
          ▼
  Redmine REST API
```

Der Kern-BFF hat **keine Datenbank und keinen Redis**. Wird Web Push aktiviert, speichert ein optionaler Adapter ausschließlich Geräte-Abonnements in einem kleinen privaten Docker-Volume. Er isoliert die Redmine-Zugangsdaten vom JavaScript-Client, übersetzt mobile API-Aufrufe und reicht nur explizit freigegebene Redmine-Funktionen durch. Benutzername/Passwort werden nach erfolgreicher Prüfung ausschließlich in einer AES-256-GCM-verschlüsselten, `HttpOnly`/`Secure` Session-Cookie transportiert; sie landen nicht in IndexedDB oder localStorage.

## Schnellinstallation mit externem Reverse Proxy

Voraussetzungen: Docker Engine, Docker Compose v2 und `openssl`.

```sh
./setup.sh install \
  --base-url https://derkumpel.example.org \
  --redmine-url https://redmine.vgo-o.de
```

Standardmäßig lauscht DerKumpel nur auf `127.0.0.1:8080`. Der vorhandene Reverse Proxy terminiert HTTPS und leitet auf diesen Port weiter.

Das Setup erzeugt eine `.env` mit restriktiven Rechten und einem zufälligen 256-Bit-Session-Key, baut den Container und startet ihn. Es wird **keine zusätzliche Datenbank** benötigt.

Falls das Checkout das Execute-Bit nicht erhalten hat, funktioniert identisch:

```sh
sh setup.sh install --base-url https://derkumpel.example.org
```

### Optional mit Caddy

Wenn DerKumpel selbst HTTPS terminieren soll und DNS bereits auf den Host zeigt:

```sh
./setup.sh caddy
```

Dies startet das Compose-Profil `caddy` mit Ports 80/443. Der Default bleibt bewusst der Betrieb hinter einem vorhandenen Reverse Proxy.

## Manuelle Installation

```sh
cp .env.example .env
openssl rand -base64 32
# Ausgabe als SESSION_SECRET eintragen, PUBLIC_BASE_URL/REDMINE_BASE_URL setzen
docker compose up -d --build app
```

Status und Logs:

```sh
./setup.sh status
./setup.sh logs
```

Update:

```sh
./setup.sh update
```

## Wichtige Konfiguration

- `REDMINE_BASE_URL` – Redmine-Origin, standardmäßig `https://redmine.vgo-o.de`
- `PUBLIC_BASE_URL` – öffentliche HTTPS-URL von DerKumpel
- `SESSION_SECRET` – exakt 32 zufällige Bytes als Base64
- `BIND_ADDRESS` – Default `127.0.0.1`
- `APP_PORT` – Default `8080`
- `POLL_INTERVAL_MS` – wird technisch auf mindestens 120000 ms begrenzt
- `MAP_DEFAULT_CENTER` – `lon,lat`
- `MAP_OFFLINE_BOUNDS` – optional `west,south,east,north`; bevorzugt für die Verwaltungsgrenze
- `MAP_OFFLINE_RADIUS_KM` – Fallback, wenn keine feste Grenze konfiguriert ist
- `PUSH_ENABLED` und `PUSH_VAPID_*` – optionaler Push-Dienst, siehe `docs/PUSH_NOTIFICATIONS.md`

## Betrieb

Healthchecks:

- `/api/health/live`
- `/api/health/ready`

DerKumpel hat serverseitig keine zu sichernde Fachdatenbank. Redmine bleibt das Backup-System für Geschäftsdaten. Lokale PWA-Caches sind Arbeitskopien, keine Backups.

Die PWA darf nach einer einmaligen erfolgreichen Anmeldung im Funkloch mit bereits synchronisierten Daten weiterarbeiten. Offline-Änderungen werden zuerst dauerhaft in der lokalen Outbox gespeichert und später gegen den aktuellen Redmine-Stand abgeglichen. Geschlossene bzw. andere nur über den Ticketbrowser geöffnete Tickets werden bei Bedarf in den lokalen Cache übernommen und unterliegen derselben Aufbewahrungslogik.

## Push auf Linux automatisch einrichten

Für euren Aufbau mit Redmine-Docker auf einem **anderen Server** stehen zwei Verfahren zur Auswahl:

```bash
# Ohne Eingriff auf dem Redmine-Server (API-Polling, Admin-API-Key liegt nur auf DerKumpel):
./setup.sh push --push-mode polling --redmine-api-key-file /root/redmine-admin.key

# Oder mit Redmine-Ereignis-Plugin über SSH (weniger API-Aufrufe):
./setup.sh push --push-mode plugin --redmine-ssh admin@redmine-host \
  --redmine-compose-dir /opt/redmine --redmine-service redmine
```

Mit `./setup.sh push` wird interaktiv nach der Methode und den nötigen Angaben gefragt. Beim Polling ist **ein Redmine-Administrator-API-Key** erforderlich, weil die App Ticket-Sichtbarkeit für jede benachrichtigte Person sicher über Redmine-Impersonation prüfen muss.

Alternativ werden `--redmine-compose-dir` (Redmine in Docker Compose) oder `--redmine-ssh user@host` (Redmine auf einem zweiten Linux-Server) unterstützt. VAPID-Schlüssel und Event-Token werden sicher erzeugt und bei späteren Aufrufen **nicht rotiert**. Die `.env` bleibt ansonsten unverändert. Für genaue Voraussetzungen und Beispiele siehe [Push-Installation](docs/PUSH_NOTIFICATIONS.md).


## Web Push

**Implementiert als opt-in Integration:** VAPID Web Push, Push-Abos nur für das authentifizierte Redmine-Konto, private JSON-Persistenz für Endpunkte, ein installierbares Redmine-5.x-Plugin als Ereignisquelle, pro Gerät einstellbare Ereignisarten sowie Service-Worker-Benachrichtigungen mit Direktlink zum Ticket. Alternativ gibt es jetzt einen **pluginfreien REST-Worker im bestehenden Fastify-Server**. In diesem Modus braucht Redmine keinen zusätzlich installierten Worker/Plugin; nur HTTPS, aktivierte REST-API und einen Admin-API-Key. Die Plugin-Methode bleibt vollständig erhalten. Beide Modi können im Linux-Setup gewählt werden. Details, Secrets und Kompatibilitätsprüfung: [Push-Deployment](docs/PUSH_NOTIFICATIONS.md).

## Entwicklungsorganisation

Wie im Vorbildprojekt ist „Spezifikation vor Code“ verbindlich. Entwicklungsagenten lesen zuerst `AGENTS.md` und anschließend:

- `docs/PRODUCT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY_PRIVACY.md`
- `docs/USER_FLOWS.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/ROADMAP.md`
- `docs/ACCEPTANCE_TESTS.md`
- `docs/IMPLEMENTATION_DECISIONS.md`
- `docs/OPERATIONS.md`

CI prüft TypeScript, Tests, Produktionsbuild, Dependency-Audit, Compose-Konfiguration, Docker-Image und einen gestarteten Container samt Readiness-Endpoint.
