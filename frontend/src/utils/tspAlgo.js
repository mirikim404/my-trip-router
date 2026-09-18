function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** @param {Array} places 장소 목록 */
export function optimizeRouteNearestNeighbor(places) {
  if (!places || places.length <= 2) {
    return places;
  }

  const unvisited = [...places];
  const optimizedRoute = [];

  let currentPlace = unvisited.shift();
  optimizedRoute.push(currentPlace);

  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const distance = getDistance(
        currentPlace.lat, currentPlace.lng,
        unvisited[i].lat, unvisited[i].lng
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = i;
      }
    }

    currentPlace = unvisited.splice(nearestIndex, 1)[0];
    optimizedRoute.push(currentPlace);
  }

  return optimizedRoute;
}