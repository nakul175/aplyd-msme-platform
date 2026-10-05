# Builds and runs the application for a host that runs containers (DigitalOcean App Platform, a Droplet, anything with Docker).
# SYNTHETIC demonstration host only: the database lives in memory and is rebuilt at every start (scripts/serve.mjs).
# Not built or run in the session that wrote it: there was no container daemon there. See modules/hosting/STATUS.md.
FROM node:22.22.0-bookworm-slim

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

# Dependencies first, so a change to the code does not reinstall them. The lockfile is followed exactly.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Set after the install and the build: with NODE_ENV=production the install above would skip the packages the build and the Worker host need.
ENV NODE_ENV=production
RUN chown -R node:node /app
USER node

# The platform sets PORT; 8080 is App Platform's default.
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

# SESSION_SECRET, DEMO_USER and DEMO_PASSWORD (or DEMO_ACCESS=open) must be set when the container starts; the launcher refuses to start without them.
CMD ["node", "scripts/serve.mjs"]
