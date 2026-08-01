FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3002
CMD ["sh", "-c", "npx next start -p ${PORT:-3002}"]
