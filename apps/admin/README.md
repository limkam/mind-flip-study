# Bilkeys admin dashboard

This is a separate Vite application from the student app at the repository root.

## Deploying to Vercel

Create a separate Vercel project for the admin dashboard and configure:

- Root Directory: `apps/admin`
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment variable: `VITE_API_URL=https://api.bilkeys.io`

The local `vercel.json` rewrites browser routes such as `/users`, `/login`, and
`/admin/owner-dashboard` to `index.html`, allowing React Router to handle them.
Attach `admin.bilkeys.io` to this admin project, and include that origin in the
API's `CORS_ORIGINS` setting.

## Local development

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
