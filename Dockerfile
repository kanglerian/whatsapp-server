# Menggunakan image Node.js versi terbaru sebagai base image
FROM node:20-alpine

# Buat direktori aplikasi di dalam container
WORKDIR /app

# Salin package.json dan package-lock.json ke direktori kerja
COPY package*.json ./

# Install dependensi aplikasi
RUN npm install

# Salin kode aplikasi ke direktori kerja
COPY . .

# Mengambil nilai PORT dari environment variable yang didefinisikan di docker-compose.yml
ARG PORT
ENV PORT $PORT

# Expose port 3000 untuk aplikasi
EXPOSE $PORT

# Menjalankan aplikasi saat container dijalankan
CMD ["npm", "start"]