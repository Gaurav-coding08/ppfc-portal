# Multi-stage build (feature 18 Part C): compile the SPA with Node, then
# serve the static files from nginx. nginx also proxies /api to the `api`
# compose service, so the browser talks to a single origin — the httpOnly
# session cookie and the relative `/api/v1` base URL work exactly as they do
# behind the Vite dev proxy.
FROM node:20-alpine AS build
WORKDIR /app
# .npmrc carries legacy-peer-deps (see feature 16 context).
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
