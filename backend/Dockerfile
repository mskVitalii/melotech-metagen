FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts

# Dev stage — hot reload via mounted volume
FROM base AS dev
COPY . .
RUN npx prisma generate
CMD ["npm", "run", "start:dev"]

# Build stage
FROM base AS build
COPY . .
RUN npx prisma generate && npm run build

# Production stage
FROM node:22-alpine AS prod
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/generated ./src/generated
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
