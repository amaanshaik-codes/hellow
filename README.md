Hellow — Frontend

Quick start
1. Install dependencies

```powershell
cd frontend
npm install
```

2. Run dev

```powershell
npm run dev
```

Environment variables
- NEXT_PUBLIC_API_URL — base URL for the backend API (e.g. https://your-backend.example)
- NEXT_PUBLIC_WS_URL — WebSocket URL (wss://your-backend.example)
- NEXT_PUBLIC_WS_ROOM — optional room name (defaults to `main`)

Prepare repo and push to GitHub

```powershell
cd frontend
git init
git add .
git commit -m "chore: initial frontend"
# create a GitHub repo and then add remote, for example:
# git remote add origin https://github.com/<your-username>/hellow-frontend.git
git branch -M main
git push -u origin main
```

Deploy to Vercel
1. Connect your GitHub repo to Vercel (Import Project → select repository).
2. Set environment variables in Vercel dashboard (see above).
3. Build & Output settings: default (Next.js auto-detected). Vercel will run `npm install` and `npm run build`.

Optional: allow me to push
If you want me to push the repo for you, paste the GitHub remote URL here and I can run the git commands in this workspace.

CI
A minimal GitHub Actions workflow is included to run build on push/PR.
