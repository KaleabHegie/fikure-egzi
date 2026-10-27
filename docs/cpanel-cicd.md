# cPanel continuous deployment

This repository deploys on every push to `main` through the GitHub Actions workflow in
`.github/workflows/deploy-cpanel.yml`.

## One-time cPanel setup

1. Create a MySQL database and database user in cPanel.
2. Create a subdomain for the API, for example `api.fikureegzi4.com`, and point it at a
   cPanel **Node.js Application**. Use Node 22, set the application root to
   `/home/<cpanel-user>/fikure-api`, startup file `app.cjs`, and application URL to the API
   subdomain.
3. On the server, create `/home/<cpanel-user>/fikure-api/.env`. It must contain production
   values from `backend/.env.example`, including a strong `JWT_ACCESS_SECRET`, the cPanel MySQL
   `DATABASE_URL`, `CORS_ORIGINS=https://fikureegzi4.com`, and a permanent `UPLOAD_DIR` such as
   `/home/<cpanel-user>/fikure-api/uploads`.
4. In cPanel, enable SSH access and add an SSH public key. Keep the matching private key for GitHub.
5. Set the main website document root to the folder you will use as `CPANEL_WEB_ROOT` (usually
   `/home/<cpanel-user>/public_html`).

## GitHub Actions secrets

In GitHub: **Repository → Settings → Secrets and variables → Actions**, add these repository secrets:

| Secret | Example / purpose |
| --- | --- |
| `CPANEL_SSH_HOST` | `fikureegzi4.com` |
| `CPANEL_SSH_PORT` | `22` (use the port provided by your host) |
| `CPANEL_SSH_USER` | Your cPanel username |
| `CPANEL_SSH_PRIVATE_KEY` | The complete private SSH key that matches the cPanel public key |
| `CPANEL_API_ROOT` | `/home/<cpanel-user>/fikure-api` |
| `CPANEL_WEB_ROOT` | `/home/<cpanel-user>/public_html` |
| `PRODUCTION_API_URL` | `https://api.fikureegzi4.com/api/v1` |

Never put passwords, database values, or the API `.env` file in GitHub or the repository. The workflow
deliberately preserves the server-side `.env` and `uploads` folder.

## First deployment

1. Commit and push this workflow to the repository default branch named `main`.
2. Open **Actions → Deploy to cPanel → Run workflow**, or push another commit to `main`.
3. Once it finishes, in cPanel open the Node.js Application page and click **Restart** if Passenger
   does not restart automatically.

The first deployment installs production dependencies, applies Prisma migrations, publishes the React
site, and restarts the API. Subsequent pushes repeat this automatically.
