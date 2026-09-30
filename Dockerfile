# syntax=docker/dockerfile:1
# Frontend (React PWA) — 정적 파일만 서빙하므로 Backend 없이도 뜬다.
# API 주소는 실행 시 API_BASE_URL 환경변수로 준다 (infra/40-runtime-config.sh).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 infra/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/healthz || exit 1
