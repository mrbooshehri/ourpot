FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache postgresql-client

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production || bun install --production

COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "run", "src/server.ts"]
