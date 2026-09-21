FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 2000 \
  && npm config set fetch-retry-maxtimeout 30000 \
  && npm ci

COPY . ./
ARG VITE_API_BASE_URL=/
ARG VITE_APP_VERSION=unknown
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_APP_VERSION=$VITE_APP_VERSION
RUN npm run build

FROM nginx:1.27-alpine

ARG IMAGE_VERSION
ARG IMAGE_REVISION
ARG IMAGE_CREATED
ARG IMAGE_SOURCE

LABEL org.opencontainers.image.version=$IMAGE_VERSION \
      org.opencontainers.image.revision=$IMAGE_REVISION \
      org.opencontainers.image.created=$IMAGE_CREATED \
      org.opencontainers.image.source=$IMAGE_SOURCE

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
