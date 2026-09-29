# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Copy source code and build TypeScript
COPY tsconfig.json ./
COPY src ./src
COPY public ./public

RUN npx prisma generate
RUN npm run build

# Stage 2: Production
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --only=production
RUN npx prisma generate

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "dist/server.js"]
