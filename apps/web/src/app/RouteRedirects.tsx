import { Navigate, useLocation } from "react-router-dom";

export function RequireSignInRedirect({ redirectTo }: { redirectTo: string }) {
  return <Navigate replace to={`/signin?redirect=${encodeURIComponent(redirectTo)}`} />;
}

export function RequireCurrentLocationSignInRedirect() {
  const location = useLocation();
  return <Navigate replace to={`/signin?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`} />;
}
