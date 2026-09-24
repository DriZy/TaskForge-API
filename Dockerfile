# ---- base ----
FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./

# ---- dependencies ----
FROM base AS deps
RUN npm ci

# ---- build ----
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
RUN npm run build

# ---- production runtime ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
# Generated Prisma client (location depends on generator config)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

USER node
EXPOSE 3000

CMD ["node", "dist/server.js"]