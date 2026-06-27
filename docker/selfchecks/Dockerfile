FROM mcr.microsoft.com/playwright:v1.49.0-noble AS app

WORKDIR /app

RUN corepack enable
RUN npx -y playwright@1.48.1 install chromium

COPY . .

RUN yarn install --immutable
RUN yarn build

ENV NODE_ENV=production

EXPOSE 3000

FROM app AS web
CMD ["yarn", "workspace", "@selfchecks/web", "start"]

FROM app AS worker
CMD ["yarn", "workspace", "@selfchecks/worker", "start"]
