import { useEffect, useRef } from 'react';

const MapViewer = ({ places, routeData }) => {
  const mapElement = useRef(null);
  const mapInstance = useRef(null);
  const polylineInstance = useRef(null);
  const markers = useRef([]);

  useEffect(() => {
    if (!window.naver || !window.naver.maps) {
      console.error('네이버 지도 API 스크립트가 로드되지 않았습니다.');
      return;
    }

    if (!mapInstance.current) {
      mapInstance.current = new window.naver.maps.Map(mapElement.current, {
        center: new window.naver.maps.LatLng(37.5666805, 126.9784147),
        zoom: 13,
      });
    }
  }, []);

  useEffect(() => {
    if (!mapInstance.current || !window.naver) return;

    if (polylineInstance.current) polylineInstance.current.setMap(null);
    markers.current.forEach(marker => marker.setMap(null));
    markers.current = [];

    if (places && places.length > 0) {
      places.forEach((place) => {
        const marker = new window.naver.maps.Marker({
          position: new window.naver.maps.LatLng(place.lat, place.lng),
          map: mapInstance.current,
          title: place.title,
        });
        markers.current.push(marker);
      });

      mapInstance.current.setCenter(new window.naver.maps.LatLng(places[0].lat, places[0].lng));
    }

    if (routeData && routeData.route && routeData.route.traoptimal) {
      const pathArr = routeData.route.traoptimal[0].path;
      const polylinePath = pathArr.map(coord => new window.naver.maps.LatLng(coord[1], coord[0]));

      polylineInstance.current = new window.naver.maps.Polyline({
        path: polylinePath,
        strokeColor: '#007bff',
        strokeOpacity: 0.8,
        strokeWeight: 6,
        map: mapInstance.current,
      });
    }
  }, [places, routeData]);

  return <div ref={mapElement} style={{ width: '100%', height: '100%' }} />;
};

export default MapViewer;