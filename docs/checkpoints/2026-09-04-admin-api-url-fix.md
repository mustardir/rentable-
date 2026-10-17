# Checkpoint — Admin API fallback fix

The admin wallet data layer previously fell back to `http://localhost:3001` when `API_URL` and `NEXT_PUBLIC_API_URL` were unset. The Fortress API listens on port 4000, so the fallback could not reach the API during local development.

The fallback is now `http://localhost:4000`.

Production deployments should continue to set `API_URL` explicitly (for example, `http://api:4000` inside Docker Compose).
