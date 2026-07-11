# Scryvex Pro 3.0.0 — plan de liberación

Este directorio es el registro de continuidad de la liberación 3.0.0. Cada
etapa tiene su propio documento para que otra persona o agente pueda retomar
el trabajo sin reconstruir decisiones arquitectónicas.

## Regla de versiones

| Etapa | Versión | Objetivo de salida |
| --- | --- | --- |
| 1 | `3.0.0-alpha.1` | Lectura universal segura de Scrypted y una imagen construible. |
| 2 | `3.0.0-beta.1` | Settings, comandos y eventos reales, con auditoría. |
| 3 | `3.0.0-beta.2` | Media real: RTSP/ONVIF, códecs, preview y compatibilidad Apple. |
| 4 | `3.0.0-rc.1` | Publicación Apple/Matter, respaldo, recuperación y pruebas de regresión. |
| 5 | `3.0.0` | Validación en Home Assistant ARM64, documentación y tag final. |

## Reglas que aplican a todas las etapas

- Scrypted y sus plugins son la fuente de verdad de dispositivos y capacidades.
- Scryvex no inventa entidades ni marca una capacidad como verificada sin una
  operación real que lo pruebe.
- No se exponen credenciales, tokens, claves HomeKit/Matter ni URLs RTSP con
  `userinfo` en API, UI ni logs.
- Un build, TypeScript o CI verde son requisitos necesarios, no evidencia de
  funcionamiento en Home Assistant.
- Cada cierre debe actualizar el documento de la etapa con SHA, comandos,
  resultados, riesgos y el siguiente paso exacto.
- No crear el tag `3.0.0` hasta superar la etapa 5.

## Estado al iniciar este plan

- Versión declarada: `3.0.0-alpha.1`.
- `main` tiene CI verde para el núcleo filtrado y el build Docker; el job de
  integridad del monorepo puede permanecer informativo mientras el plugin
  Hikvision tenga una dependencia Git externa no reproducible.
- Falta la validación física del add-on en Home Assistant ARM64. Por ello no
  existe todavía una versión candidata a final.

## Documentos de etapa

1. [Etapa 1 — alpha.1](01-alpha.1-universal-read-core.md)
2. [Etapa 2 — beta.1](02-beta.1-settings-commands-events.md)
3. [Etapa 3 — beta.2](03-beta.2-media-apple.md)
4. [Etapa 4 — rc.1](04-rc.1-matter-resilience.md)
5. [Etapa 5 — final](05-final-release.md)
