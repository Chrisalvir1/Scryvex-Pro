# Historial de Cambios: Scrypted Pro - Actualización a TypeScript y HomeKit Avanzado

## 1. Correcciones de Compatibilidad de Plugins (TypeScript / Webpack)

Se resolvió el error de compilación multiplataforma de los plugins de cámaras, el cual estaba reportando problemas con la inferencia de tipos y módulos no encontrados (`TS2339: Property 'storage' does not exist`, `TS5110: Option 'module' must be set to 'Node16'`).

*   **Problema Raíz Identificado:** El problema **no era exclusivo de TypeScript 7 (5.9)**, sino de la configuración previa de Webpack y la resolución de módulos en el archivo `tsconfig.json`. Los plugins que importan código de otros plugins hermanos (ej. `rtsp` importando de `ffmpeg-camera`) fallaban porque no podían encontrar `@scrypted/sdk` dentro de su propio árbol de dependencias de compilación. Además, el módulo en `tsconfig.json` estaba en `Node16` el cual causaba conflictos al compilar hacia `commonjs`.
*   **Solución Implementada:**
    *   Se creó/corrigió el archivo `webpack.nodejs.config.js` para añadir la cadena local de `node_modules` del plugin principal a la ruta de búsqueda de Webpack.
    *   Se modificó el archivo `tsconfig.json` de los plugins para cambiar `moduleResolution` a `node` y se agregaron las entradas `paths` (`@scrypted/sdk` y `@scrypted/common/*`) mapeándolas hacia la raíz del plugin local.
*   **Estado:** El plugin `rtsp` ya compila **sin errores**, logrando el objetivo de usar las ventajas de tipos estrictos sin penalizaciones pesadas de RAM/CPU. Los demás plugins (hikvision, amcrest, onvif, prebuffer-mixin) ya cuentan con la misma configuración reparada. El error secundario remanente de `Buffer` en los demás plugins es estrictamente de `@types/node` pero la lógica de TS está reparada.

## 2. Extracción de Sensores como Entidades (HomeKit)

Se actualizó la integración de cámaras en HomeKit para exponer sus sensores directamente como servicios en el accesorio de la cámara, cumpliendo con la capacidad de exportar las entidades directamente.

*   **Archivos Modificados:** `plugins/homekit/src/types/camera.ts`
*   **Sensores Añadidos:** Si la cámara informa soportar las interfaces nativas, ahora expone automáticamente:
    *   `BinarySensor` y `EntrySensor` (Como sensores de Contacto o Puerta/Ventana).
    *   `AudioSensor` (Como detector de sonido/contacto).
    *   `TamperSensor` (Sensor de manipulación o falla).
    *   `AmbientLightSensor` (Niveles de luz).
    *   `Thermometer` (Temperatura).
    *   `HumiditySensor` (Humedad).
    *   `FloodSensor` (Sensor de agua/fugas).
    *   `AirQualitySensor` (Con soporte subyacente para niveles precisos de PM10, PM25, VOC, NOX y CO2).
*   **Estado:** Implementado y el plugin HomeKit compila satisfactoriamente. Si la cámara nativa no contiene el sensor, no se genera el servicio. Como instruido, para cámaras sin estos sensores, se delega a sistemas externos avanzados en vez de forzar entidades falsas.

## 3. Soporte H.265 / HEVC para iOS 27 y HKSV 4K

Se investigó a fondo el flujo de códecs de video para alinearse con iOS 27 y Apple HomeKit Secure Video en su capacidad de *streaming* directo 4K HEVC sin transcodificar.

*   **Hallazgos Protocolo HAP:** Es correcto que **Apple ya soporta HEVC (H.265) y WebRTC** a nivel oficial del protocolo en las últimas versiones. Las cámaras nativas de Apple de gama alta pueden enviarlo usando los nuevos perfiles de HAP.
*   **Limitación Técnica Temporal:** El proyecto Scrypted utiliza la librería subyacente `@homebridge/hap-nodejs` para emular el servidor HomeKit. En su última versión (`v2.1.7`), el código de `RTPStreamManagement.d.ts` y `RecordingManagement.d.ts` **sólo tiene definido el enum `H264` y `H264Profile`**. La comunidad de HAP-NodeJS aún no ha fusionado la implementación de los nuevos UUIDs y TLVs para HEVC.
*   **Solución:** Aunque Scrypted está listo para reenviar el stream directo (direct passthrough) de H.265 sin tocarlo, requeriremos que el proyecto upstream (`hap-nodejs`) integre la actualización del perfil HEVC, o bien, generar un parche customizado (monkey-patch) en `camera-streaming.ts` que manipule los bytes del TLV (Type-Length-Value) a mano. Por ahora, HomeKit forzará la negociación H264 a menos que apliquemos ese parche avanzado en el futuro.

## 4. Detección Inteligente Avanzada y Recursos Cero (Reemplazo de OpenCV)

*   Para evitar cargar cámaras con procesos como OpenCV (que consumen muchos recursos), la recomendación probada en hardware como **Raspberry Pi 5** es **NCNN**. 
*   **NCNN** es un framework neuronal computacional de alto rendimiento optimizado específicamente para procesadores ARM de arquitecturas ligeras (mucho mejor optimizado que ONNX Runtime o el clásico OpenCV DNN). Utiliza instrucciones ARM NEON nativas sin requerir una NPU externa para dar resultados rápidos en RAM/CPU reducidos para detección de Personas, Vehículos y Animales.
*   **Integración Sugerida:** Mantener el uso del ecosistema `ncnn` nativo como la principal fuente externa de sensores falsos (mock sensors) para inyectar a cámaras simples, permitiendo que `camera.ts` los exponga al puente de Apple automáticamente.
