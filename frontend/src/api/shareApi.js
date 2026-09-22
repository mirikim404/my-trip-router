import axios from 'axios';
import { API_BASE_URL } from './config';

export const saveSharedPlan = async ({ profile, itinerary, routesByDay }) => {
  const response = await axios.post(`${API_BASE_URL}/api/plans`, { profile, itinerary, routesByDay });
  return response.data;
};

export const fetchSharedPlan = async (id) => {
  const response = await axios.get(`${API_BASE_URL}/api/plans/${encodeURIComponent(id)}`);
  return response.data;
};
