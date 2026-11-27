# Single stage on purpose: the running container also needs the Prisma CLI
# (`migrate deploy`) and tsx with the sources (`db:seed`), which are the dev
# dependencies a slimmer image would drop.
FROM node:22-bookworm-slim

# Prisma's query engine links against the system OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# The schema comes first because `postinstall` runs `prisma generate`.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

USER node
EXPOSE 3333

# `exec` hands SIGTERM to Node, so `docker stop` reaches the shutdown handler.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/server.js"]
