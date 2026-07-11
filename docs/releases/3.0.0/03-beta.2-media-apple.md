# Etapa 3 — 3.0.0-beta.2: medios reales y compatibilidad Apple

## Propósito

Resolver media real, no simulada: RTSP/ONVIF, preview bajo Ingress, códecs
originales, remux y evaluación Apple/HomeKit.

## Alcance planeado

- Validar cada perfil ONVIF con FFprobe y detectar vídeo real.
- Normalizar URL RTSP sin doble codificación de credenciales.
- `frame.jpg` validado antes de iniciar preview continuo.
- Preview robusto bajo Home Assistant Ingress; MJPEG solo si demuestra ser
  fiable, con fallback a frame periódico si procede.
- Mostrar códecs crudos de fuente y separar copy/remux/transcode.
- Descubrir audio, luz, sirena, PTZ y talkback exclusivamente mediante
  interfaces o APIs comprobables; RTSP no crea entidades de control.
- Evaluar HomeKit desde evidence y decisiones de media, sin afirmar soporte
  por presencia de un códec.

## Criterios de salida

- Cámara RTSP real y cámara ONVIF real generan JPEG válido y lo muestran por
  Ingress.
- Errores distinguen ONVIF, autenticación RTSP, transporte, stream inválido y
  falta de vídeo.
- No quedan procesos FFmpeg huérfanos.
- H.264/H.265 remux solo aparece cuando el stream fuente lo permite; audio
  puede adaptarse independientemente.
- Evidencia de audio/micrófono/altavoz/luz/sirena/PTZ por capacidad y fuente.

## Handoff

Adjuntar resultados de perfiles, errores saneados, capturas de Ingress,
matriz de códecs y evidencia de procesos antes/después.
