<p align="center">
  <h1 align="center">Scryvex Pro</h1>
  <p align="center">
    <strong>Zero-Latency Local-First NVR con Inteligencia Artificial Nativa y Ecosistema Matter</strong>
  </p>
</p>

---

## ⚡ Descripción
Scryvex Pro es una reinvención arquitectónica absoluta de las bases de los NVR tradicionales. Diseñado específicamente para ejecutarse como un **Add-on Nativo y Optimizado en Home Assistant OS (HAOS)** sobre arquitecturas **aarch64 (Raspberry Pi 5)**.

Libre de telemetría, libre de nubes intermediarias y completamente independiente. Scryvex Pro centraliza, analiza y re-distribuye tus cámaras físicas hacia ecosistemas cerrados como **Apple HomeKit Secure Video (HKSV)** y **Matter 1.6**.

## 🚀 Características Principales (12 Fases Arquitectónicas)

*   **100% Local-First:** Base de datos **PostgreSQL** aislada reemplazando los sistemas leveldb ineficientes. Todo vive en tu hardware (`/data/scryvex_postgres`).
*   **Inferencia YOLOv10 en RAM:** Detección de objetos acelerada mediante `onnxruntime-node`. Sin dependencias pesadas como OpenCV, procesando video crudo directo desde memoria.
*   **Zero-Cloud Keystore:** `LocalSecretManager` con cifrado **AES-256** para resguardar tus credenciales, cuentas y tokens localmente sin requerir logins en GitHub u otros SSO.
*   **Liquid Glass UI (Frontend):** Panel de control interactivo construido en React y Tailwind CSS, ofreciendo monitoreo "On-Demand" (para ahorrar recursos), vista independiente de Logs, visualización de red en tiempo real, y UI Wizards dinámicos.
*   **Descubrimiento y Auto-Healing ARP:**
    *   **Smart CPU:** Si tu cámara tiene IA, el NVR apaga su propio procesamiento y delega, ahorrando un 100% de CPU.
    *   **Auto-Healing:** Recuperación automática de streams caídos mediante la lectura profunda de la tabla ARP por MAC address, evadiendo fallos por rotaciones DHCP.
*   **HAP Compuesto (HomeKit):** Accesorios mapeados estrictamente con identificadores de Apple, agrupando el video, la batería, la sirena y los sensores de movimiento (YOLO) bajo una misma cámara para la app Casa. Incluyendo soporte SDM directo y WebRTC para Google Nest.
*   **Despliegue Nativo HAOS:** Preparado out-of-the-box con `config.yaml`, `Dockerfile` multi-stage y un `run.sh` blindado para ejecutarse dentro del clúster Supervisor de Home Assistant.

## 🛠 Instalación Rápida (Home Assistant)

1. Ve a la tienda de **Complementos (Add-ons)** en tu Home Assistant.
2. Agrega este repositorio como repositorio local o pégalo en la URL de repositorios.
3. Instala **Scryvex Pro** y asegúrate de configurar tu almacenamiento en PostgreSQL.
4. Accede a la UI Web en el puerto `9090` e inicia el Asistente de Configuración.

## 🔒 Privacidad y Ecosistemas
Tu privacidad es la prioridad absoluta. Las cuentas cloud (Ring, Tuya, Nest) operan bajo el mecanismo de **Desacoplamiento** y **Smart Restore**. Ningún token sale de tu Raspberry Pi 5. Todo el ecosistema de Matter y HomeKit funciona localmente utilizando mDNS (`host_network: true`).
