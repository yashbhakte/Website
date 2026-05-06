# Render Deployment Guide

## Issues Fixed
1. **Startup Timeout**: Model loading moved from startup to first prediction (lazy loading)
2. **SQLite Persistence**: Added PostgreSQL support for Render via environment variable
3. **Login Hanging**: Removed blocking startup operations

## Deployment Steps

### Step 1: Create PostgreSQL Database on Render

1. Go to [https://dashboard.render.com](https://dashboard.render.com)
2. Click **"New+"** → **"PostgreSQL"**
3. Enter details:
   - **Name**: `fabricguard-db`
   - **Region**: Same as your backend
   - Leave other settings as default
4. Click **Create Database**
5. Copy the **Internal Database URL** (starts with `postgresql://`)

### Step 2: Deploy Backend to Render

1. Go to [https://dashboard.render.com](https://dashboard.render.com)
2. Click **"New+"** → **"Web Service"**
3. Connect your GitHub repository
4. Fill in:
   - **Name**: `classification-local-website`
   - **Region**: Choose closest region
   - **Branch**: `main` (or your branch)
   - **Runtime**: `Python`
   - **Build Command**: `pip install -r backend/requirements.txt`
   - **Start Command**: `cd backend && uvicorn app:app --host 0.0.0.0 --port 8000`

### Step 3: Add Environment Variables

1. In Render dashboard, go to your Web Service
2. Click **"Environment"**
3. Add new environment variable:
   - **Key**: `DATABASE_URL`
   - **Value**: Paste the PostgreSQL URL from Step 1
4. Click **"Save Changes"**

The deployment will auto-trigger and restart with the new environment.

### Step 4: Verify Deployment

1. Wait ~5-10 minutes for deployment
2. Test with curl:
   ```bash
   curl https://classification-local-website.onrender.com/
   ```
   Should return: `{"status":"online","model_loaded":false}`

3. Test login:
   ```bash
   curl -X POST https://classification-local-website.onrender.com/login \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=test@example.com&password=anypassword"
   ```
   Should return access token immediately (not hang)

### Step 5: Frontend Configuration

Your frontend is already configured with the correct API URL:
```javascript
const API_BASE_URL = "https://classification-local-website.onrender.com";
```

No changes needed if this matches your Render service URL.

## Troubleshooting

### Login Still Hangs
1. Check Render logs: Dashboard → Web Service → Logs
2. Look for database connection errors
3. Verify `DATABASE_URL` environment variable is set correctly

### Model Loading Hangs on Prediction
1. First prediction will take 60+ seconds while loading the model
2. Subsequent predictions are faster
3. Check logs for model file path issues

### Database Errors
1. Verify PostgreSQL database is running (check Render dashboard)
2. Check `DATABASE_URL` format: `postgresql://user:password@host/dbname`
3. Ensure database is in same region for performance

## Local Development

To test locally before deploying:

```bash
# Remove DATABASE_URL environment variable
# App will use SQLite automatically

cd backend
pip install -r requirements.txt
python -m uvicorn app:app --reload
```

## Performance Notes

- First prediction request loads the model (60+ seconds)
- Subsequent predictions: 5-10 seconds
- Consider keeping the service warm to avoid cold starts
- On Render free tier, service spins down after 15 minutes of inactivity

## Cost Estimation

- **PostgreSQL**: $15/month (free tier available if < 1GB storage)
- **Web Service**: Free tier available (limited resources)
- Consider upgrading for production use

## Next Steps

If login still doesn't work:
1. Share Render logs from the deployment
2. Check browser's Network tab for API response
3. Verify frontend API_BASE_URL matches your Render service URL
