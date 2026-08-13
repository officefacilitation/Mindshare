# 🚀 Mindshare Full-Stack Deployment Guide

This guide explains step-by-step how to deploy **Mindshare** as a fully decoupled application:
1. **Database Layer**: Supabase (Free Tier Managed PostgreSQL)
2. **Backend REST API Server**: Render / Railway (Node.js + Express)
3. **Frontend Web App**: Vercel / Netlify (React + Vite + Tailwind)
4. **AI Auto-Tagging Engine**: Groq Cloud API (Mixtral-8x7b)

---

## 🏗️ Architecture Overview

```
 ┌────────────────────────┐         ┌────────────────────────┐
 │   Vercel / Netlify     │         │    Render / Railway    │
 │                        │  HTTP   │                        │
 │   Frontend (React/Vite)│ ──────> │  Backend REST API      │
 │   https://mindshare.app│         │  (Node.js / Express)   │
 └────────────────────────┘         └───────────┬────────────┘
                                                │
                                    ┌───────────┴────────────┐
                                    │                        │
                                    ▼                        ▼
                         ┌────────────────────┐   ┌────────────────────┐
                         │      Supabase      │   │    Groq Cloud AI   │
                         │ PostgreSQL Database│   │   Mixtral 8x7b     │
                         └────────────────────┘   └────────────────────┘
```

---

## Step 1: Deploy Database (Supabase)

1. Go to [supabase.com](https://supabase.com) and create a free project named `mindshare`.
2. Open the **SQL Editor** in Supabase dashboard.
3. Open `database/schema.sql` from this repository, copy the entire script, and click **Run**.
4. Go to **Project Settings $\rightarrow$ API** and copy:
   - `Project URL`
   - `anon public key`

---

## Step 2: Deploy Backend REST API Server (Render or Railway)

### Option A: Render (Free Tier)
1. Push your repository to GitHub.
2. Go to [render.com](https://render.com) and create a **New Web Service**.
3. Connect your GitHub repository.
4. Set **Root Directory**: `server`
5. Set **Build Command**: `npm install`
6. Set **Start Command**: `npx tsx index.ts`
7. Add Environment Variables:
   - `PORT`: `3001`
   - `GROQ_API_KEY`: `gsk_your_groq_api_key`
   - `DATABASE_URL`: Your Supabase connection string
8. Click **Create Web Service**. Your backend API will be live at `https://mindshare-backend.onrender.com`.

---

## Step 3: Deploy Frontend Web App (Vercel)

1. Go to [vercel.com](https://vercel.com) and import your GitHub repository.
2. Set **Framework Preset**: `Vite`
3. Add Environment Variables:
   - `VITE_API_BASE_URL`: `https://mindshare-backend.onrender.com` (Your backend URL from Step 2)
   - `VITE_SUPABASE_URL`: `https://your-project.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `your-anon-key`
   - `VITE_GROQ_API_KEY`: `gsk_your_groq_key`
4. Click **Deploy**. Vercel will build and publish your frontend live at `https://mindshare.vercel.app`.

---

## Step 4: Verify Full-Stack Deployment

1. Open your Vercel URL `https://mindshare.vercel.app`.
2. Capture a new thought with `#tags` and `@people`.
3. Verify that the frontend makes REST API calls to your Render backend and saves to your Supabase PostgreSQL database.
