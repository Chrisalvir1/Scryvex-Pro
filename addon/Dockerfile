ARG BUILD_FROM=node:24-bookworm-slim
FROM $BUILD_FROM

# 1. Instalar dependencias del sistema operativo (FFmpeg es vital para tu Fase 3)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    postgresql-client \
    git \
    python3 \
    python3-pip \
    build-essential \
    libavahi-compat-libdnssd-dev \
    && rm -rf /var/lib/apt/lists/*

# 2. Habilitar pnpm de forma nativa
RUN corepack enable && corepack prepare pnpm@latest --activate

# 3. Establecer el directorio de trabajo
WORKDIR /usr/src/app

# 4. Clonar el codigo (Sustituyo COPY . . por git clone para evitar el crash de contexto Docker en HA Add-ons)
RUN git clone https://github.com/Chrisalvir1/Scryvex-Pro-V2.git .

# 5. Instalar las dependencias (el flag --no-frozen-lockfile evita errores si no hay lockfile)
RUN pnpm install --no-frozen-lockfile

# 6. Dar permisos al script de inicio y ejecutar
RUN chmod a+x run.sh
CMD [ "./run.sh" ]
