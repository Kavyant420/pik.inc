# PIKX

PIKX anonymous browser new-tab page.

## Publish
1. Create a new GitHub repository (do not initialise it with a README).
2. Run these commands from inside this folder:

```bash
git init
git add .
git commit -m "Publish PIKX"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

3. On GitHub: Settings -> Pages -> Source: Deploy from a branch -> Branch: `main`, folder: `/ (root)` -> Save.
4. Your site will be live at `https://<your-username>.github.io/<your-repo>/`.

Optional: to serve it from a subpath instead, put all files inside a `pikx/` folder in the repo root and open `.../pikx/index.html`.
