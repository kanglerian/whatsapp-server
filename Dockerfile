# Menggunakan image Node.js versi terbaru sebagai base image
FROM node:20-alpine

RUN apt update && apt install -y \
    gconf-service libgbm-dev libasound2 libatk1.0-0 libc6 libcairo2 libcups2 \
    libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 \
    libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 \
    libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 \
    libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates \
    fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget
    
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