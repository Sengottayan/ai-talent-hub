import axios from "axios";

const getBaseURL = () => {
    let url = import.meta.env.VITE_API_URL || "http://localhost:5000";
    if (!url.endsWith('/api')) {
        url = url.endsWith('/') ? `${url}api` : `${url}/api`;
    }
    return url;
};

const api = axios.create({
  baseURL: getBaseURL(),
});

api.interceptors.request.use(
  (config) => {
    const userInfo = localStorage.getItem("userInfo");
    if (userInfo) {
      try {
        const { token } = JSON.parse(userInfo);
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (e) {
        console.error("Failed to parse userInfo:", e);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

export default api;
