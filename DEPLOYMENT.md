# Deployment Guide

This guide walks you through deploying the Course Graph Network with the frontend on GitHub Pages and the backend on Render.

## Architecture

- **Frontend**: Hosted on GitHub Pages (static files)
- **Backend**: Hosted on Render (Node.js/Express server)
- **Communication**: Frontend calls backend API via CORS

## Prerequisites

- GitHub account
- Render account (free tier available at https://render.com)
- Git installed locally

---

## Part 1: Deploy Backend to Render

### Step 1: Push Code to GitHub

First, initialize and push your repository:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/course-graph-network.git
git push -u origin main
```

### Step 2: Create Render Web Service

1. Go to https://render.com and sign up/log in
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure the service:
   - **Name**: `course-graph-backend` (or your choice)
   - **Environment**: `Node`
   - **Region**: Choose closest to you
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`

5. Click **"Create Web Service"**

### Step 3: Wait for Deployment

Render will automatically deploy your backend. Wait for it to show "Live" status (takes 2-5 minutes).

### Step 4: Note Your Backend URL

Once deployed, you'll see a URL like:
```
https://course-graph-backend.onrender.com
```

Copy this URL - you'll need it next!

### Step 5: Run Initial Scrape

After deployment, you need to populate the database:

1. In Render dashboard, go to your service
2. Click **"Shell"** tab (or use the web shell)
3. Run:
   ```bash
   npm run scrape
   ```
4. This will scrape the first 5 departments and create the data file

**Alternative**: Use the API endpoint:
```bash
curl -X POST https://your-app.onrender.com/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}'
```

Option 1 - Browser (Easiest):
Press F12 to open Developer Console
Go to the Console tab
Paste this (replace with your actual Render URL):
```
fetch('https://course-graph-backend.onrender.com/api/scrape', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ limit: 5 })
})
.then(r => r.json())
.then(d => console.log('Scrape started:', d))
```

### Step 6: Configure Environment Variables (Optional)

In Render dashboard → Your Service → Environment:
- Add `FRONTEND_URL` = `https://YOUR_USERNAME.github.io/course-graph-network`
- This restricts CORS to only your frontend

---

## Part 2: Deploy Frontend to GitHub Pages

### Step 1: Update Frontend Configuration

Edit `public/config.js` and replace the backend URL:

```javascript
const CONFIG = {
  API_BASE: window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : 'https://course-graph-backend.onrender.com/api'  // ← Use your Render URL
};
```

### Step 2: Commit and Push Changes

```bash
git add public/config.js
git commit -m "Update backend URL for production"
git push origin main
```

### Step 3: Enable GitHub Pages

1. Go to your GitHub repository
2. Click **Settings** → **Pages** (in the left sidebar)
3. Under **"Build and deployment"**:
   - **Source**: Deploy from a branch
   - **Branch**: Select `main`
   - **Folder**: Select `/public`
4. Click **Save**

### Step 4: Wait for Deployment

GitHub will automatically deploy. Check the Actions tab to see progress. Your site will be live at:
```
https://YOUR_USERNAME.github.io/course-graph-network/
```

**Note**: If your repo name is different, the URL will be:
```
https://YOUR_USERNAME.github.io/REPO_NAME/
```

---

## Verification

### Test Backend API

Visit in your browser:
```
https://your-backend.onrender.com/api/stats
```

You should see JSON with course statistics.

### Test Frontend

1. Visit your GitHub Pages URL
2. You should see the graph visualization
3. Try searching for a course
4. Click on nodes to see course details

### Troubleshooting

**Frontend shows "No data" or errors:**
- Check browser console (F12) for errors
- Verify the backend URL in `config.js` is correct
- Ensure backend is running (visit `/api/stats` directly)

**CORS errors:**
- Make sure backend has `cors` properly configured in `server.js`
- Check if `FRONTEND_URL` environment variable is set correctly in Render

**Backend not responding:**
- Check Render logs (Dashboard → Your Service → Logs)
- Render free tier spins down after 15 minutes of inactivity (takes ~30s to wake up)
- Make sure you ran the scraper to populate data

---

## Optional: Automatic GitHub Pages Deployment

The project includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically deploys to GitHub Pages on every push to main.

To use it:
1. Go to GitHub repo → Settings → Pages
2. Under **"Build and deployment"**, change **Source** to **"GitHub Actions"**
3. Push to main branch and the workflow will deploy automatically

---

## Updating the Application

### Update Scraped Data

Run scraper again on Render:
```bash
# Via Render shell
npm run scrape

# Or via API
curl -X POST https://your-backend.onrender.com/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"limit": null}'  # null = scrape all departments
```

### Update Frontend

1. Make changes to files in `public/`
2. Commit and push:
   ```bash
   git add .
   git commit -m "Update frontend"
   git push origin main
   ```
3. GitHub Pages will auto-deploy (takes 1-2 minutes)

### Update Backend

1. Make changes to backend files
2. Commit and push:
   ```bash
   git add .
   git commit -m "Update backend"
   git push origin main
   ```
3. Render will auto-deploy (takes 2-5 minutes)

---

## Cost

Both services are **completely free** for this use case:
- **GitHub Pages**: Free for public repositories
- **Render**: Free tier includes 750 hours/month (enough for one service running 24/7)

**Note**: Render free tier has limitations:
- Spins down after 15 minutes of inactivity
- 512 MB RAM
- Shared CPU

For production use with heavy traffic, consider upgrading to Render's paid tier ($7/month).

---

## Architecture Diagram

```
┌─────────────────────────────────────────────┐
│  User's Browser                             │
│  https://username.github.io/course-graph/   │
└─────────────────┬───────────────────────────┘
                  │
                  │ API Calls
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  Backend (Render)                           │
│  https://course-graph-backend.onrender.com  │
│                                             │
│  • Express API                              │
│  • Course Scraper                           │
│  • Graph Builder                            │
│  • Data Storage (JSON)                      │
└─────────────────────────────────────────────┘
```

---

## Next Steps

- Scrape all departments (not just first 5)
- Set up periodic scraping (cron job on Render)
- Add caching to reduce API calls
- Monitor usage in Render dashboard
- Consider upgrading to paid tier if needed
