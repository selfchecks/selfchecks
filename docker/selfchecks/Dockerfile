# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/playwright:v1.58.2-noble AS app

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

RUN corepack enable

COPY . .

RUN yarn install --immutable
RUN --mount=type=secret,id=APPNOTES_KEY \
  if [ -s /run/secrets/APPNOTES_KEY ]; then \
    export NEXT_PUBLIC_APPNOTES_PROJECT_KEY="$(cat /run/secrets/APPNOTES_KEY)"; \
  fi; \
  yarn build
RUN chmod 0755 /app/packages/cli/dist/index.js \
  && ln -s /app/packages/cli/dist/index.js /usr/local/bin/selfchecks \
  && test -x /usr/local/bin/selfchecks

ENV NODE_ENV=production

EXPOSE 3000

FROM app AS web
CMD ["yarn", "workspace", "@selfchecks/web", "start"]

FROM app AS worker
CMD ["yarn", "workspace", "@selfchecks/worker", "start"]

FROM node:20.19-bookworm-slim AS cli-build

WORKDIR /app

RUN corepack enable

COPY . .

RUN yarn install --immutable
RUN yarn workspace @selfchecks/core build \
  && yarn workspace @selfchecks/db build \
  && yarn workspace @selfchecks/selfchecks build \
  && yarn workspace @selfchecks/cli build \
  && yarn workspaces focus @selfchecks/cli --production

FROM node:20.19-bookworm-slim AS cli

ENV NODE_ENV=production

WORKDIR /app

COPY --from=cli-build /app /app

RUN chmod 0755 /app/packages/cli/dist/index.js \
  && ln -s /app/packages/cli/dist/index.js /usr/local/bin/selfchecks \
  && test -x /usr/local/bin/selfchecks

CMD ["selfchecks", "--help"]
