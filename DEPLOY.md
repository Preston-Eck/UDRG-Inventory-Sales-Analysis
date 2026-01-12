# How to Update App in Netlify

Your application is likely set up for **Continuous Deployment** connected to your Git repository.

## Automatic Update (Standard)
1.  **Commit & Push**: Any changes you push to the `main` (or `master`) branch of your Git repository will automatically trigger a new build and deployment on Netlify.
    ```bash
    git add .
    git commit -m "Description of changes"
    git push origin main
    ```
2.  **Monitor**: Go to your Netlify Dashboard -> "Deploys" tab to see the build progress.
3.  **Live**: Once the build says "Published", your live URL is updated instantaneously.

## Manual Update (If not connected to Git)
1.  Run `npm run build` locally.
2.  Go to Netlify Dashboard -> "Deploys".
3.  Drag and drop the `dist` folder onto the page area that says "Drag and drop your site folder here".

## Troubleshooting
*   **Build Failures**: Check the "Deploy Log" in Netlify. Common errors are TS validation failures or missing Environment Variables (`VITE_SUPABASE_URL`, etc.).
*   **Environment Variables**: Ensure your Supabase keys are set in Netlify -> Site Settings -> Environment Variables.
