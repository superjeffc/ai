# Kite - Cloudflare Worker Assistant

This repository contains the codebase and configuration for your Cloudflare Worker, **ai**. It is structured for local development and automated deployment via GitHub Actions.

---

## 🚀 Getting Started

### 1. Initialize Local Repository
The repository is set up locally in the `ai-worker` folder. First, install the dependencies:

```bash
cd ai-worker
npm install
```

### 2. Connect to GitHub
To push this code to a new GitHub repository, run the following commands:

```bash
# Initialize git and make the first commit if not done
git init
git add .
git commit -m "initial: migrate worker code and config"

# Rename branch to main
git branch -M main

# Add your GitHub repository as remote (replace with your actual GitHub URL)
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO_NAME.git

# Push your code
git push -u origin main
```

---

## 🔒 Configuration & Secrets

### Local Development Secrets
The secrets from your `variables.txt` have been placed in `.dev.vars` for local development. Wrangler automatically reads `.dev.vars` when running `npm run dev`. **Never commit `.dev.vars` to Git.**

### Cloudflare Worker Secrets
Secrets are not written to `wrangler.jsonc` for security. You must add the secrets to your Cloudflare Worker production environment. You can set them using the Wrangler CLI or the Cloudflare Dashboard:

#### Option A: Using Wrangler CLI
Run this command in your terminal:
```bash
npx wrangler secret put TAVILY_API_KEY
# Enter your Tavily API Key when prompted
```

#### Option B: Cloudflare Dashboard
1. Go to **Cloudflare Dashboard** > **Workers & Pages** > **ai** > **Settings** > **Variables**.
2. Under **Environment Variables**, click **Add Variable**.
3. Add `TAVILY_API_KEY` as type **Secret**.
4. Click **Save and Deploy**.

---

## 🤖 Continuous Deployment with GitHub Actions

A GitHub Actions workflow is preconfigured in `.github/workflows/deploy.yml` to deploy your Worker automatically on every push to the `main` branch.

To enable this, you need to add your Cloudflare credentials as Secrets in your GitHub repository:

### 1. Create a Cloudflare API Token
1. Go to the [Cloudflare Profile page](https://dash.cloudflare.com/profile/api-tokens).
2. Click **Create Token**.
3. Choose the **Edit Cloudflare Workers** template.
4. Keep the default permissions and select your account/zones.
5. Copy the generated API token.

### 2. Locate your Cloudflare Account ID
1. Go to the Cloudflare Dashboard home page.
2. Select your account/website.
3. Your **Account ID** is visible on the right-hand sidebar.

### 3. Add Secrets to GitHub
1. Go to your GitHub Repository > **Settings** > **Secrets and variables** > **Actions**.
2. Click **New repository secret**.
3. Add **`CLOUDFLARE_API_TOKEN`** with your API token as the value.
4. Add **`CLOUDFLARE_ACCOUNT_ID`** with your Account ID as the value.

Once these secrets are set, any push or merge to the `main` branch will trigger GitHub Actions to build and deploy your Worker automatically.

---

## 🛠️ Local Development Commands

### Run Locally
Start the local development server:
```bash
npm run dev
```

### Deploy Manually
If you want to manually deploy from your machine at any time:
```bash
npm run deploy
```
