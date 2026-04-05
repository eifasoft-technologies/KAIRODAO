FROM nginx:alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom configs into the image
COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/ /etc/nginx/conf.d/

# Install openssl for self-signed cert generation
RUN apk add --no-cache openssl

# Generate a temporary self-signed cert at build time so nginx can start with SSL
# Certbot will replace these with real certs after startup
RUN mkdir -p /etc/letsencrypt/live/kairodao.com && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout /etc/letsencrypt/live/kairodao.com/privkey.pem \
      -out /etc/letsencrypt/live/kairodao.com/fullchain.pem \
      -subj '/CN=kairodao.com'

EXPOSE 80 443
