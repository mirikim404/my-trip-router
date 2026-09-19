import axios from 'axios';
import { API_BASE_URL } from './config';

export const searchPlaces = async (query) => {
  const response = await axios.get(`${API_BASE_URL}/api/search`, {
    params: { query }
  });
  return response.data;
};

export const fetchTransitDirections = async (places) => {
  const response = await axios.post(`${API_BASE_URL}/api/transit`, { places });
  return response.data;
};