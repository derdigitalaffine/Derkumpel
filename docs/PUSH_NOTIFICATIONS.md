# Push-Benachrichtigungen für DerKumpel

Web Push ist **optional**. Ohne Konfiguration arbeitet DerKumpel weiterhin wie bisher ohne Push. Der Hauptserver benötigt weder Redmine-Datenbankkopie noch Poller/Broker: Nur die Geräte-Abonnements werden im benannten Docker-Volume `push_data` gespeichert. Die Event-Quelle ist Redmine selbst.

## Automatische Linux-Installation (empfohlen)

Nach der normalen DerKumpel-Installation auf dem **DerKumpel-Linux-Server** aus dem Repository heraus ausführen:

```bash
# Wenn Redmine als klassischer Linux-/systemd-Dienst auf demselben Server läuft:
./setup.sh push --redmine-path /opt/redmine --redmine-service redmine

# Wenn Redmine als Docker-Compose-Projekt auf demselben Server läuft:
./setup.sh push --redmine-compose-dir /opt/redmine-compose --redmine-service redmine

# Wenn Redmine auf einem anderen Linux-Server läuft (SSH-Zugang mit sudo -n):
./setup.sh push --redmine-ssh admin@redmine-host --redmine-path /opt/redmine

# Oder Redmine remote als Docker Compose:
./setup.sh push --redmine-ssh admin@redmine-host --redmine-compose-dir /opt/redmine
```

Falls exakt **eine** native Redmine-Installation in einem der üblichen Verzeichnisse erkannt wird, genügt `./setup.sh push`. Die Pfade und SSH-Namen oben sind **Beispiele** und müssen zur tatsächlichen Installation passen. Bei uneindeutiger oder unbekannter Installation bricht das Skript bewusst ab, statt den falschen Dienst zu ändern.

Das Skript erledigt automatisch: Docker-Image bauen, VAPID-Schlüssel erzeugen oder **unverändert wiederverwenden**, starkes Webhook-Token erzeugen, ausschließlich Push-Variablen in der bestehenden `.env` sicher aktualisieren (Berechtigung `0600`), DerKumpel neu erstellen und den aktiven Push-Konfigurationsendpunkt prüfen. Anschließend wird das Plugin auf dem Redmine-Server installiert, sein Token über eine root-geschützte Environment-Datei konfiguriert und der Redmine-Dienst neu gestartet. Bei Docker Compose erstellt es eine dauerhaft automatisch berücksichtigte `compose.override.yaml` und eine persistente Host-Einbindung für das Plugin.

**Voraussetzungen:** Linux mit Docker Engine/Compose v2 und OpenSSL; die DerKumpel-`.env` muss bereits existieren und `PUBLIC_BASE_URL` auf HTTPS zeigen. Für native Redmine-Installationen sind `sudo` und ein systemd-Service nötig. Für einen anderen Server benötigt der ausführende Benutzer SSH-Zugang mit **passwortlosem sudo** auf dem Zielhost. Ein vorhandenes fremdes Redmine-`compose.override.*` wird nicht überschrieben: in diesem Fall muss der Override vorab kontrolliert und zusammengeführt werden. Der Docker-Container nutzt standardmäßig `/usr/src/redmine/plugins/derkumpel_push`; bei anderen Images lässt sich dies mit `--redmine-plugin-dir` ändern.

Wenn die Redmine-Installation anders verwaltet wird, kann mit `./setup.sh push --app-only` nur DerKumpel aktiviert werden; die Plugin-Integration aus Abschnitt 2 erfolgt dann getrennt. **`--app-only` bedeutet ausdrücklich: keine Push-Ereignisse aus Redmine**, solange dort kein Event-Adapter eingerichtet ist.

Das Skript ist wiederholt ausführbar und **rotiert weder vorhandene VAPID-Schlüssel noch das Event-Token**. Es berührt `SESSION_SECRET` nicht. VAPID-Schlüssel dürfen nicht regelmäßig erneuert werden, sonst verlieren zuvor registrierte Geräte die Funktion. Die Schlüssel werden nicht im Terminal ausgegeben. Aus Sicherheitsgründen wird weder ein fremder Compose-Override automatisch ersetzt noch der Inhalt fremder `.env`-Dateien als Shell-Code ausgeführt. Vor der Installation eine Sicherung der Serverkonfiguration erstellen.

