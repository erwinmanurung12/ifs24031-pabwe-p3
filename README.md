# Kotak Harian — Studi Kasus Praktikum 3 (PABWE)

Aplikasi satu halaman (single page) yang menggabungkan tiga fitur lewat navigasi tab:

1. **Catatan Pengeluaran Harian** (Expense Tracker) — CRUD transaksi, ringkasan saldo, cari/filter/sort, `localStorage`.
2. **Bookmark / Link Manager** — CRUD tautan, validasi URL, buka tab baru, cari/sort, `localStorage`.
3. **Kuis Interaktif** (Quiz App) — 7 soal (array of object), skor, high score `localStorage`, bisa diulang.

## Struktur proyek
```
index.html          # markup & struktur UI (semantic HTML5)
assets/script.js     # seluruh logika JavaScript (dikelompokkan per fitur)
assets/img/          # aset gambar opsional (tidak dipakai saat ini)
```

## Catatan implementasi
- Tab aktif disimpan & dipulihkan lewat **query URL** (`?tab=expense`, `?tab=bookmark`, `?tab=quiz`), bukan `localStorage`.
- Setiap fitur memakai **key `localStorage` berbeda**:
  - `kotak-harian-expense`
  - `kotak-harian-bookmarks`
  - `kotak-harian-quiz-highscore`
- Styling memakai Tailwind CSS (CDN), Google Fonts, dan Tabler Icons (CDN) — tanpa backend/`fetch`.
- Ubah & hapus data memakai modal (bukan `prompt`/`confirm` bawaan browser).

## Cara menjalankan
Buka `index.html` langsung di browser, atau jalankan server statis sederhana, mis:
```
python3 -m http.server 8000
```
lalu akses `http://localhost:8000/index.html`.
