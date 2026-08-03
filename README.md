# Inova Medika Backend

API Express 5 dan PostgreSQL sebagai fondasi Sistem Informasi Klinik Mini. Kode sumber ini menggunakan arsitektur modular monolith dengan TypeScript ketat dan Prisma ORM.

## 1. Cara instalasi aplikasi

Untuk menginstal aplikasi, pastikan Anda menggunakan Node.js versi 22.12 atau yang lebih baru, pnpm 11.18, dan PostgreSQL 17.

Jalankan perintah berikut:
```bash
corepack enable pnpm
pnpm env:init
pnpm install --frozen-lockfile
docker compose up -d postgres
```

## 2. Cara menjalankan aplikasi

Setelah instalasi selesai dan database siap, jalankan server pengembangan:
```bash
pnpm dev
```
API secara default akan berjalan di `http://localhost:3100/api/v1` (tergantung konfigurasi `.env`).

## 3. Struktur project

```text
src/
├── config/                 # Konfigurasi env dan logger
├── db/                     # Koneksi Prisma ORM
├── generated/              # Client Prisma yang di-generate
├── http/                   # Pengaturan express, error handler, response standard
├── modules/                # Modul domain (auth, patients, registrations, dsb)
└── server.ts               # Titik masuk utama (Entry point)
```

## 4. Akun login

Terdapat beberapa akun demonstrasi yang bisa digunakan setelah melakukan proses *seeding*. Kata sandi default untuk semua akun demonstrasi (*seed*) adalah `PXVwME_C3EXm1KOoacyNhZWU3Vm2QB1z`.

- **Admin**: `admin` (Role: ADMINISTRATOR)
- **Petugas Pendaftaran**: `registration` (Role: REGISTRATION_OFFICER)
- **Dokter**: `doctor` (Role: DOCTOR)

## 5. Konfigurasi file .env

File `.env` otomatis dibuat dari `.env.example` dengan perintah `pnpm env:init`. 

Beberapa variabel kunci:
- `DATABASE_URL`: String koneksi utama ke database PostgreSQL.
- `JWT_ACCESS_SECRET`: Kunci rahasia untuk menandatangani JWT.
- `PORT`: Port server backend berjalan (contoh: 3100).
- `FRONTEND_ORIGIN`: URL frontend yang diizinkan untuk CORS (contoh: `http://localhost:5173`).

## 6. Cara melakukan migrasi database (jika menggunakan migration)

Kami menggunakan Prisma ORM untuk melakukan migrasi skema database dan *seeding* (pengisian data awal).

Jalankan perintah berikut secara berurutan:
```bash
pnpm db:migrate
pnpm db:seed
```
