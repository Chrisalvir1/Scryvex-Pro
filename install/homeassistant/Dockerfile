# Scryvex Pro Home Assistant add-on runtime.
#
# This deliberately follows Scrypted's official Docker installation path. The
# project does not vendor a camera provider or a modified official plugin: the
# Runtime installs official plugins into SCRYPTED_VOLUME at first start.
ARG BASE="noble-full"
FROM ghcr.io/koush/scrypted-common:${BASE}

WORKDIR /

# Follow the supported official installation channel. The historical 0.144.2
# source baseline has no matching @scrypted/server package on npm.
ARG SCRYPTED_INSTALL_VERSION="latest"
RUN npx -y scrypted@latest install-server ${SCRYPTED_INSTALL_VERSION}

WORKDIR /server
ENV NODE_OPTIONS="--dns-result-order=ipv4first"
ENV SCRYPTED_BASE_VERSION="20250101"

CMD ["/bin/sh", "-c", "ulimit -c 0; exec npm --prefix /server exec scrypted-serve"]
