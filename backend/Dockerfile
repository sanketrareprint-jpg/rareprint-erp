FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN npm install -g @nestjs/cli

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/main.js"]