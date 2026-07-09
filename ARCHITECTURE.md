# 🏛️ Scryvex Pro: Arquitectura del Sistema (12 Fases)

Este documento detalla exhaustivamente las **12 Fases Arquitectónicas** implementadas para transicionar el antiguo código base de Scrypted hacia el moderno, privado y auto-alojado **Scryvex Pro**, un NVR Local-First ejecutado en Raspberry Pi 5 con Home Assistant OS.

## 🛠️ Fase 1: Limpieza, Pnpm y Alias
- Se purgó el repositorio antiguo dejándolo en blanco.
- Se clonó la base e inmediatamente se migró el gestor de paquetes de `npm` a `pnpm` (usando `pnpm-workspace.yaml`).
- En `server/src/scrypted-plugin-main.ts` inyectamos lógica en `Module.prototype.require` para interceptar llamadas al SDK antiguo (`@scrypted/sdk`) y redirigirlas dinámicamente al nuevo `@scryvex/sdk` para garantizar compatibilidad sin modificar miles de líneas heredadas.

## 🗄️ Fase 2: PostgreSQL Storage
- Eliminación del ineficiente almacén en `leveldb` y `bson`.
- Implementación de `server/src/level.ts` orquestando las tablas transaccionales en PostgreSQL (`scryvex_core.keyvalue`).

## 🧠 Fase 3: YOLOv10 Zero-Latency (AI)
- Eliminación de la pesada librería `opencv4nodejs`.
- Inserción de `onnxruntime-node` (`server/src/ai/yolov10-inference.ts`).
- Se estableció un flujo crudo y ultrarrápido: `FFmpeg (image2pipe) -> RGB24 -> Memoria RAM -> ONNX YOLOv10 Tensor -> Resultado`, logrando latencia cero y liberando el CPU/GPU para procesadores aarch64.

## 🍏 Fase 4: Ecosistema Apple (HKSV & WebRTC)
- Modificación profunda del protocolo HomeKit en `server/src/hksv/manager.ts`.
- Inyección de UUIDs correctos para `CameraRTPStreamManagement`, garantizando el cifrado end-to-end con HomeKit Secure Video de iOS 18/tvOS 18.

## 🌐 Fase 5: Matter 1.6 Protocol (Red Matter)
- Integración de `@project-chip/matter-node.js` (`server/src/matter/bridge.ts`).
- Generación de `CommissioningServer` (mDNS) para aprovisionamiento seguro y despliegue unificado (Thread/Wi-Fi) de cada cámara independientemente.

## 🏠 Fase 6 & 7: Liquid Glass UI y Preview On-Demand
- Despliegue de un nuevo Frontend (`frontend/`) en React + Vite + Tailwind CSS.
- UX basada en diseño "Liquid Glass" (fondos negros, bordes desenfocados `backdrop-blur`).
- **On-Demand:** El stream (visor) solo arranca el pipeline de video cuando el usuario presiona "Play", liberando RAM de la RPi5. 
- Aislamiento de logs visibles individualmente en la UI por cámara.

## 🛡️ Fase 8 & 11: Keystore Zero-Cloud y Multi-Instancia
- Erradicación absoluta de inicios de sesión centralizados (GitHub, Scrypted Cloud).
- **LocalSecretManager:** Todas las contraseñas y tokens Cloud (Ring, Tuya, RTSP) son encriptados con AES-256 en la Raspberry Pi.
- **Multi-Matter:** Un plugin Cloud no maneja un bloque monolítico; clona e instancia cada cámara extraída como una entidad independiente y autónoma en Postgres, dándole su propio puente Matter (port dinámico) y HomeKit Accessory.
- Si el token del plugin caduca, suspende a sus cámaras hijas en cascada y muestra una alerta 2FA en el UI de React.

## 🍏 Fase 9: Servicios HAP Compuestos
- Creación de `hap-accessory.ts` utilizando `hap-nodejs`.
- Agrupación semántica (Composite Accessory) de la Cámara con Sensores de Movimiento (activados por YOLO en RAM), Sirenas, Batería, e interruptores de iOS 27 ("Night Vision Light").

## ⚡ Fase 10: Descubrimiento Dinámico (Smart Onboarding)
- **camera-probe.ts:** Durante la inicialización (ONVIF), detecta si la cámara ya posee detección de hardware o IA integrada.
- **Rama A:** Si tiene IA, desactiva YOLOv10 (`use_yolo_ai: false`), reduciendo el uso de CPU a casi 0%, consumiendo directamente eventos físicos.
- **Rama B:** Si no, el NVR levanta el fallback de YOLOv10.

## 🔧 Fase 12: Auto-Healing Red y Google SDM
- **Auto-Healer ARP:** Si el stream cae porque el router asignó una nueva IP por DHCP, un módulo nativo del SO escanea la tabla ARP de Linux para localizar su Dirección MAC, extraer la nueva IP y re-enlazar FFmpeg instantáneamente.
- **Nest SDM:** Integración nativa WebRTC (SDP) y Pub/Sub de Google Cloud evadiendo webhooks. Scryvex Pro sirve de Redirect URI local para autorización OAuth sin intermediarios.

## 🐳 Docker para HAOS
- Raíz lista con `config.yaml` (`host_network: true` para Matter/HKSV).
- `Dockerfile` multi-stage ligero usando Node 24 (Debian slim).
- Entrypoint `run.sh` blindado y autogestionado: hace `initdb`, prende Postgres, asume roles y levanta el engine del servidor con variables inyectadas.
