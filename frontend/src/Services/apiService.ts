import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export const authAPI = {
  register: async (data: RegisterData) => {
    console.log("called");
    const response = await api.post('/auth/register', data);
    return response.data;
  },

  login: async (data: LoginData) => {
    const response = await api.post('/auth/login', data);
    return response.data;
  },

  getMe: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
};

export const meetingAPI = {
  createMeeting: async (title: string) => {
    const response = await api.post('/meetings', { title });
    return response.data;
  },

  getMeeting: async (meetingId: string) => {
    const response = await api.get(`/meetings/${meetingId}`);
    return response.data;
  },

  getMyMeetings: async () => {
    const response = await api.get('/meetings/my');
    return response.data;
  },
};

export default api;