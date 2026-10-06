# Builds and runs the application for a host that runs containers (DigitalOcean App Platform, a Droplet, anything with Docker).
# SYNTHETIC demonstration host only: the database is a SQLite file in the container's temporary directory, built again at every start, so a restart is a reset (scripts/serve.mjs).
# Built on DigitalOcean App Platform on 5 October 2026 (the sponsor's report). Its steps were also run without Docker in a clean copy on 6 October 2026. See modules/hosting/STATUS.md and VALIDATION.md.
FROM node:22.22.0-bookworm-slim

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

# Dependencies first, so a change to the code does not reinstall them. The lockfile is followed exactly.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# The git commit this image was made from, shown by /healthz so a live address can be matched to a commit. App Platform does not pass its commit
# to a Dockerfile build, so on App Platform the same name is set at run time instead (.do/app.yaml, ${_self.COMMIT_HASH}) and overrides this.
# For any other build: docker build --build-arg APLYD_COMMIT=$(git rev-parse HEAD) .  Declared after the build so a new commit does not redo the install and the build.
ARG APLYD_COMMIT=""
ENV APLYD_COMMIT=$APLYD_COMMIT

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
