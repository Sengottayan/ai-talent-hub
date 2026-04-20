import { Navigate, Outlet } from "react-router-dom";

interface ProtectedRouteProps {
  allowedRole?: "candidate" | "recruiter" | "admin";
}

const ProtectedRoute = ({ allowedRole }: ProtectedRouteProps) => {
  const userInfoString = localStorage.getItem("userInfo");
  const userInfo = userInfoString ? JSON.parse(userInfoString) : null;

  // 1. Not logged in -> Go to login
  if (!userInfo || !userInfo.token) {
    return <Navigate to="/login" replace />;
  }

  // 2. Logged in but wrong role -> Go to their own dashboard
  if (allowedRole && userInfo.role !== allowedRole) {
    console.warn(`Unauthorized access attempt: User role is ${userInfo.role}, but ${allowedRole} is required.`);
    
    // Redirect to the appropriate dashboard based on their actual role
    if (userInfo.role === "candidate") {
      return <Navigate to="/candidate/dashboard" replace />;
    } else if (userInfo.role === "recruiter") {
      return <Navigate to="/hr/dashboard" replace />;
    }
    
    // Default fallback
    return <Navigate to="/" replace />;
  }

  // 3. Authorized -> Render requested page
  return <Outlet />;
};

export default ProtectedRoute;
