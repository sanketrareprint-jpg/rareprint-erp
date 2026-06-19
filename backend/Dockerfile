FROM node:18

# Cache bust: 2026-06-12
WORKDIR /app

COPY package*.json ./
RUN npm install --include=dev

COPY . .
RUN npx prisma generate && npx nest build && find dist/ -name "*.js" | head -20

ENV PORT=8080
EXPOSE 8080

CMD npx prisma migrate resolve --applied 20260619000100_add_offer_code_and_product_rule 2>/dev/null; npx prisma migrate resolve --applied 20260619000200_add_sample_order_fields 2>/dev/null; npx prisma migrate deploy && node dist/src/main.js
