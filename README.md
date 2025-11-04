# HOS - EVVA Interface

NestJS service for EVVA XS3 integration with a **manager stack** (API + Postgres) and **per‑tenant** containers.  
CI/CD builds the Docker image and deploys it to your droplet.

---

## Architecture

```
GitHub → CI/CD → GHCR (ghcr.io/snowoffice/hos-evva-interface:<tag>)
                                   |
                                   v
/srv/evva
├─ docker-compose.yml   (main compose file)
├─ .env                 (runtime environment)
└─ certs/               (mqtt.pem, mqtt.key, ca.pem)
```

- The app exposes its API under `/api/v1/integrations/evva/xs3`.
- Connects directly to the EVVA XS3 MQTT broker using the provided.
- Each environment (e.g. `dev`, `prod`) can run as separate container with its own `.env` and certs.

---

## Prerequisites

- Node.js 20+ (for local development)
- Docker & Docker Compose v2
- Droplet with Docker
- Access to GHCR (GitHub Container Registry)

---

## Local Development

Create a local `.env`:

```ini
MQTT_HOST=152.53.32.187
MQTT_PORT=11883
MQTT_CLIENT_ID=56925ce5-e94c-4c10-8911-09aa3cec2701
MQTT_TOKEN=JDJhJDEwJE5RYVdhWW0vUE5xRGouMG8zWC5qck9ENnB6ZEFYUDRrR0ZiSEs5Ukk5ZVZUb1liV2Jtdy9h

MQTT_CERT_PATH=certs/mqtt.pem
MQTT_KEY_PATH=certs/mqtt.key
MQTT_CA_PATH=certs/ca.pem

CODING_STATION_UUID=3cbe3b14-d813-4c42-afd4-1877169caa94

XS3_ACK_TIMEOUT_BEGIN_MS=750
XS3_ACK_TIMEOUT_END_MS=750
XS3_ACK_TIMEOUT_MS=10000
XS3_CONFIRM_TRIES=5
XS3_CONFIRM_SLEEP_MS=200

API_PREFIX=api/v1
PORT=3000
```

Install & run locally:

```bash
npm install
npm run start          # or: npm run start:dev
```

> The app uses a global route prefix **`/api/v1`**.

---

## Docker Image (manual — CI/CD builds automatically)

Login to GHCR:

```bash
echo <PAT_OR_GITHUB_TOKEN> | docker login ghcr.io -u <USERNAME> --password-stdin
```

Build & push:

```bash
docker build -t ghcr.io/snowoffice/hos-evva-interface:latest .
docker push ghcr.io/snowoffice/hos-evva-interface:latest
```

---

## Server Layout (Droplet)

Everything lives under **`/srv/evva`**:

```
/srv/evva
  ├─ docker-compose.yml         # container definition
  ├─ .env                       # environment config (used by container)
  └─ certs
      ├─ mqtt.pem                
      ├─ mqtt.key            
      └─ ca.pem
```

Example `.env` on the droplet:

```ini
MQTT_HOST=152.53.32.187
MQTT_PORT=11883
MQTT_CLIENT_ID=56925ce5-e94c-4c10-8911-09aa3cec2701
MQTT_TOKEN=...

MQTT_CERT_PATH=/run/certs/mqtt.pem
MQTT_KEY_PATH=/run/certs/mqtt.key
MQTT_CA_PATH=/run/certs/ca.pem

CODING_STATION_UUID=3cbe3b14-d813-4c42-afd4-1877169caa94
PORT=3000
API_PREFIX=api/v1
```
---

## Docker Compose

`/srv/evva/docker-compose.yml:`:

```yaml
services:
  evva-interface:
    image: ghcr.io/snowoffice/hos-evva-interface:latest
    env_file:
      - .env
    volumes:
      - ./certs:/run/certs:ro
    ports:
      - "3000:3000"
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:${PORT:-3000}/${API_PREFIX:-api/v1}/integrations/evva/xs3/reader-state >/dev/null 2>&1 || exit 1"]
      interval: 30s
      timeout: 3s
      start_period: 30s
      retries: 3
```

---

## Deployment Steps

### 1. Log in to GHCR (only once per server)

`echo "<GHCR_PAT>" | docker login ghcr.io -u snowoffice --password-stdin`

### 2. Deploy or update

```
cd /srv/evva
docker compose pull
docker compose up -d
docker compose ps
```

### 3. Check logs

```
docker compose logs -f
```

### 4. Test API
```
curl http://localhost:3000/api/v1/integrations/evva/xs3/reader-state
```

---

## CI/CD (GitHub Actions)

`.github/workflows/build-and-deploy.yml`

- **Build**: uses `docker/build-push-action` to build and push to GHCR with tags `latest` and short SHA.


- **Deploy**: SSH to droplet, updates manager stack, then loops through `/srv/evva/clients/*/compose.env` and runs `docker compose -p evva_<tenantId> -f docker-compose.yml up -d` for each tenant.
 

- Prunes old images at the end.

Secrets required:
- `GHCR_USER`, `GHCR_PAT` (for `docker login ghcr.io` in the deploy step)
- `DO_HOST`, `DO_USER`, `DO_SSH_KEY` (for SSH)

---

## Operations Cheat‑Sheet

**Check container**
```bash
docker ps
docker inspect --format='{{.State.Health.Status}}' evva-interface 
```

**View logs**
```bash
docker compose logs -f
```

**Redeploy**
```bash
docker compose pull
docker compose up -d
```

**Clean old image**
```bash
docker image prune -f
```
---

## Troubleshooting


- **Cert not found**  
  Ensure files exist under `/srv/evva/certs/` and match paths in `.env`.


- **PEM routines::no start line**  
  The certificate or key file is empty or corrupted (must start with `-----BEGIN CERTIFICATE-----`).


- **Healthcheck failing**  
  Verify that `/api/v1/integrations/evva/xs3/reader-state` responds correctly inside the container.


- **Connection refused**  
  Check `MQTT_HOST`, `MQTT_PORT`, and ensure the droplet can reach the broker network.

---

## License

Private / internal.
