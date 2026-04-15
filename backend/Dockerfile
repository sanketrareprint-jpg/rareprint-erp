FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN npm install -g @nestjs/cli ts-node typescript

COPY . .
RUN npx prisma generate
RUN npm run build
RUN ls -la dist/ || echo "dist not found"

EXPOSE 3000

CMD ["node", "dist/main.js"]