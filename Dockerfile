FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY shared ./shared
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils ca-certificates && rm -rf /var/lib/apt/lists/* \
  && npm install -g @earendil-works/pi-coding-agent@0.87.1 \
  && mkdir -p /data/uploads
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY shared ./shared
ENV NODE_ENV=production DATA_DIR=/data PI_CODING_AGENT_DIR=/data/pi PORT=3000
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "server/index.js"]
