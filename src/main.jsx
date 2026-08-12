import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "@/App.jsx";
import "@/index.css";

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    tracesSampleRate: 0.1,
    environment: import.meta.env.VITE_ENV ?? "development",
  });
}

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
// OAuth must be deliberately enabled after every exact app origin has been
// registered in Google Cloud. This avoids loading a known-to-fail third-party
// iframe in misconfigured environments.
const googleOAuthEnabled = Boolean(
  googleClientId
  && import.meta.env.VITE_GOOGLE_OAUTH_ENABLED === "true",
);
const app = googleOAuthEnabled ? (
  <GoogleOAuthProvider clientId={googleClientId}>
    <App />
  </GoogleOAuthProvider>
) : (
  <App />
);

ReactDOM.createRoot(document.getElementById("root")).render(app);
