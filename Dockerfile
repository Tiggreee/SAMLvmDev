FROM node:24-alpine AS builder

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
FROM node:24-alpine

WORKDIR /app

# Instalar dependencias de producción solo
COPY package*.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copiar código compilado del builder
COPY --from=builder /app/dist ./dist

# Crear directorio de certificados
RUN mkdir -p certificates/idp-public-certs && \
    chown -R node:node /app

# Drop privileges: never run as root in production
USER node

# Exponer puerto
EXPOSE 3000

# Health check (respeta el PORT inyectado por la plataforma, p. ej. Railway)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "const p=process.env.PORT||3000;require('http').get('http://localhost:'+p+'/health',(r)=>{if(r.statusCode!==200)throw new Error(r.statusCode)})"

# Iniciar aplicación
CMD ["node", "dist/main.js"]
