# Etapa 5 — 3.0.0 final: auditoría y publicación

## Propósito

Convertir `3.0.0-rc.1` en `3.0.0` solo si el sistema funciona de extremo a
extremo en Home Assistant ARM64.

## Lista final obligatoria

- Todas las etapas anteriores tienen SHA, CI verde, pruebas reproducibles y
  resultados de hardware documentados.
- Add-on actualizado desde la versión anterior sin perder configuración.
- Preview RTSP/ONVIF y UI a través de Ingress funcionan con cámaras reales.
- Apple/Matter muestran solamente funciones verificadas.
- No hay secretos en API, UI, Event Journal, Audit Log ni logs técnicos.
- Se verifican backup, restore, reinicios y rollback de actualización.
- Versiones alineadas en raíz, server, frontend, contracts y `addon/config.yaml`.
- Se prepara changelog/migración/release notes en español e inglés si aplica.

## Publicación

1. Congelar cambios y ejecutar CI/rebuild ARM64 desde el SHA final.
2. Ejecutar smoke/regresión completos.
3. Cambiar versión a `3.0.0` en un commit exclusivo de release.
4. Crear y publicar tag anotado `v3.0.0` desde ese SHA.
5. Actualizar Home Assistant desde el repositorio y repetir una prueba breve.

No crear ni empujar el tag antes de completar los pasos anteriores.

## Handoff

Adjuntar SHA final, tag, checksum/imagen, notas de release, problemas
conocidos y procedimiento de rollback.
