import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export const searchPlaces = async (query) => {
  const response = await axios.get(`${API_BASE_URL}/api/search`, {
    params: { query }
  });
  return response.data;
};

export const fetchDirections = async (start, goal, waypoints) => {
  const response = await axios.post(`${API_BASE_URL}/api/directions`, {
    start,
    goal,
    waypoints
  });
  return response.data;
};