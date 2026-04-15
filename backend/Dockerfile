FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN npm install -g @nestjs/cli

COPY . .
RUN npx prisma generate
RUN npx nest build

EXPOSE 3000

CMD ["node", "dist/main.js"]