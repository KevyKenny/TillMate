import { Routes, Route, Navigate } from 'react-router-dom';
import { getToken } from './api';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';

function PrivateRoute({ children }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <DashboardPage />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
