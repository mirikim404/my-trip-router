import { useEffect, useRef } from 'react';

const MapViewer = ({ places, routeData }) => {
  const mapElement = useRef(null);
  const mapInstance = useRef(null);
  const polylineInstance = useRef(null);
  const markers = useRef([]);
  const infoWindow = useRef(null);
  const selectedMarker = useRef(null);

  const escapeHtml = (value = '') => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

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
    if (infoWindow.current) infoWindow.current.close();
    selectedMarker.current = null;
    markers.current.forEach(marker => marker.setMap(null));
    markers.current = [];

    if (places && places.length > 0) {
      if (!infoWindow.current) {
        infoWindow.current = new window.naver.maps.InfoWindow({
          borderWidth: 0,
          disableAnchor: true,
          backgroundColor: 'transparent',
          pixelOffset: new window.naver.maps.Point(0, -8),
        });
      }

      places.forEach((place, index) => {
        const isStart = index === 0;
        const isGoal = index === places.length - 1;
        const markerColor = isStart ? '#16a34a' : isGoal ? '#dc2626' : '#2563eb';
        const placeTitle = escapeHtml(place.title);
        const placeAddress = escapeHtml(place.address);
        const infoContent = `
          <div style="padding:10px 12px;border:1px solid #dbe3ef;border-radius:8px;background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.18);font-family:sans-serif;min-width:150px;">
            <strong style="display:block;margin-bottom:4px;color:#111827;">${index + 1}. ${placeTitle}</strong>
            <span style="color:#64748b;font-size:12px;">${placeAddress || '주소 정보 없음'}</span>
          </div>
        `;
        const marker = new window.naver.maps.Marker({
          position: new window.naver.maps.LatLng(place.lat, place.lng),
          map: mapInstance.current,
          title: place.title,
          icon: {
            content: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border:3px solid #fff;border-radius:50%;background:${markerColor};box-shadow:0 2px 6px rgba(15,23,42,.35);color:#fff;font:700 13px/1 sans-serif;">${index + 1}</div>`,
            anchor: new window.naver.maps.Point(15, 15),
          },
        });

        const showInfo = () => {
          infoWindow.current.setContent(infoContent);
          infoWindow.current.open(mapInstance.current, marker);
        };

        window.naver.maps.Event.addListener(marker, 'mouseover', () => {
          if (!selectedMarker.current) showInfo();
        });
        window.naver.maps.Event.addListener(marker, 'mouseout', () => {
          if (!selectedMarker.current) infoWindow.current.close();
        });
        window.naver.maps.Event.addListener(marker, 'click', () => {
          if (selectedMarker.current === marker) {
            selectedMarker.current = null;
            infoWindow.current.close();
            return;
          }

          selectedMarker.current = marker;
          showInfo();
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