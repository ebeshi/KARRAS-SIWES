# Virtual Lab

This repo is focused on the **Virtual Lab** product (student coding workspace + instructor grading + exports) backed by **Supabase**.

## Run locally

From the repo root:

```bash
npm install
npm run dev
```

Open:
- http://localhost:5173/login
- http://localhost:5173/pyodide-test

## Supabase setup

Set the following in `virtual-lab/.env`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Database migrations are available in both locations:
- `supabase/migrations/`
- `virtual-lab/supabase/migrations/`
