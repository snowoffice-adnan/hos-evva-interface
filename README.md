# HOS EVVA Interface – XS3 MQTT Integration (NestJS)

This service provides a secure interface between **HOS Booking System** and **EVVA XS3** using MQTT + MAPI commands.
It handles:

- Login & session handling
- Programming access windows
- Assigning authorization profiles
- Smartphone updates (MSS)
- Medium revocation
- Queries (`identification-media`, `authorization-profiles`, etc.)
- Real-time reader state tracking

Developed in **NestJS** and shipped as a **Docker image** via GHCR.

## Features

- Full EVVA XS3 MAPI command support
- TLS MQTT client with certs
- Modular services:
    - `EvvaAccessService`
    - `EvvaSmartphoneService`
    - `EvvaQueryService`
- Strong DTO validation
- Global error handling
- Production-ready Dockerfile
- GitHub Actions CI/CD

## Project Structure

```
src/
  main.ts
  app.module.ts

  mqtt/
    mqtt.module.ts
    mqtt.service.ts

  evva/
    evva.module.ts
    evva.service.ts
    state.service.ts
    evva.controller.ts

    evva-access.service.ts
    evva-smartphone.service.ts
    evva-query.service.ts

    dto/
      *.dto.ts

  common/
    http-exception.filter.ts
    response.ts

config/
  evva.config.ts

Dockerfile
docker-compose.yml
.env
.env.example
```

## Local Development

### 1. Install dependencies

```
npm install
```

### 2. Copy environment file

```
cp .env.example .env
```

Edit values accordingly.

### 3. Run locally

```
npm run start:dev
```

## Running With Docker

### Build manually

```
docker build -t evva-interface .
docker run --env-file .env -p 3000:3000 evva-interface
```

### Using docker-compose

```
docker compose up -d
```

Your certs (mqtt.pem, mqtt.key, ca.pem) should be mounted inside `/run/certs`:

```
certs/
  mqtt.pem
  mqtt.key
  ca.pem
```

Example override:

```yaml
volumes:
  - ./certs:/run/certs:ro
env_file:
  - .env
```

## Required Environment Variables

See `.env.example`:

```
MQTT_HOST=<MQTT_SERVER_HOSTNAME_OR_IP>
MQTT_PORT=11883
MQTT_CLIENT_ID=<UNIQUE_CLIENT_ID>
MQTT_TOKEN=<MQTT_LOGIN_TOKEN>

MQTT_CERT_PATH=mqtt.pem
MQTT_KEY_PATH=mqtt.key
MQTT_CA_PATH=ca.pem

XS3_USERNAME=<XS3_USERNAME>
XS3_PASSWORD=<XS3_PASSWORD>

API_PREFIX=api/v1
PORT=3000
```

## API Endpoints

Base URL:

```
http://localhost:3000/api/v1/integrations/evva/xs3
```

### Example endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/authorization-profiles` | List EVVA authorization profiles |
| GET | `/identification-media` | List media |
| POST | `/set-access-begin` | Set access begin |
| POST | `/set-access-end` | Set access end |
| POST | `/extend-access` | Set begin + end together |
| POST | `/assign-auth-profile` | Assign profile to medium |
| POST | `/program` | Program access window + profile |
| POST | `/mss/confirm` | Confirm smartphone update |
| POST | `/mss/revoke-smartphone` | Revoke smartphone medium |
| GET | `/reader-state` | Last detected medium at coding station |

## Certificates

Certs must be **real files**, not inline strings.

Required:

```
mqtt.pem   (client cert)
mqtt.key   (private key)
ca.pem     (CA cert)
```

In Docker they are mounted under:

```
/run/certs/
```

## CI/CD (GitHub Actions)

Every push to `main` automatically:

- Builds Docker image
- Tags it (`latest`, branch, SHA, semver)
- Pushes to GHCR

Workflow file:  
`.github/workflows/build-and-deploy.yml`


## License

Private / Internal — © SnowOffice.
