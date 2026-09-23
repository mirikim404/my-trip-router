import { useEffect, useRef, useState } from 'react';
import { resolveApiUrl } from '../api/config';

// 💡 focusedPlace prop 추가
const MapViewer = ({ places, focusedPlace, fitToPlaces = false }) => {
  const mapElement = useRef(null);
  const mapInstance = useRef(null);
  const markers = useRef([]);
  const infoWindow = useRef(null);
  const selectedMarker = useRef(null);
  const [isMapReady, setIsMapReady] = useState(false);

  const escapeHtml = (value) => String(value ?? '')
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

      window.naver.maps.Event.addListener(mapInstance.current, 'click', () => {
        selectedMarker.current = null;
        infoWindow.current?.close();
      });

      requestAnimationFrame(() => {
        window.naver.maps.Event.trigger(mapInstance.current, 'resize');
        setIsMapReady(true);
      });
    }
  }, []);

  useEffect(() => {
    const container = mapElement.current;
    if (!container || !window.naver?.maps) return undefined;

    const triggerResize = () => {
      if (!mapInstance.current) return;
      window.naver.maps.Event.trigger(mapInstance.current, 'resize');
    };

    const raf = requestAnimationFrame(triggerResize);
    const observer = new ResizeObserver(triggerResize);
    observer.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!mapInstance.current || !window.naver || !isMapReady) return;

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
        const placeRoadAddress = escapeHtml(place.roadAddress || place.address);
        const placeCategory = escapeHtml(place.category);
        const placeType = escapeHtml(place.placeType);
        const placeSubcategory = escapeHtml(place.subcategory);
        const placeLink = escapeHtml(place.link);
        const naverMapLink = escapeHtml(place.naverMapLink);
        const photoUrl = escapeHtml(resolveApiUrl(place.photoUrl));
        const googleMapsUri = escapeHtml(place.googleMapsUri);
        const primaryType = escapeHtml(place.primaryType);
        const averageMenuPrice = Number(place.averageMenuPrice);
        const telephone = escapeHtml(place.nationalPhoneNumber || place.telephone);
        const infoContent = `
          <div style="padding:12px 14px;border:1px solid #dbe3ef;border-radius:10px;background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.18);font-family:sans-serif;width:260px;">
            ${photoUrl ? `<img src="${photoUrl}" alt="${placeTitle}" style="display:block;width:calc(100% + 28px);height:160px;object-fit:cover;object-position:center center;margin:-12px -14px 10px;border-radius:10px 10px 0 0;">` : ''}
            <strong style="display:block;margin-bottom:5px;color:#111827;font-size:14px;">${index + 1}. ${placeTitle}</strong>
            ${primaryType || placeType ? `<span style="display:block;margin-bottom:3px;color:#2563eb;font-size:11px;">${primaryType || placeType}</span>` : ''}
            ${placeSubcategory ? `<span style="display:block;margin-bottom:7px;color:#64748b;font-size:11px;">${placeSubcategory}</span>` : placeCategory ? `<span style="display:block;margin-bottom:7px;color:#64748b;font-size:11px;">${placeCategory}</span>` : ''}
            <span style="display:block;color:#475569;font-size:12px;line-height:1.45;">${placeRoadAddress || '주소 정보 없음'}</span>
            ${telephone ? `<a href="tel:${telephone}" style="display:block;margin-top:7px;color:#334155;font-size:12px;text-decoration:none;">☎ ${telephone}</a>` : ''}
            ${Number.isFinite(averageMenuPrice) ? `<span style="display:block;margin-top:7px;color:#64748b;font-size:11px;">평균 메뉴 가격: ${averageMenuPrice.toLocaleString('ko-KR')}원</span>` : ''}
            ${naverMapLink ? `<a href="${naverMapLink}" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:8px;color:#2563eb;font-size:12px;text-decoration:none;">네이버 지도에서 보기 ↗</a>` : placeLink ? `<a href="${placeLink}" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:8px;color:#2563eb;font-size:12px;text-decoration:none;">네이버에서 자세히 보기 ↗</a>` : googleMapsUri ? `<a href="${googleMapsUri}" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:8px;color:#2563eb;font-size:12px;text-decoration:none;">Google에서 자세히 보기 ↗</a>` : ''}
          </div>
        `;
        const marker = new window.naver.maps.Marker({
          position: new window.naver.maps.LatLng(place.lat, place.lng),
          map: mapInstance.current,
          title: place.title,
          icon: {
            content: `<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border:2px solid #fff;border-radius:50%;background:${markerColor};box-shadow:0 1px 4px rgba(15,23,42,.35);color:#fff;font:700 11px/1 sans-serif;box-sizing:border-box;padding-top:1.5px;">${index + 1}</div>`,
            anchor: new window.naver.maps.Point(11, 11),
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

      if (fitToPlaces && places.length > 1) {
        const lats = places.map((place) => place.lat);
        const lngs = places.map((place) => place.lng);
        const bounds = new window.naver.maps.LatLngBounds(
          new window.naver.maps.LatLng(Math.min(...lats), Math.min(...lngs)),
          new window.naver.maps.LatLng(Math.max(...lats), Math.max(...lngs)),
        );
        mapInstance.current.fitBounds(bounds, { top: 48, right: 32, bottom: 32, left: 32 });
      } else {
        mapInstance.current.setCenter(new window.naver.maps.LatLng(places[0].lat, places[0].lng));
        if (fitToPlaces) mapInstance.current.setZoom(15);
      }
    }
  }, [places, fitToPlaces, isMapReady]);

  // 💡 추가된 부분: focusedPlace(클릭한 장소)가 변경될 때 지도를 해당 위치로 이동 및 줌인
  useEffect(() => {
    if (!mapInstance.current || !window.naver || !isMapReady || !focusedPlace) return;

    const latLng = new window.naver.maps.LatLng(focusedPlace.lat, focusedPlace.lng);
    
    // 부드럽게 위치 이동 (panTo)
    mapInstance.current.panTo(latLng);
    
    // 포커스 된 장소를 자세히 볼 수 있도록 약간 줌인 (기호에 맞게 숫자 조절 가능)
    mapInstance.current.setZoom(15, true); 
  }, [focusedPlace, isMapReady]);

  return <div ref={mapElement} style={{ width: '100%', height: '100%' }} />;
};

export default MapViewer;