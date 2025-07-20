FROM node:18-alpine

WORKDIR /app

# Install system dependencies for Prisma
RUN apk add --no-cache \
    openssl \
    ca-certificates \
    curl \
    libc6-compat

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Create directories
RUN mkdir -p uploads logs

# Expose port
EXPOSE 3001

# Start application
CMD ["node", "dist/index.js"]
