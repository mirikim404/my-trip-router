import { useEffect, useRef, useState } from 'react';
import { resolveApiUrl } from '../api/config';

// 💡 sheetHeight prop 추가
const MapViewer = ({ places, focusedPlace, fitToPlaces = false, sheetHeight = 0 }) => {
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

  // 💡 포커싱 보정 로직 적용
  useEffect(() => {
    if (!mapInstance.current || !window.naver || !isMapReady || !focusedPlace) return;

    const targetLatLng = new window.naver.maps.LatLng(focusedPlace.lat, focusedPlace.lng);
    
    // 1. 줌 레벨을 먼저 맞춥니다.
    mapInstance.current.setZoom(15, true);

    // 2. 현재 시트 높이를 가져옵니다. (없으면 화면 절반으로 간주)
    const currentSheetHeight = sheetHeight || (window.innerHeight / 2);

    // 3. 줌이 적용될 수 있도록 아주 짧은 딜레이 후 중심점 보정 이동 실행
    setTimeout(() => {
      if (!mapInstance.current) return;
      
      const proj = mapInstance.current.getProjection();
      
      // 타겟 마커의 화면상 현재 픽셀 위치를 계산합니다.
      const targetOffset = proj.fromCoordToOffset(targetLatLng);
      
      // 마커를 바텀시트 밖(화면 위쪽)으로 밀어 올리기 위해,
      // 새롭게 중심이 될 지점을 마커보다 더 남쪽(y값 증가 방향)으로 내립니다.
      // 바텀시트가 가리는 높이의 절반 + 상단 여백(20px)만큼 내립니다.
      targetOffset.y += (currentSheetHeight / 2) + 20;

      // 계산된 새로운 픽셀 좌표를 다시 실제 위경도로 변환합니다.
      const adjustedCenter = proj.fromOffsetToCoord(targetOffset);
      
      // 보정된 중심으로 부드럽게 지도를 이동합니다.
      mapInstance.current.panTo(adjustedCenter);
    }, 100);

  }, [focusedPlace, isMapReady]); 
  // 💡 주의: sheetHeight는 deps에 넣지 않습니다. 
  // 바텀시트를 위아래로 '드래그할 때'마다 지도가 떨리면서 따라다니는 현상을 막고, 
  // 목록을 '클릭한 시점'의 높이만을 기준으로 1회 계산하기 위함입니다.

  return <div ref={mapElement} style={{ width: '100%', height: '100%' }} />;
};

export default MapViewer;