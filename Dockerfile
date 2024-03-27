# Dockerfile
FROM node:20-alpine

WORKDIR /app
COPY . .

# Install dependencies
RUN npm install

# Mengambil nilai PORT dari environment variable yang didefinisikan di docker-compose.yml
ARG PORT
ENV PORT $PORT

# Command to run the application
CMD ["node", "server.js"]