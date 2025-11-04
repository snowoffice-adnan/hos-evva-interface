# ---------- 1) Build stage ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Install all deps (incl. dev) for building
COPY package*.json ./
RUN npm ci

# Copy source
COPY tsconfig*.json ./
COPY src ./src
COPY nest-cli.json ./

# Build
RUN npm run build

# ---------- 2) Runtime stage ----------
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Install only production deps (as root)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled app
COPY --from=builder /app/dist ./dist

# Drop privileges
USER node

# Expose app port
EXPOSE 3000

CMD ["node", "dist/main.js"]
