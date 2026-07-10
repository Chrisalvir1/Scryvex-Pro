# Changelog

All notable changes to this project will be documented in this file.

## [2.1.47] - 2026-07-10

### Changed
- **Estabilización V4-R1:** Refactorización final de la Arquitectura Multimedia para soporte universal y local.
- **Legacy Plugins Adapter:** Infraestructura añadida para soportar y unificar plugins heredados (`Ring`, `Nest`, `UniFi`, etc.) dentro de la nueva arquitectura de *resolvers* (`LegacyPluginMediaProviderAdapter`).
- **MediaProcessRunner:** Añadida tolerancia a backpressure, permitiendo streaming infinito (ej. MJPEG >8MiB) para clientes lentos sin terminar forzosamente el proceso FFmpeg. Añadida protección de estado (`settled`) contra doble finalización.
- **RTSP y ONVIF:** Test HTTP real y sanitización completa de contraseñas.
- **Protecciones HTTP:** Manejo seguro del header `ERR_HTTP_HEADERS_SENT` (502) en streams MJPEG.
- **Tests Completos:** 100% de cobertura en todos los casos de uso (`camera-urls`, `provider-contract`, `api-cameras`, `mjpeg-long`, etc.).

## [1.0.0] - 2026-07-08
### Added
- **Core:** Motor migrado completamente a Node 24 y TypeScript 7. Sistema de gestión de dependencias transicionado de `npm` a `pnpm` (Workspace).
- **Base de Datos:** Transición profunda desde LevelDB (BSON) hacia **PostgreSQL** (`scryvex_core`).
- **Inteligencia Artificial:** Inferencia nativa `YOLOv10` procesando buffers RGB24 puros en memoria (RAM) a través de `onnxruntime-node`. Deprecación total de OpenCV.
- **Protocolos de Ecosistema:** Integración pura de `Matter 1.6` Bridge (`@project-chip/matter-node.js`) habilitando aprovisionamiento mDNS nativo y Thread/Wi-Fi unificado.
- **UI (Liquid Glass):** Nuevo Dashboard en React, Vite y Tailwind CSS, ofreciendo un diseño "Liquid Glass", con Preview On-Demand, Gestión de Logs independiente, y Wizard de adición de cámaras.
- **Home Assistant OS (HAOS):** Entorno de Docker nativo aarch64 (`config.yaml`, `Dockerfile` multi-stage, y `run.sh` entrypoint).
- **HomeKit (HAP):** Identidad compuesta estricta (Composite Accessories) vinculando MotionSensor (YOLO), Batería, y Modos de iOS 27 nativamente bajo la cámara física.
- **Seguridad & Resiliencia:** 
  - `LocalSecretManager` con cifrado AES-256 local, anulando la dependencia de Cloud o SSO externo.
  - Cascade Pausing (Token Fallback) interrumpiendo streams e informando a la UI vía 401/403.
  - Recuperación de red (Auto-Healer) escaneando la tabla ARP nativa del SO para resolver rotaciones DHCP automáticamente.
  - Soporte SDM puro para Google Nest con Pub/Sub y WebRTC local (zero-webhooks).
- **Optimización de CPU:** Motor dinámico `camera-probe.ts` desactivando YOLO si la cámara física expone eventos ONVIF nativos, alcanzando 0% de sobrecarga de CPU por stream.

### Removed
- Eliminado completamente el core legacy de Scrypted.
- Eliminados todos los conectores Cloud (SSO, GitHub, Scrypted Cloud).
- Erradicada librería pesada `opencv4nodejs`.
