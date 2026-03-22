FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
    curl ca-certificates python3 bzip2 \
    libgtk-3-0 libdbus-glib-1-2 libxt6 libasound2t64 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 libpango-1.0-0 libcairo2 \
    libatk1.0-0 libatk-bridge2.0-0 libxcursor1 libxi6 \
    && rm -rf /var/lib/apt/lists/*

# Install Firefox ESR (respects xpinstall.signatures.required=false)
RUN curl -fsSL -o /tmp/firefox.tar.bz2 \
    "https://ftp.mozilla.org/pub/firefox/releases/128.9.0esr/linux-x86_64/en-US/firefox-128.9.0esr.tar.bz2" && \
    tar xjf /tmp/firefox.tar.bz2 -C /opt && \
    ln -s /opt/firefox/firefox /usr/local/bin/firefox && \
    rm /tmp/firefox.tar.bz2

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

WORKDIR /app

# Copy Claudezilla (host needs to run as native messaging host)
COPY claudezilla/ /app/claudezilla/

# Register native messaging host
RUN mkdir -p /root/.mozilla/native-messaging-hosts && \
    printf '{"name":"claudezilla","description":"Claudezilla native host","path":"/app/claudezilla/host/index.js","type":"stdio","allowed_extensions":["claudezilla@boot.industries"]}' \
    > /root/.mozilla/native-messaging-hosts/claudezilla.json

RUN chmod +x /app/claudezilla/host/index.js

# Fix shebang for Docker (not fnm path)
RUN sed -i '1s|.*|#!/usr/bin/env node|' /app/claudezilla/host/index.js

# Copy extension source
COPY manifest.json /app/extension/manifest.json
COPY background/ /app/extension/background/
COPY content/ /app/extension/content/
COPY shared/ /app/extension/shared/
COPY popup/ /app/extension/popup/
COPY options/ /app/extension/options/
COPY icons/ /app/extension/icons/
COPY data/ /app/extension/data/
COPY fingerprint-check.html /app/extension/

# Copy test files
COPY tests/e2e/ /app/tests/e2e/
RUN chmod +x /app/tests/e2e/entrypoint.sh

# Build Firefox profile with both extensions
RUN node /app/tests/e2e/setup-profile.mjs

CMD ["bash", "/app/tests/e2e/entrypoint.sh"]
