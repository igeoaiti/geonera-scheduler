# Stage 1: Build & Compile the TS codebase into a standalone binary
FROM oven/bun:1.1.20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json tsconfig.json ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY src ./src
COPY drizzle ./drizzle

# Compile to a standalone binary targeting Linux
RUN bun build --compile --target=bun-linux-arm64 src/index.ts --outfile scheduler-bin

# Stage 2: Final runner image (using standard lightweight alpine)
FROM debian:12-slim AS runner

WORKDIR /app

# Copy compiled binary from builder
COPY --from=builder /app/scheduler-bin ./scheduler-bin
COPY --from=builder /app/drizzle ./drizzle

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose API port
EXPOSE 3000

# Run the compiled binary directly
CMD ["./scheduler-bin"]
