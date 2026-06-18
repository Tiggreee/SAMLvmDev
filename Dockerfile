FROM node:18-alpine AS builder

WORKDIR /app

# Instalar dependencias
COPY package*.json ./
RUN npm ci

# Copiar código fuente
COPY tsconfig.json ./
COPY src ./src

# Compilar TypeScript
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Instalar dependencias de producción solo
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copiar código compilado del builder
COPY --from=builder /app/dist ./dist

# Crear directorio de certificados
RUN mkdir -p certificates/idp-public-certs

# Exponer puerto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Iniciar aplicación
CMD ["node", "dist/main.js"]
