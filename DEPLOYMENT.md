# 🚀 Mindshare Full-Stack Multi-User Deployment Guide

This guide explains step-by-step how to deploy **Mindshare** as a 100% free, private multi-user internal workspace for 5–10 team members:

1. **Database & Auth**: Supabase (Free Tier Managed PostgreSQL + Supabase Auth)
2. **Backend API**: Render (Free Web Service)
3. **24/7 Keep-Alive**: UptimeRobot (Free 5-minute ping to keep Render warm with zero cold-starts)
4. **Frontend Web App**: Vercel (React + Vite + Tailwind)
5. **On-Demand AI Tags**: Groq Cloud API (Llama 3 / Mixtral)

---

## 🏗️ Architecture & Privacy Model

```
 ┌─────────────────────────┐          ┌─────────────────────────┐
 │     Vercel (Frontend)   │          │     Render (Backend)    │
 │                         │   HTTP   │                         │
 │ - Google / Email Auth   │ ───────> │ - Stateless JWT Auth    │
 │ - Notion/Apple UI       │ (Bearer) │ - Scoped Private Feeds  │
 │ - "Tagged Me" Screen    │          │ - Real @mentions Engine │
 └────────────┬────────────┘          └────────────┬────────────┘
              │                                    │
              │                                    │
              ▼                                    ▼
 ┌─────────────────────────┐          ┌─────────────────────────┐
 │    Supabase Auth & DB   │          │   Groq AI (On-Demand)   │
 │ - Multi-Tenant RLS      │ <─────── │ - User Controlled Tags  │
 │ - Strict Private Tags   │          │ - Zero Junk Tag Spam    │
 └─────────────────────────┘          └─────────────────────────┘
              ▲
              │
 ┌────────────┴────────────┐
 │  UptimeRobot (Keepalive)│
 │ - Pings /health every 5m│
 └─────────────────────────┘
```

---

## Step 1: Database & Auth Setup (Supabase)

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. Open the **SQL Editor** in your Supabase project.
3. Open `database/migration_multiuser_auth.sql` from this repository, copy the entire script, and click **Run**.
   - This creates `users`, `notes`, `tags`, `note_tags`, and `mentions` tables.
   - Sets up multi-tenant Row Level Security (RLS) so users can **only** read their own notes and notes where they are tagged.
   - Installs high-performance indexes for 10,000+ notes scale.
4. **Authentication Configuration**:
   - Go to **Authentication -> Providers -> Email**: Ensure Email provider is enabled. (Optional: Disable "Confirm email" if you want teammates to log in immediately without waiting for confirmation emails).
   - Go to **Authentication -> Providers -> Google**: (Optional) Add your Google Cloud Client ID & Secret to enable 1-click Google Sign-In.
5. Go to **Project Settings -> API** and copy:
   - `Project URL`
   - `anon public key`

---

## Step 2: Deploy Backend API (Render Free Tier)

1. Push your repository to GitHub.
2. Go to [render.com](https://render.com) and click **New -> Web Service**.
3. Connect your GitHub repository.
4. Set the following options:
   - **Name**: `mindshare-backend`
   - **Root Directory**: `server`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npx tsx index.ts`
   - **Instance Type**: `Free`
5. Add the **Environment Variables**:
   - `PORT`: `3001`
   - `SUPABASE_URL`: Your Supabase Project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anon key
   - `GROQ_API_KEY`: Your Groq API key (`gsk_...`)
   - `CLOUDINARY_CLOUD_NAME`: `qxjuwofk`
   - `CLOUDINARY_UPLOAD_PRESET`: `mindshare_preset`
6. Click **Deploy Web Service**.
   Your backend will be live at `https://mindshare-backend.onrender.com`.

---

## Step 3: Keep Render Warm 24/7 (UptimeRobot - Free)

Render's free tier spins down after 15 minutes of inactivity. To keep your team's workspace fast and awake 24/7:

1. Go to [uptimerobot.com](https://uptimerobot.com) and sign up for free.
2. Click **Add New Monitor**.
3. Set:
   - **Monitor Type**: `HTTP(s)`
   - **Friendly Name**: `Mindshare Backend Keepalive`
   - **URL**: `https://mindshare-backend.onrender.com/health`
   - **Monitoring Interval**: `5 minutes`
4. Click **Create Monitor**.
   *Render will now remain awake 24/7 without any cold start delays!*

---

## Step 4: Deploy Frontend Web App (Vercel)

1. Go to [vercel.com](https://vercel.com) and click **Add New -> Project**.
2. Import your GitHub repository.
3. Set **Framework Preset**: `Vite`.
4. Add the following **Environment Variables**:
   - `VITE_API_BASE_URL`: `https://mindshare-backend.onrender.com/api` (Your Render URL from Step 2 with `/api`)
   - `VITE_SUPABASE_URL`: Your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase anon key
   - `VITE_CLOUDINARY_CLOUD_NAME`: `qxjuwofk`
   - `VITE_CLOUDINARY_UPLOAD_PRESET`: `mindshare_preset`
5. Click **Deploy**.
   Vercel will build and publish your app live at `https://mindshare.vercel.app`.

---

## Step 5: Team Onboarding Flow

1. Teammates open `https://mindshare.vercel.app`.
2. Sign in using **Continue with Google** or **Create an account with work email**.
3. On first login, a prompt asks to claim their team handle: `@username` (e.g. `@alex`, `@sarah`).
4. Once claimed:
   - They appear in the **Teammates** directory.
   - Any teammate can tag them in thoughts by typing `@username`.
   - When tagged, a badge appears on their **Tagged Me** inbox tab.
   - All `#tags` remain 100% private to each user.
