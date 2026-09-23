import axios from 'axios';
import { API_BASE_URL } from './config';

export const saveSharedPlan = async (planData, currentShareId = null) => {
  const url = currentShareId ? `/api/plans/${currentShareId}` : '/api/plans';
  const method = currentShareId ? 'PUT' : 'POST';

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(planData),
  });

  if (!response.ok) {
    throw new Error('Plan save failed');
  }

  return response.json();
};

export const fetchSharedPlan = async (id) => {
  const response = await axios.get(`${API_BASE_URL}/api/plans/${encodeURIComponent(id)}`);
  return response.data;
};
