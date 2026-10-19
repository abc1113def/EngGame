# Необязательный вариант: контейнер с nginx (итоговый образ ~25 МБ, ~10 МБ ОЗУ).
# docker build -t a320 . && docker run -d -p 80:80 --restart unless-stopped a320
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
RUN sed -i 's#root /var/www/a320;#root /usr/share/nginx/html;#' /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