**Nach der Installation:** Auf dem Handy in DerKumpel unter „Mehr → Push-Benachrichtigungen“ aktivieren und mit zwei Redmine-Konten testen. GitHub-CI prüft das Installationsskript mit simuliertem Docker/Secrets; sie kann keinen produktiven Redmine-Service neugestarten oder echte Geräte-Pushs bestätigen.

---

## 1. DerKumpel konfigurieren

In der DerKumpel-Installation einen stabilen VAPID-Schlüsselsatz erzeugen (nach `npm ci`):

```sh
npm exec --workspace @derkumpel/api -- web-push generate-vapid-keys --json
openssl rand -hex 32
```

Die VAPID-Schlüssel dauerhaft sicher sichern. **Nicht bei jedem Deploy wechseln**, sonst verlieren installierte Geräte ihre Push-Registrierung. `.env` ergänzen:

```env
PUSH_ENABLED=true
PUSH_VAPID_PUBLIC_KEY=<aus generate-vapid-keys>
PUSH_VAPID_PRIVATE_KEY=<aus generate-vapid-keys>
PUSH_VAPID_SUBJECT=mailto:it@example.org
PUSH_EVENT_TOKEN=<64 hex Zeichen aus openssl rand -hex 32>
PUSH_STORE_FILE=/app/push-data/subscriptions.json
```

Niemals VAPID-Private-Key oder Event-Token ins Frontend, Manifest, Git oder Tickets kopieren. Die Datei wird im Volume `push_data` gespeichert; **Volume bei einem normalen Upgrade nicht löschen**. Nur ein DerKumpel-App-Container darf dieses Volume gleichzeitig beschreiben; für horizontale Skalierung wäre später ein transaktionaler Store nötig.

```sh
docker compose up -d --build --force-recreate app
curl -s https://rm.tromu.de/api/push/config
```

Erwartet: `{"enabled":true,"publicKey":"..."}`.

## 2. Redmine-Plugin installieren (Redmine 5.x)

Das Plugin unter `integrations/redmine/plugins/derkumpel_push` ist ein **separater Integrationsbaustein**. Auf dem Redmine-Server das Verzeichnis nach `REDMINE_ROOT/plugins/derkumpel_push` kopieren und in der Redmine-Prozessumgebung konfigurieren:

```env
DERKUMPEL_PUSH_URL=https://rm.tromu.de
DERKUMPEL_PUSH_EVENT_TOKEN=<derselbe Wert wie PUSH_EVENT_TOKEN>
```

Redmine-Prozesse anschließend neu starten. Bei Containern müssen diese Variablen in der Redmine-Service-Umgebung gesetzt sein, nicht nur in DerKumpel. Falls Redmine keinen Internetzugriff auf `rm.tromu.de` hat, muss der Zugriff erst ermöglicht werden. Die Verbindung ist HTTPS mit normaler Zertifikatsprüfung; keine TLS-Abschaltung.

Das Plugin verwendet die `after_commit`-Hooks von **Issue** und **Journal**, damit auch Änderungen über die Redmine-REST-API, Web-Oberfläche und Bulk-Updates erkannt werden. Aufträge/Kommentare werden nicht synchron an den DerKumpel-Server gesendet, sondern über den bestehenden `ActiveJob`-Adapter von Redmine verschickt. Für hochverfügbaren Betrieb ist ein persistenter Redmine-Job-Adapter sinnvoll; der Redmine-Standard `AsyncAdapter` kann bei Neustarts noch nicht abgeschlossene Jobs verlieren.

