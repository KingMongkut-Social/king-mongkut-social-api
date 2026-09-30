FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S nodejs && adduser -S app -G nodejs
RUN mkdir -p /app/uploads && chown app:nodejs /app/uploads
COPY --from=build --chown=app:nodejs /app/package*.json ./
COPY --from=build --chown=app:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=app:nodejs /app/dist ./dist
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
