# RepairPilot — production image (multi-stage, Next.js standalone output)
#
#   docker build -t repairpilot .
#   docker run -p 3020:3020 --env-file .env repairpilot
#
# Or use docker-compose.yml, which also runs Postgres and migrations.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
# postinstall runs `prisma generate`
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A DATABASE_URL is not needed at build time (all pages are dynamic),
# but prisma generate already ran in deps.
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3020
ENV HOSTNAME=0.0.0.0

# Non-root user
RUN addgroup -S repairpilot && adduser -S repairpilot -G repairpilot

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Prisma CLI + schema for running migrations from this image
# (docker-compose runs: npx prisma migrate deploy)
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.bin ./node_modules/.bin

# Uploaded attachments live on disk — mount a volume over this path.
RUN mkdir -p public/uploads && chown -R repairpilot:repairpilot /app

USER repairpilot
EXPOSE 3020

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3020/api/health || exit 1

CMD ["node", "server.js"]
