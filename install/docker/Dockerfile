ARG BASE="noble-full"
FROM ghcr.io/koush/scrypted-common:${BASE}

WORKDIR /

# Scryvex Pro: usa core local en lugar de descargarlo desde internet
# Version fijada: 0.3.147 (descargada con: npm pack @scrypted/core)
COPY scrypted-core-0.3.147.tgz /tmp/scrypted-core.tgz
ARG SCRYPTED_INSTALL_VERSION="0.3.147"
RUN npx -y scrypted@${SCRYPTED_INSTALL_VERSION} install-server --skip-core || true
RUN npm install -g /tmp/scrypted-core.tgz && rm /tmp/scrypted-core.tgz

WORKDIR /server

# Evita que Node prefiera IPv6 en redes con IPv6 roto.
# https://github.com/nodejs/node/issues/41145#issuecomment-992948130
ENV NODE_OPTIONS="--dns-result-order=ipv4first"

# Si cambia la imagen base, actualizar este valor para forzar reinstalacion de pip/npm.
ENV SCRYPTED_BASE_VERSION="20250101"

CMD ["/bin/sh", "-c", "ulimit -c 0; exec npm --prefix /server exec scrypted-serve"]
