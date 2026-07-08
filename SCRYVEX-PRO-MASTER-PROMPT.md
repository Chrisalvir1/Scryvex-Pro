# 🧠 Scryvex Pro — Master Prompt & Estado Completo del Proyecto

> Documento generado: 7 de julio de 2026  
> Para continuar desarrollo en otra sesión de IA

---

## 📋 Contexto General

**Scryvex Pro** es un fork personalizado de [Scrypted](https://github.com/koush/scrypted) — una plataforma open source de integración de cámaras para HomeKit, Google Home y Alexa.

El objetivo es adaptar Scrypted para que funcione como **addon de Home Assistant** en una **Raspberry Pi 5**, enfocado en:

- **Remux directo** de cámaras IP a HomeKit sin transcodificación (para no cargar la CPU de la Pi 5)
- **Soporte H.264 y H.265** con aceleración de hardware cuando sea necesario
- **Una cámara = una entidad en HomeKit** (PTZ, sirena, luz y movimiento agrupados, no como accesorios separados)
- **UI funcional** sin pantalla en blanco en el addon de Home Assistant
- **Soporte multi-marca:** EZVIZ, Aqara G410 (2K), Hikvision, ONVIF genérico, RTSP, Tapo, Reolink, Ring, Wyze, Amcrest, Doorbird, Eufy, UniFi

---

## 🔗 Repositorios y Rutas

| Elemento | Valor |
|---|---|
| **Repo en GitHub** | https://github.com/Chrisalvir1/Scryvex-Pro |
| **Repo local (Mac)** | `/Users/chrisalvir/Desktop/GITHUB PROJECT/Scryvex Pro` |
| **Usuario GitHub** | `Chrisalvir1` |
| **Email GitHub** | `chrisalvir01@gmail.com` |
| **Rama principal** | `main` |
| **SSH key** | Configurada y agregada a GitHub ✅ |
| **Remote URL** | `git@github.com:Chrisalvir1/Scryvex-Pro.git` |

---

## 🏗️ Historia del Proyecto — Paso a Paso

### Fase 0 — Origen y descarga de Scrypted

1. Se descargó el código fuente de Scrypted desde su repositorio oficial en GitHub
2. Se identificaron los problemas principales del proyecto base:
   - La UI del plugin `core` mostraba **pantalla en blanco** en el addon de HA porque los archivos compilados estaban en `plugins/core/fs/dist/` en vez de `plugins/core/dist/`
   - El sistema de plugins no tenía una capa de abstracción para definir capacidades de cámara
   - No existía un motor de evaluación para decidir cuándo hacer remux vs transcodificación
3. Se creó el repo `Chrisalvir1/Scryvex-Pro` en GitHub

### Fase 1 — Corrección de la UI (pantalla en blanco)

**Problema:** Al instalar el addon de Scrypted en Home Assistant, la UI cargaba en blanco.

**Causa raíz:** El `Dockerfile.s6` copiaba los archivos del plugin `core` desde `fs/dist/` pero la ruta esperada dentro del contenedor era `dist/`. Los archivos `index.html`, `main.js` y demás assets del frontend quedaban en la ruta incorrecta.

**Solución aplicada:**
- Se eliminó la carpeta `plugins/core/fs/dist/` del tracking de git
- Se verificó que `plugins/core/dist/index.html` existía y tenía el contenido correcto
- Se agregó lógica en el `Dockerfile.s6` para verificar la ruta de la UI

### Fase 2 — Configuración de Docker y CI/CD

Se configuraron los siguientes archivos en el repo:

**`.github/workflows/docker.yml`** — Publica imagen Docker en `ghcr.io/chrisalvir1/scrypted` en cada push a `main`  
**`.github/workflows/release.yml`** — Crea releases automáticos cuando se hace push de un tag `v*`  
**`Dockerfile.s6`** — Imagen base con compilación de todos los plugins, usando Node.js y TypeScript

### Fase 3 — Creación de paquetes base (7 julio 2026)

Se crearon 4 paquetes nuevos dentro de `packages/`:

#### `packages/camera-core`
Define las interfaces base para cámaras:
```typescript
export interface CameraStream {
  url: string;
  codec: 'h264' | 'h265' | 'unknown';
  width: number;
  height: number;
  fps: number;
  remuxable: boolean;
}

export interface CameraCapabilities {
  id: string;
  name: string;
  streams: CameraStream[];
  hasPTZ: boolean;
  hasMotion: boolean;
  hasAudio: boolean;
  hasLight: boolean;
  hasSiren: boolean;
}
```

#### `packages/compat-engine`
Motor de evaluación de compatibilidad remux vs transcode:
```typescript
export function evaluateCompat(camera: CameraCapabilities): CompatResult {
  // Si hay stream H.264 remuxable → remux directo sin transcodificación
  // Si solo hay H.265 → transcode con hardware
  // Sin stream compatible → error
}
```

#### `packages/runtime`
Base para el ciclo de vida de plugins:
```typescript
export interface PluginRuntime {
  name: string;
  version: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}
export class BaseRuntime implements PluginRuntime { ... }
```

#### `packages/registry`
Registro central de cámaras en memoria:
```typescript
export function registerCamera(c: CameraCapabilities): void
export function getCamera(id: string): CameraCapabilities | undefined
export function getAllCameras(): CameraCapabilities[]
export function unregisterCamera(id: string): void
```

### Fase 4 — Problemas con el push desde Terminal

Durante la sesión se identificaron y resolvieron varios problemas:

1. **Terminal abría siempre en `~` (home)** — cada comando necesitaba `cd` al inicio
2. **Remote URL incorrecto** — apuntaba a `Scrypted-Pro-G-C` (no existe). Corregido a `Scryvex-Pro`
3. **SSH key no configurada** — se generó `~/.ssh/id_ed25519` y se agregó a GitHub
4. **`git status` tardaba 45+ minutos** — el repo tiene 1,331 archivos en el índice de git
5. **`git push` se desconectaba** — el archivo `scrypted-core-0.3.147.tgz` en el historial causa que GitHub corte la conexión

**Solución temporal:** Los 4 paquetes se subieron directamente via GitHub API.

---

## ✅ Estado Actual — Lo que está en GitHub

```
Chrisalvir1/Scryvex-Pro (main)
├── LICENSE
├── README.md
├── ESTADO-PROYECTO.md
├── SCRYVEX-PRO-MASTER-PROMPT.md
└── packages/
    ├── camera-core/src/index.ts     ← CameraStream, CameraCapabilities
    ├── compat-engine/src/index.ts   ← evaluateCompat()
    ├── runtime/src/index.ts         ← PluginRuntime, BaseRuntime
    └── registry/src/index.ts        ← registerCamera, getCamera, getAllCameras
```

**Lo que está en el repo local pero NO en GitHub todavía:**
- Todos los plugins de Scrypted (`plugins/rtsp27`, `plugins/onvif27`, `plugins/homekit27`, etc.)
- El `Dockerfile.s6` con las correcciones
- Los archivos de GitHub Actions
- La corrección de la UI del `plugins/core`

---

## ⏳ Pendientes en Orden de Prioridad

### 🔴 Urgente — Sin esto el proyecto no puede subirse completo a GitHub

**1. Limpiar el `.tgz` del historial git local**

```bash
cd "/Users/chrisalvir/Desktop/GITHUB PROJECT/Scryvex Pro"
pip3 install git-filter-repo
git filter-repo --path scrypted-core-0.3.147.tgz --invert-paths
git remote add origin git@github.com:Chrisalvir1/Scryvex-Pro.git
git push origin main --force
```

**2. Sincronizar repo local con GitHub después de limpiar:**
```bash
git pull origin main --rebase
git push origin main --force
```

---

### 🟡 Importante — Para que funcione como addon en Home Assistant

**3. Crear `addons/scryvex-pro/config.yaml`:**
```yaml
name: Scryvex Pro
version: "1.0.0"
slug: scryvex_pro
description: Scrypted personalizado con remux directo para HomeKit en Raspberry Pi 5
url: https://github.com/Chrisalvir1/Scryvex-Pro
arch:
  - aarch64
  - amd64
startup: application
boot: auto
ports:
  11080/tcp: 11080
  11443/tcp: 11443
map:
  - config:rw
  - data:rw
image: ghcr.io/chrisalvir1/scrypted:{version}
```

**4. Corregir `Dockerfile.s6` para la UI sin pantalla en blanco:**
```dockerfile
RUN cd /scrypted-src/plugins/core && \
    test -f dist/index.html || \
    (cp -r fs/dist/* dist/ && echo "UI copiada desde fs/dist")
```

---

### 🟢 Siguiente fase — Conectar los paquetes nuevos a los plugins

**5. Cablear imports:**
- `plugins/rtsp27/src/main.ts` → importar `CameraCapabilities`, `registerCamera`
- `plugins/onvif27/src/main.ts` → importar `CameraCapabilities`, `evaluateCompat`
- `plugins/homekit27/src/main.ts` → importar `getCamera`, `getAllCameras`

**6. Primera prueba end-to-end en Raspberry Pi 5**

---

## 🐛 Problemas Conocidos

| Problema | Causa | Estado |
|---|---|---|
| `git push` se corta | `scrypted-core-0.3.147.tgz` en historial git | ⏳ Pendiente limpiar |
| `git status` tarda 45+ min | 1,331 archivos en índice de git | ⏳ Relacionado con el `.tgz` |
| Terminal siempre abre en `~` | macOS abre Terminal en home por defecto | ✅ Workaround: `cd "..."` al inicio |
| UI pantalla en blanco | Ruta `fs/dist/` vs `dist/` en `core` plugin | ✅ Identificado, pendiente validar en Docker |

---

## 🎯 Prompt Corto para Empezar una Nueva Sesión

```
Proyecto: Scryvex Pro — fork de Scrypted para HomeKit en Raspberry Pi 5
Repo GitHub: https://github.com/Chrisalvir1/Scryvex-Pro
Repo local Mac: /Users/chrisalvir/Desktop/GITHUB PROJECT/Scryvex Pro

Objetivo: remux directo de cámaras (EZVIZ, Aqara G410 2K, Hikvision, ONVIF, RTSP, Tapo,
Reolink) a HomeKit sin transcodificación. Una cámara = una entidad en HomeKit.

Hecho:
✅ Repo GitHub creado, SSH configurado
✅ 4 paquetes subidos: camera-core, compat-engine, runtime, registry
✅ UI pantalla en blanco identificada (fs/dist/ vs dist/)

Pendiente:
❌ scrypted-core-0.3.147.tgz bloquea git push (usar git-filter-repo para limpiar)
❌ config.yaml para addon de Home Assistant no creado
❌ Plugins rtsp27, onvif27, homekit27 no cableados a los paquetes nuevos
❌ Dockerfile.s6 no tiene el fix de la UI del core
```

---

*Generado el 7 de julio de 2026*
