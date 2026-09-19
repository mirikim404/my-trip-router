import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export const saveSharedPlan = async ({ profile, itinerary }) => {
  const response = await axios.post(`${API_BASE_URL}/api/plans`, { profile, itinerary });
  return response.data;
};

export const fetchSharedPlan = async (id) => {
  const response = await axios.get(`${API_BASE_URL}/api/plans/${id}`);
  return response.data;
};
