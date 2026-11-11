FROM node:22-alpine AS build

WORKDIR /app

# Copy package manifests from forcastify-frontend directory
COPY forcastify-frontend/package*.json ./
RUN npm install

# Copy application source files
COPY forcastify-frontend/ ./

# Vite inlines VITE_* variables into the static bundle at build time
ARG VITE_API_BASE_URL=http://localhost:8000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

FROM nginx:alpine

# Enable Single Page Application (React Router) routing directly without an external config file
RUN sed -i 's|index  index.html index.htm;|index  index.html index.htm;\n        try_files $uri $uri/ /index.html;|' /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
