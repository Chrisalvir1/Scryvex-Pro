#!/usr/bin/env bash
# ==============================================================
# Scryvex Pro — Script de instalación
# Repo: github.com/Chrisalvir1/Scryvex-Pro
# ==============================================================
set -euo pipefail

# ── Colores ────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Helpers ────────────────────────────────────────────────────
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

banner() {
cat << 'BANNER'
  ____                            ______
 / ___|  ___ _ __ _   ___  _____/ /  _ \ _ __ ___
 \___ \ / __| '__| | | \ \/ / _ \ /| |_) | '__/ _ \
  ___) | (__| |  | |_| |>  <  __/ / |  __/| | | (_) |
 |____/ \___|_|   \__, /_/\_\___|_/ |_|   |_|  \___/
                  |___/
         Scryvex Pro — Instalador v1.0
==============================================================
BANNER
}

# ── Requisitos ─────────────────────────────────────────────────
check_requirements() {
    info "Verificando requisitos..."

    command -v docker >/dev/null 2>&1 \
        || error "Docker no está instalado. Instalá Docker Desktop o Engine primero."

    docker info >/dev/null 2>&1 \
        || error "Docker no está corriendo. Iniciá Docker y volvé a ejecutar."

    # docker compose v2 (plugin) o docker-compose v1
    if docker compose version >/dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then
        COMPOSE_CMD="docker-compose"
    else
        error "Docker Compose no encontrado. Instalá Docker Compose v2."
    fi

    success "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
    success "$COMPOSE_CMD $(${COMPOSE_CMD} version --short 2>/dev/null || echo 'v1')"
}

# ── Directorio de instalación ───────────────────────────────────
resolve_install_dir() {
    # Por defecto: ~/.scrypted (igual que Scrypted oficial)
    INSTALL_DIR="${SCRYVEX_INSTALL_DIR:-$HOME/.scryvex}"

    info "Directorio de instalación: ${BOLD}$INSTALL_DIR${NC}"

    if [[ -d "$INSTALL_DIR" ]]; then
        warn "El directorio ya existe. Se actualizará la configuración."
    fi

    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"
}

# ── Archivos de configuración ───────────────────────────────────
setup_compose_files() {
    info "Copiando docker-compose.yml..."

    # Detectar dónde está el script para copiar desde el repo
    SCRIPT_DIR="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"

    if [[ -f "$SCRIPT_DIR/docker-compose.yml" ]]; then
        cp "$SCRIPT_DIR/docker-compose.yml" "$INSTALL_DIR/docker-compose.yml"
        success "docker-compose.yml copiado desde repo"
    else
        # Descarga directa desde GitHub si no está localmente
        info "Descargando docker-compose.yml desde GitHub..."
        curl -fsSL \
            "https://raw.githubusercontent.com/Chrisalvir1/Scryvex-Pro/main/install/docker/docker-compose.yml" \
            -o "$INSTALL_DIR/docker-compose.yml" \
            || error "No se pudo descargar docker-compose.yml"
        success "docker-compose.yml descargado"
    fi
}

# ── .env ────────────────────────────────────────────────────────
setup_env() {
    ENV_FILE="$INSTALL_DIR/.env"

    if [[ -f "$ENV_FILE" ]]; then
        warn ".env ya existe — no se sobreescribirá."
        warn "Editalo manualmente si necesitás cambiar el token: $ENV_FILE"
        return
    fi

    info "Generando .env con token seguro..."

    # Generar token con openssl o fallback a /dev/urandom
    if command -v openssl >/dev/null 2>&1; then
        TOKEN=$(openssl rand -hex 32)
    else
        TOKEN=$(cat /dev/urandom | tr -dc 'a-f0-9' | fold -w 64 | head -1)
    fi

    cat > "$ENV_FILE" << ENVFILE
# Scryvex Pro — Variables de entorno
# Generado automáticamente por install.sh el $(date '+%Y-%m-%d %H:%M:%S')
# NO commitear este archivo al repositorio.

# Token de auto-update (generado automáticamente)
WATCHTOWER_HTTP_API_TOKEN=${TOKEN}

# DNS (opcional — default: Cloudflare + Google)
# SCRYPTED_DNS_SERVER_0=192.168.1.1
# SCRYPTED_DNS_SERVER_1=8.8.8.8

# Polling de updates de Watchtower
WATCHTOWER_HTTP_API_PERIODIC_POLLS=true
ENVFILE

    chmod 600 "$ENV_FILE"
    success ".env creado en $ENV_FILE"
}

# ── Volumen persistente ─────────────────────────────────────────
setup_volumes() {
    info "Creando directorio de volumen persistente..."
    mkdir -p "$INSTALL_DIR/volume"
    success "Volumen: $INSTALL_DIR/volume"
}

# ── Levantar contenedores ───────────────────────────────────────
start_services() {
    info "Descargando imágenes y levantando Scryvex Pro..."
    cd "$INSTALL_DIR"
    $COMPOSE_CMD pull
    $COMPOSE_CMD up -d
    success "Scryvex Pro levantado correctamente"
}

# ── Post-instalación ────────────────────────────────────────────
post_install() {
    # Obtener IP local
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' \
        || ipconfig getifaddr en0 2>/dev/null \
        || echo "tu-ip-local")

    echo ""
    echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}  ✅  Scryvex Pro instalado correctamente${NC}"
    echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  🌐  Accedé desde el navegador:"
    echo -e "      ${BOLD}https://${LOCAL_IP}:10443${NC}"
    echo -e "      ${BOLD}https://localhost:10443${NC}"
    echo ""
    echo -e "  📁  Instalación: ${BOLD}$INSTALL_DIR${NC}"
    echo -e "  🔑  Token:       ${BOLD}$INSTALL_DIR/.env${NC}"
    echo ""
    echo -e "  📋  Comandos útiles:"
    echo -e "      Ver logs:    ${CYAN}$COMPOSE_CMD -f $INSTALL_DIR/docker-compose.yml logs -f${NC}"
    echo -e "      Detener:     ${CYAN}$COMPOSE_CMD -f $INSTALL_DIR/docker-compose.yml down${NC}"
    echo -e "      Actualizar:  ${CYAN}$COMPOSE_CMD -f $INSTALL_DIR/docker-compose.yml pull && $COMPOSE_CMD up -d${NC}"
    echo ""
}

# ── Main ────────────────────────────────────────────────────────
main() {
    banner
    check_requirements
    resolve_install_dir
    setup_compose_files
    setup_env
    setup_volumes
    start_services
    post_install
}

main "$@"
