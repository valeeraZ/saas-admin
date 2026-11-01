FROM node:24.10.0-bookworm-slim@sha256:b8d2197aff9129d16c801a3e3e1b2a873c4946480f5a310f38056df2268c38d9
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY migrations ./migrations
COPY scripts ./scripts
USER node
ENV HOST=0.0.0.0 PORT=59100
EXPOSE 59100
CMD ["node", "src/server.ts"]
