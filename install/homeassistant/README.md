# Scryvex Pro Home Assistant add-on image

This image is the Scryvex Pro Home Assistant distribution. It starts the
official Scrypted Runtime and preserves Scrypted's supported plugin flow:

- Official plugins are installed by Scrypted at runtime into
  `SCRYPTED_VOLUME` using `scrypted.installNpm`.
- The add-on's volume is `/data/scryvex_pro`; it does not share a database,
  installed plugins, or settings with another Scrypted add-on.
- No Legacy camera provider is included in this image.

The image tag must match `install/config.yaml`'s add-on version. It installs
the current supported official Scrypted server package from npm. GitHub Actions
publishes multi-architecture `linux/amd64` and `linux/arm64` images under
`ghcr.io/chrisalvir1/scryvex-pro-v2` when a `v*` Git tag is pushed.