Benachrichtigte Benutzer bestimmt ausschließlich **Redmine**:
- Direkt zugewiesener Benutzer oder alle aktiven Mitglieder einer zugewiesenen Gruppe.
- `issue.visible?(user)` muss gelten.
- Private Notizen nur für Rollen mit `view_private_notes`.
- Keine Watcher-Benachrichtigungen und keine Benachrichtigung an den Verfasser selbst.
- Bei Zuweisungen, Status, Kommentaren, Priorität und Beginn/Fälligkeit wird ein Ereignis erzeugt.
- Ticket-Subjekt, Kommentartext, Koordinaten, Kontakte und Anhänge werden **nicht** als Push-Payload übertragen. Sperrbildschirme zeigen nur Ereignisart und Ticketnummer.

## 3. Auf dem Handy aktivieren

1. DerKumpel **über HTTPS** öffnen und anmelden. Unter iOS/iPadOS die PWA zum Home-Bildschirm hinzufügen und *von dort* starten. Android/Chromium kann Push auch ohne Installation unterstützen.
2. In **Mehr → Push-Benachrichtigungen** auf „Push erlauben und aktivieren“ tippen und die Systemfrage erlauben. Die App fragt **nicht ungefragt beim Start**.
3. Ereignisarten individuell aktivieren/deaktivieren. Änderungen aktualisieren das Geräte-Abo.
4. „Push deaktivieren“ entfernt das Abonnement. Beim Abmelden wird es lokal deaktiviert und – falls online – serverseitig gelöscht.

Ein Push-Tipp öffnet `/issues/<id>` direkt in DerKumpel. Der Dienst benötigt Browser-Unterstützung, eine vom Gerät erreichbare Push-Infrastruktur und eine gültige Berechtigung. Push ist keine garantierte Echtzeit-Zustellung: Betriebssystem-Batterieoptimierung, fehlendes Netz und Benachrichtigungseinstellungen beeinflussen die Zustellung. Die 120-Sekunden-Client-Synchronisation bleibt unverändert und bildet den verlässlichen Datenpfad.

## 4. Abnahme / Fehleranalyse

1. Erst auf einer **Staging-Instanz** mit zwei Redmine-Konten und einem Gruppenticket testen.
2. Zwei reale Geräte anmelden und Push erlauben. Einen neuen Gruppenauftrag zuweisen.
3. Redmine-Status/Kommentar durch einen *anderen* Benutzer ändern. Test mit geschlossener installierter PWA, dann Push antippen und Ticket öffnen.
4. Die fünf Präferenzen einzeln deaktivieren und prüfen; private Notizen dürfen nur berechtigte Benutzer benachrichtigen.
5. Browserbenachrichtigung verweigern und danach erlauben. Push deaktivieren/abmelden. Konto-Wechsel auf demselben Gerät.
6. Redmine-Joblogs prüfen. HTTP 401/403 → Token/HTTPS/Origin; HTTP 503 → Push nicht aktiviert; abonnierte Geräte ohne Ereignis → Redmine-Plugin/Job-Adapter; Ereignis ohne Zustellung → Push-Dienst des Browsers/Berechtigung.
7. Nicht vergessen: Redmine-5.0.5 und die installierten Plugins (`redmine_custom_workflows`, `view_customize`, `redmine_issue_templates`) müssen **gegen die echte Installation** kompatibilitätsgeprüft werden. Node-CI testet nicht die echte Redmine-Runtime.

## API / Vertrauensgrenzen

- `GET /api/push/config` gibt nur Aktivierung und öffentlichen VAPID-Schlüssel aus.
- `POST /api/push/subscriptions` und `/api/push/unsubscribe` benötigen eine gültige Redmine-Sitzung und werden gegen die aktuelle Redmine-Benutzer-ID gebunden.
- `POST /api/push/events` nimmt nur vertrauenswürdige Redmine-Plugin-Events über `X-DerKumpel-Event-Token` an; Browser bekommen dieses Geheimnis nie.
- Geräteendpunkte sind auf bekannte Push-Service-Hosts beschränkt, um serverseitige URL-Fetches zu fremden Hosts zu unterbinden.
- Die Geräte-Abos werden in einer serverseitigen JSON-Datei mit `0600` gespeichert; Transport nach außen erfolgt verschlüsselt via Web Push. Für Backup und Zugriffsschutz wie ein Secret behandeln.
