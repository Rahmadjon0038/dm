FROM node:20-alpine AS builder
WORKDIR /app

# Prisma engine uchun OpenSSL kerak (Alpine'da standart yoq)
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Production image ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Prisma engine uchun OpenSSL kerak (Alpine'da standart yoq)
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE 4000

# Schema DBga qollanadi (MVP: db push), keyin server ishga tushadi.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
