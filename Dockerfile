# Образ для будь-якого контейнерного хостингу (Render, Fly.io, Railway…).
FROM node:22-alpine

WORKDIR /app

# Спершу лише маніфести — шар із залежностями кешується між збірками.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Хостинги передають порт через змінну оточення; сервер її вже читає.
ENV PORT=8090
EXPOSE 8090

CMD ["node", "server/index.js"]
