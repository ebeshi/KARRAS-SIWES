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
- http://localhost:5173/pyodide-test (browser runtime test)

The runtime test and student editor support Python (Pyodide), JavaScript, C, C++, Java, and C#,
plus sandboxed HTML/CSS previews. Language runtimes are loaded on first use. C/C++ fetch the Clang
WebAssembly runtime (about 29 MB of assets); Java loads CheerpJ and its Java 8 compiler from public
CDNs; the first Java run may take several minutes while the OpenJDK runtime and Java 8 compiler
download. C# loads the WasmSharp .NET/Roslyn runtime and compiler assets from the app's static assets.
Java language features are limited to Java 8. HTML previews disable scripts and network access.

## Supabase setup

Set the following in `virtual-lab/.env` for local development and in the Vercel project
environment settings for deployment:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Never use the Supabase `service_role` key in this frontend. The anon/publishable key is
designed to be public; database access is controlled by Row Level Security.

### Fresh Supabase project

1. In the Supabase Dashboard, open **SQL Editor** and run the migration files in numeric
   order from `001_init.sql` through `015_supabase_production_setup.sql`. Use only one
   copy of each migration; the files are mirrored in these locations:
- `supabase/migrations/`
- `virtual-lab/supabase/migrations/`
2. In **Authentication → URL Configuration**, set the Site URL to your Vercel URL and add
   the local development URL and your Vercel preview/production URLs to the allowed redirect
   URLs. Email confirmation can stay enabled; new users will be prompted to confirm before
   signing in.
3. In **Vercel**, import this repository. Keep the project root at the repository root;
   the root `vercel.json` builds the Vite app in `virtual-lab` and publishes its `dist`
   directory. Add both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the Vercel
   Development, Preview, and Production environments, then deploy.
4. Test the deployed registration and login flows, institution lookup and setup, instructor
   manual/task editing and PDF upload, plus student enrollment and submission. The first
   institution is created using **Register Institution**; its account becomes that
   institution's administrator.

For local development, create `virtual-lab/.env` with the two variables, then run from the
repository root:

```bash
npm install
npm run dev
```

Demo accounts are no longer seeded or shown on the login page; users should register through the app.
Manual tasks require an executable language and expected output for automatic checking. Students can
complete tasks only when their output matches, and the manual receives one result per student:
completed tasks, completion status, and a score of 40 only when every task is complete. A manual
left incomplete at its deadline receives an incomplete result.
