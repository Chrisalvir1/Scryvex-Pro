# Etapa 2 — 3.0.0-beta.1: settings, comandos y eventos

## Propósito

Permitir cambios reales de configuración y operaciones del dispositivo sin
romper la frontera con Scrypted.

## Alcance planeado

- `SettingsAdapter` para leer/escribir settings realmente admitidas.
- `CommandAdapter` para comandos respaldados por interfaces reales.
- `UniversalEventBus` y WebSocket para invalidar snapshots y actualizar UI.
- `AuditLog` separado de logs técnicos y Event Journal.
- Confirmación de lectura posterior a cada escritura; no se declara éxito por
  aceptar una petición HTTP.

## Criterios de salida

- Cada botón corresponde a una interfaz/operación real de Scrypted.
- Cambios de settings preservan secretos y tienen control de acceso.
- Eventos del plugin actualizan el modelo sin polling excesivo.
- Cada acción tiene correlationId, autor, resultado y error sanitizado.
- Pruebas de permisos, timeout, rollback lógico, dispositivo desconectado y
  evento duplicado.
- Prueba física con al menos ONVIF, RTSP y un plugin cloud.

## Bloqueadores

No iniciar hasta que alpha.1 supere el smoke test ARM64.

## Handoff

Registrar contrato de comandos, migraciones, endpoints, SHA, evidencia de
hardware y operaciones no soportadas.
