FROM mcr.microsoft.com/playwright:v1.58.2-noble AS app

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

RUN corepack enable

COPY . .

RUN yarn install --immutable
RUN yarn build
RUN chmod 0755 /app/packages/cli/dist/index.js \
  && ln -s /app/packages/cli/dist/index.js /usr/local/bin/selfchecks \
  && test -x /usr/local/bin/selfchecks

ENV NODE_ENV=production

EXPOSE 3000

FROM app AS web
CMD ["yarn", "workspace", "@selfchecks/web", "start"]

FROM app AS worker
CMD ["yarn", "workspace", "@selfchecks/worker", "start"]
