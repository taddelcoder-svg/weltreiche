FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=10000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js raeume.js zugang.js olymp.js index.html spiel.js logik.js bauten.js online.js datenschutz.html ./
COPY vendor ./vendor
EXPOSE 10000
CMD ["node", "server.js"]
