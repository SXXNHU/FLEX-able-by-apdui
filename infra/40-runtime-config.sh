#!/bin/sh
# 컨테이너 시작 시 API 주소를 주입한다. 이미지를 다시 빌드하지 않고 백엔드 주소만 바꿀 수 있다.
# API_BASE_URL이 비어 있으면 앱은 빌드 시 값 또는 "같은 호스트의 8080 포트"를 쓴다.
set -eu
printf '{"apiBaseUrl":"%s"}\n' "${API_BASE_URL:-}" > /usr/share/nginx/html/config.json
