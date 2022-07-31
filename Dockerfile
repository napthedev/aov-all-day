FROM node:16-slim

WORKDIR /app

RUN apt-get update
RUN apt-get install -y ffmpeg

COPY package*.json ./

RUN npm ci

COPY . .

CMD [ "npm", "start" ]
