FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --include=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npx nest build

EXPOSE 3000

CMD ["node", "dist/main.js"]