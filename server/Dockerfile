FROM node:24-bookworm-slim AS base
RUN apt-get update \
  && apt-get install --yes --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npm run db:generate
RUN npm run build

FROM build AS migrations
USER node
CMD ["npm", "run", "db:migrate"]

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && mkdir -p /app/reports \
  && chown node:node /app/reports
COPY --from=build /app/node_modules/.prisma/client ./node_modules/.prisma/client
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
ENV DEMO_REPORT_DIR=/app/reports
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
