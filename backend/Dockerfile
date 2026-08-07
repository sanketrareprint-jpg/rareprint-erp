FROM node:22

# Cache bust: 2026-08-04a — bumped from node:18 because Prisma 7.9.0 requires
# Node 20.19+/22.12+/24.0+ and no longer installs on Node 18.
WORKDIR /app

COPY package*.json ./
RUN npm install --include=dev

COPY . .
RUN npx prisma generate && npx nest build && find dist/ -name "*.js" | head -20

ENV PORT=3000
EXPOSE 3000

CMD npx prisma db execute --file ./scripts/repair.sql --schema ./prisma/schema.prisma; node dist/src/main.js
