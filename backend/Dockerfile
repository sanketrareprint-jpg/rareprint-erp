FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install --include=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npx nest build && find dist/ -name "*.js" | head -20

EXPOSE 3000

CMD npx prisma migrate deploy && node dist/src/main.js