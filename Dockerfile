# ---------- Stage 1: dependencies ----------
FROM node:26-alpine AS deps
WORKDIR /app

RUN npm install -g corepack
RUN corepack cache clean

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- Stage 2: build ----------
FROM node:26-alpine AS build
WORKDIR /app

RUN npm install -g corepack
RUN corepack cache clean

RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build
RUN pnpm prune --prod

# ---------- Stage 3: runtime ----------
FROM node:26-alpine AS runtime
WORKDIR /app

RUN npm install -g corepack
RUN corepack cache clean

RUN corepack enable

ENV NODE_ENV=production

USER node

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json

CMD ["node", "dist/main.js"]