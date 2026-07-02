# Kaderníctvo Fantázia – rezervačný systém

Mobilná webová aplikácia na rezerváciu termínov (React + Vite).

## Spustenie lokálne

```
npm install
npm run dev
```

## Nasadenie

1. Nahrajte celý priečinok na GitHub (nový repozitár).
2. Na https://vercel.com importujte repozitár a kliknite Deploy.
   Vercel automaticky rozpozná Vite, netreba nič nastavovať.

## Zdieľané rezervácie (Supabase)

Bez nastavenia sa rezervácie ukladajú len lokálne v prehliadači
(každý zákazník vidí len tie svoje) – vhodné na testovanie.
Aby všetci videli rovnaké obsadené termíny:

1. Na https://supabase.com si zadarmo vytvorte projekt.
2. V SQL Editore spustite:

```sql
create table bookings (
  id text primary key,
  date text not null,
  start_min int not null,
  min int not null,
  service text,
  price int,
  name text,
  phone text,
  note text,
  created_at timestamptz default now()
);
alter table bookings enable row level security;
create policy "public read"   on bookings for select using (true);
create policy "public insert" on bookings for insert with check (true);
create policy "public delete" on bookings for delete using (true);
```

3. V Supabase v Settings → API skopírujte Project URL a anon public key.
4. Vložte ich do súboru `src/config.js`:

```js
export const SUPA_URL = "https://xxxxx.supabase.co";
export const SUPA_KEY = "eyJ...";
```

5. Commitnite zmenu na GitHub – Vercel web automaticky prebuduje.

## Úpravy

- Služby, ceny a trvanie: pole `SERVICES` v `src/App.jsx`
- Admin PIN: konštanta `ADMIN_PIN` v `src/App.jsx` (predvolene 1234)
- Otváracie hodiny: `OPEN` a `CLOSE` v `src/App.jsx`
- Adresa a telefón: sekcia Kontakt v `src/App.jsx`
