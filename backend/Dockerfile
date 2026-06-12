FROM node:18

# Cache bust: 2026-06-12
WORKDIR /app

COPY package*.json ./
RUN npm install --include=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npx nest build && find dist/ -name "*.js" | head -20

ENV PORT=8080
EXPOSE 8080

CMD node dist/src/main.js
