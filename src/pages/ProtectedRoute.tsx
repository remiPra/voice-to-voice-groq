import { Navigate, Outlet } from "react-router-dom";

const ProtectedRoute = () => {
  const isAuthenticated = localStorage.getItem("isAuthenticated") === "true";

  if (!isAuthenticated) {
    // Redirection vers la page de connexion si non authentifié
    return <Navigate to="/login" replace />;
  }

  // Affiche les enfants/routes imbriquées si authentifié
  return <Outlet />;
};

export default ProtectedRoute;
