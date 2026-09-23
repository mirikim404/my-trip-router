import { useEffect, useRef, useState } from 'react';
import { resolveApiUrl } from '../api/config';

const MapViewer = ({ places, routeData, fitToPlaces = false }) => {
  const mapElement = useRef(null);
  const mapInstance = useRef(null);
  const polylineInstances = useRef([]);
  const markers = useRef([]);
  const infoWindow = useRef(null);
  const selectedMarker = useRef(null);
  // 지도 인스턴스가 막 생성된 직후엔 내부 좌표 투영이 아직 자리를 잡지
  // 않은 상태라, 그 타이밍에 바로 마커/경로를 그리면 좌표가 어긋나 화면에
  // 나타나지 않을 수 있다. 메인 화면은 지도가 미리 떠 있는 상태로 오래
  // 유지되다가 나중에 경로가 채워지니 우연히 안전했지만, 공유 페이지는
  // fetch가 끝난 뒤 지도 생성과 경로 표시가 같은 렌더 사이클에 몰려 있어서
  // 이 타이밍 문제가 그대로 드러난다. 한 프레임을 기다린 뒤에야 그리기
  // 시작하도록 별도 플래그로 명시적으로 막는다.
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

  // Keep the map's internal size in sync with its container.
  // On mobile the map-pane's actual pixel size can change after the map is
  // first created (address bar show/hide, bottom sheet drag, orientation
  // change). Without telling Naver Maps to resize, it keeps using its old
  // size internally — markers still look roughly right, but routes drawn
  // with Polyline are positioned against the stale projection and don't
  // show up at all.
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

    polylineInstances.current.forEach(polyline => polyline.setMap(null));
    polylineInstances.current = [];
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
            content: `<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border:2px solid #fff;border-radius:50%;background:${markerColor};box-shadow:0 1px 4px rgba(15,23,42,.35);color:#fff;font:700 11px/1 sans-serif;">${index + 1}</div>`,
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

      const routePoints = routeData?.provider === 'google-transit'
        ? routeData.legs.flatMap(leg => leg.paths || []).flat()
        : [];

      if (fitToPlaces && (places.length > 1 || routePoints.length > 0)) {
        const lats = [...places.map((place) => place.lat), ...routePoints.map((point) => point.lat)];
        const lngs = [...places.map((place) => place.lng), ...routePoints.map((point) => point.lng)];
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

    if (routeData?.provider === 'google-transit') {
      // 지도가 처음 생성된 직후처럼 컨테이너가 아직 최종 크기를 반영하지
      // 못한 상태에서 Polyline을 그리면, 마커는 보여도 선의 좌표 투영이
      // 어긋나 화면에 나타나지 않는 경우가 있다. 그려주기 직전에 한 번
      // 리사이즈를 강제로 알려서 최신 컨테이너 크기로 다시 계산하게 한다.
      window.naver.maps.Event.trigger(mapInstance.current, 'resize');

      routeData.legs.forEach(leg => {
        // 길찾기 결과가 없어 직선으로 대체한 구간(mode: 'STRAIGHT')은 점선으로 구분한다.
        const isStraight = leg.mode === 'STRAIGHT';
        (leg.paths || []).forEach(path => {
          const polyline = new window.naver.maps.Polyline({
            path: path.map(point => new window.naver.maps.LatLng(point.lat, point.lng)),
            strokeColor: isStraight ? '#6b7280' : '#2563eb',
            strokeStyle: isStraight ? 'shortdash' : 'solid',
            strokeOpacity: 0.8,
            strokeWeight: isStraight ? 4 : 5,
            map: mapInstance.current,
          });
          polylineInstances.current.push(polyline);
        });
      });
    }
  }, [places, routeData, fitToPlaces, isMapReady]);

  return <div ref={mapElement} style={{ width: '100%', height: '100%' }} />;
};

export default MapViewer;
