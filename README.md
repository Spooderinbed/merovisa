This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Environment & auth setup

Copy `.env.example` to `.env.local` and fill in the Supabase values:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from the Supabase project (Settings → API).
- `SUPABASE_SERVICE_ROLE_KEY` — **server-only**; used for privileged writes (anonymous assessment persistence, claim-on-signup, lead capture). Never expose it to the client or commit it.

**Live Google sign-in** (the only account method) additionally requires a one-time Supabase dashboard setup:

1. Auth → Providers → **Google**: enable it and paste a Google Cloud OAuth client id + secret.
2. Register the callback URL `<site-url>/auth/callback` (e.g. `http://localhost:3000/auth/callback` for local dev) in both Supabase and the Google OAuth client.

The schema lives in `supabase/migrations/` and is already applied to the project. Tests mock Supabase, so `npm test` needs no live credentials.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
