# Scryvex Pro 3.0.0-alpha.9 Release Notes

## Mejoras Principales

### 1. Nuevo Motor de Video WebRTC y RTP Pipeline
Se ha reescrito la capa de transmisión de video, reemplazando la dependencia de componentes de Scrypted por un motor RTP/WebRTC directo nativo basado en la librería `werift`:
- **Cero Conversión Innecesaria**: Ya no hay transcodificación opaca entre la cámara y el cliente. El flujo H.264 original de la cámara llega inalterado al navegador, logrando la latencia más baja posible (sub-segundo).
- **Control Activo de Codecs**: `CodecDecisionEngine` garantiza que sólo los flujos H.264 se envíen vía WebRTC a navegadores genéricos, y restringe H.265 para dispositivos Apple/HomeKit u opciones manuales.
- **Limpieza Estricta de Recursos**: Se manejan activamente los puertos UDP, cerrando sockets y matando procesos FFmpeg ante timeouts de ICE, fallos de negociación o recargas de interfaz, evitando fugas de memoria y puertos colgados.

### 2. Recuperación de IP e Identidad Persistente
Scryvex ahora tolera que las cámaras cambien de IP debido al DHCP:
- Se registra y comprueba la dirección MAC real (vía tabla ARP o Network Neighbours del contenedor).
- Las cámaras descubiertas por ONVIF ligan su UUID subyacente a su perfil.
- Si una cámara no responde en su IP previa (ej. `ECONNREFUSED` o timeout), `CameraIdentityTracker` rastrea automáticamente la red para detectar si la cámara fue reasignada a una nueva IP, actualizando la base de datos de manera invisible sin requerir intervención del usuario.

### 3. Diagnósticos Granulares para ONVIF y RTSP
- **Prueba Explicita de Puertos**: `CameraProbe` ahora intenta y registra el resultado exacto para cada puerto candidato (ej. `8001: ECONNREFUSED`, `80: timeout`), mostrando esta información clara en caso de fallo, en lugar de un error general genérico.
- **MJPEG como Fallback Diagnóstico**: La visualización MJPEG fue refactorizada para utilizarse exclusivamente como fallback diagnóstico y con estricta instrumentación de logs, previniendo falsos positivos de conectividad.

## Cambios Técnicos y Backend
- Nuevo paquete de dependencias: `werift` reemplaza a implementaciones ad-hoc.
- `WebRTCSessionManager` implementa soporte nativo de SDP y manejo de ICE candidates.
- Soporte para HLS mejorado como ruta secundaria a WebRTC.

## Pasos para Actualizar (Home Assistant)
1. Instale la actualización desde la pestaña Add-ons en Supervisor.
2. Limpie la caché de su navegador antes de abrir el panel de Scryvex Pro para forzar la carga del nuevo reproductor WebRTC.
3. Se recomienda hacer "Probar Conexión" en cada cámara existente para asegurar que su dirección MAC sea capturada por el nuevo Identity Tracker.
