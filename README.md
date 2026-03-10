# PirtAI

Kahverengi temali, kullanici adi + sifre ile giris yapan, admin cevapli sohbet uygulamasi.

## Giris modeli

- Uygulamada email alani yoktur.
- Ana sayfada sadece `kullanici adi` ve `sifre` ile giris yapilir.
- Yeni kullanici, ilk giriste kullanici adi + sifresiyle otomatik olusturulur.
- Admin paneline sadece sabit admin hesabi erisebilir.
- Admin kullanici adi: `admin`
- Admin sifresi: `367600dtA`

## Teknoloji

- Frontend: HTML + CSS + Vanilla JS
- Hosting: Netlify
- Database: Supabase (PostgreSQL)
- Backend: Netlify Functions

## 1) Supabase SQL kurulumu

1. Supabase projesi ac.
2. `SQL Editor` ac.
3. [schema.sql](C:/Users/USER/PirtAI/supabase/schema.sql) dosyasinin tamamini calistir.

Bu script:
- `app_users`, `app_sessions`, `conversations`, `messages` tablolarini olusturur.
- `admin / 367600dtA` hesabini otomatik ekler.

## 2) Netlify environment variables

Netlify > Site configuration > Environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Not: `SUPABASE_ANON_KEY` artik gerekmez.

## 3) Deploy

Build ayarlari:

- Build command: `npm run build`
- Publish directory: `public`
- Functions directory: `functions`

Sonra `Trigger deploy > Clear cache and deploy`.

## 4) Kullanim

1. Ana sayfada (`/`) kullanici adi + sifre ile giris yap. Hesap yoksa ilk giriste otomatik acilir.
2. Mesaj gonder.
3. `admin / 367600dtA` ile giris yapip `Admin Panel`e gir.
4. Kullanici mesajlarini admin panelinden cevapla.

## Lokal calistirma (opsiyonel)

```bash
npm install
npx netlify dev
```

