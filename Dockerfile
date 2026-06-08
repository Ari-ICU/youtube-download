# ─── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:22-slim AS deps

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ─── Stage 2: builder ─────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Skip ffmpeg/yt-dlp check — binaries are only needed at runtime, not build time
ENV SKIP_DEP_CHECK=1

RUN npm run build

# ─── Stage 3: runner ──────────────────────────────────────────────────────────
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Install ffmpeg + yt-dlp at runtime where they're actually needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    curl \
    ca-certificates \
    && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
       -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Smoke-test both binaries so the image fails fast if something is wrong
RUN ffmpeg -version 2>&1 | head -1 \
    && yt-dlp --version

# Non-root user for security
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --create-home --uid 1001 --gid nodejs nextjs

# Copy standalone build output
COPY --from=builder /app/public                          ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

USER nextjs

EXPOSE 3000

# Run with a single worker — the in-process SSE token registry (global.__downloadTokens)
# must live in the same process as the /api/download/file route that consumes tokens.
CMD ["node", "--max-old-space-size=512", "server.js"]
