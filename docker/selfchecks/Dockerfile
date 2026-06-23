FROM node:20-alpine AS app

WORKDIR /app

RUN corepack enable

COPY . .

RUN yarn install --immutable
RUN yarn build

ENV NODE_ENV=production

EXPOSE 3000

FROM app AS web
CMD ["yarn", "workspace", "@selfchecks/web", "start"]

FROM app AS worker
CMD ["yarn", "workspace", "@selfchecks/worker", "start"]
