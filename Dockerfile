FROM node:6-alpine AS base

# set working directory
WORKDIR /flow-library

# install git
RUN apk add --no-cache git

# copy project file
COPY package.json ./
RUN npm install
COPY . .
CMD npm run dev
