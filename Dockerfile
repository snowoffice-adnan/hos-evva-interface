# ---------- 1) Build stage ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Install deps (incl. dev) for building
COPY package*.json ./
RUN npm ci

# Copy source
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY src ./src

# Build NestJS app
RUN npm run build

# ---------- 2) Runtime stage ----------
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled app from builder
COPY --from=builder /app/dist ./dist

# Drop privileges to non-root (already exists in node image)
USER node

# Expose app port (matches PORT in .env)
EXPOSE 3000

# Start NestJS app
CMD ["node", "dist/main.js"]
