# Deploy

Planroom deploys to Vercel from GitHub Actions. The workflow is `.github/workflows/ci.yml`. A push to `main` runs `check` first: lint, typecheck, unit tests. When `check` passes, `deploy` builds with `vercel build --prod` and ships with `vercel deploy --prebuilt --prod`. A push to any other branch runs `check` and deploys nothing. The workflow does not use pull requests.

Two groups of secrets. Three belong in GitHub. The app's own belong in Vercel.

## GitHub secrets

The `deploy` job reads `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` from repository secrets. The GitHub side needs nothing else.

Where: open the repository on github.com, then Settings > Secrets and variables > Actions > Secrets > New repository secret. Names are case sensitive. Add one entry per row below.

- `VERCEL_TOKEN` is a Vercel access token.
- `VERCEL_ORG_ID` is the `orgId` from `.vercel/project.json`.
- `VERCEL_PROJECT_ID` is the `projectId` from `.vercel/project.json`.

How to get the values:

1. Open vercel.com/account/tokens and create a token. Name it `github-actions`. Copy it at once. Vercel shows it once.
2. In the repository root, run `npx vercel link`. Link to an existing Vercel project or create one. Vercel writes `.vercel/project.json`:

```text
{
  "orgId": "team_xxxxxxxxxxxxxxxx",
  "projectId": "prj_xxxxxxxxxxxxxxxx"
}
```

3. `orgId` is `VERCEL_ORG_ID`. `projectId` is `VERCEL_PROJECT_ID`. The `.vercel` directory is local only. Do not commit it.

With the GitHub CLI, run each command and paste the value when asked:

```text
gh secret set VERCEL_TOKEN
gh secret set VERCEL_ORG_ID
gh secret set VERCEL_PROJECT_ID
```

## Vercel environment variables

Where: open the project on vercel.com, then Settings > Environment Variables. Scope every entry to Production. These are the nine names in `.env.example`.

| Name | Value |
| --- | --- |
| `APP_ENV` | `production` |
| `MONGODB_URI` | the MongoDB Atlas connection string |
| `AUTH_SECRET` | any non-blank random string |
| `AI_API_KEY` | the provider key |
| `AI_BASE_URL` | the provider base URL |
| `AI_MODEL` | optional. Falls back to `gemini-2.0-flash` |
| `AI_PROVIDER` | optional. Falls back to `gemini` |
| `AI_STRUCTURED_OUTPUTS` | optional |
| `DEMO_PASSWORD` | optional. Defaults to `planroom` |

`config/production.json` supplies the AI defaults when the variables are absent. `AI_API_KEY` and `AI_BASE_URL` are never written into JSON.

The `deploy` job runs `vercel pull --environment=production` before it builds. That step writes the variables into the build. A new value takes effect on the next deploy.

## After the secrets are in

Push to `main`. The workflow runs `check`, then `deploy`. Vercel prints the production URL in the Deploy step. A job that fails `check` deploys nothing.
