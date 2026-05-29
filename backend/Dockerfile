FROM node:18

# Cache bust: 2026-04-16
WORKDIR /app

COPY package*.json ./
RUN npm install --include=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npx nest build && find dist/ -name "*.js" | head -20

EXPOSE 8080

CMD node scripts/railway-migrate.js && PORT=${PORT:-8080} node dist/src/main.js
