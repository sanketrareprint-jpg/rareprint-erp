FROM node:18

# Cache bust: 2026-06-19c
WORKDIR /app

COPY package*.json ./
RUN npm install --include=dev

COPY . .
RUN npx prisma generate && npx nest build && find dist/ -name "*.js" | head -20

ENV PORT=8080
EXPOSE 8080

CMD ["/bin/sh", "scripts/startup.sh"]
