# Build context is the repository root: docker build -f web/Dockerfile .
FROM node:24.10.0-bookworm-slim@sha256:b8d2197aff9129d16c801a3e3e1b2a873c4946480f5a310f38056df2268c38d9 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY migrations ./migrations
COPY web/package.json web/package-lock.json ./web/
RUN npm ci --prefix web
COPY web ./web
RUN npm run build --prefix web

FROM node:24.10.0-bookworm-slim@sha256:b8d2197aff9129d16c801a3e3e1b2a873c4946480f5a310f38056df2268c38d9
WORKDIR /app/web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
ENV HOME=/tmp XDG_CACHE_HOME=/tmp/cache SWC_NATIVE_BINDING_CACHE=/tmp/swc
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
