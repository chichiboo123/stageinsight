/**
 * useKakaoMap
 * - 카카오 지도 SDK(JS API) 초기화 및 인스턴스 관리
 * - 마커 추가/제거 헬퍼 제공
 *
 * 사용법:
 *   const { mapRef, mapLoaded, addMarker } = useKakaoMap({ lat, lng, level: 5 });
 *   <div ref={mapRef} style={{ width: '100%', height: '400px' }} />
 */

import { useEffect, useRef, useState, useCallback } from 'react';

const JS_KEY = import.meta.env.VITE_KAKAO_JS_API_KEY as string;

declare global {
  interface Window {
    kakao: {
      maps: {
        load: (callback: () => void) => void;
        Map: new (container: HTMLElement, options: object) => KakaoMap;
        LatLng: new (lat: number, lng: number) => KakaoLatLng;
        Marker: new (options: { position: KakaoLatLng; map?: KakaoMap; title?: string }) => KakaoMarker;
        InfoWindow: new (options: { content: string }) => KakaoInfoWindow;
        event: {
          addListener: (target: object, type: string, handler: () => void) => void;
        };
        MarkerClusterer?: new (options: object) => object;
      };
    };
  }
}

interface KakaoMap {
  setCenter: (latlng: KakaoLatLng) => void;
  setLevel: (level: number) => void;
  getLevel: () => number;
}
interface KakaoLatLng {
  getLat: () => number;
  getLng: () => number;
}
interface KakaoMarker {
  setMap: (map: KakaoMap | null) => void;
  getPosition: () => KakaoLatLng;
}
interface KakaoInfoWindow {
  open: (map: KakaoMap, marker: KakaoMarker) => void;
  close: () => void;
}

interface UseKakaoMapOptions {
  lat: number;
  lng: number;
  level?: number;
}

interface MarkerOptions {
  lat: number;
  lng: number;
  title?: string;
  infoContent?: string;
  onClick?: () => void;
}

interface UseKakaoMapReturn {
  mapRef: React.RefObject<HTMLDivElement | null>;
  mapLoaded: boolean;
  mapInstance: KakaoMap | null;
  addMarker: (options: MarkerOptions) => KakaoMarker | null;
  clearMarkers: () => void;
  panTo: (lat: number, lng: number) => void;
}

// SDK 스크립트 한 번만 로드
let sdkLoaded = false;
let sdkCallbacks: Array<() => void> = [];

function loadKakaoSdk(callback: () => void) {
  if (sdkLoaded) { callback(); return; }
  sdkCallbacks.push(callback);
  if (document.getElementById('kakao-maps-sdk')) return;

  const script = document.createElement('script');
  script.id = 'kakao-maps-sdk';
  script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${JS_KEY}&autoload=false`;
  script.onload = () => {
    window.kakao.maps.load(() => {
      sdkLoaded = true;
      sdkCallbacks.forEach(cb => cb());
      sdkCallbacks = [];
    });
  };
  document.head.appendChild(script);
}

export function useKakaoMap({ lat, lng, level = 5 }: UseKakaoMapOptions): UseKakaoMapReturn {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapInstanceRef = useRef<KakaoMap | null>(null);
  const markersRef = useRef<KakaoMarker[]>([]);

  // 지도 초기화
  useEffect(() => {
    loadKakaoSdk(() => {
      if (!mapRef.current) return;
      const options = {
        center: new window.kakao.maps.LatLng(lat, lng),
        level,
      };
      mapInstanceRef.current = new window.kakao.maps.Map(mapRef.current, options);
      setMapLoaded(true);
    });
  }, []); // 최초 1회만

  // 중심 좌표 변경
  useEffect(() => {
    if (!mapInstanceRef.current || !mapLoaded) return;
    mapInstanceRef.current.setCenter(new window.kakao.maps.LatLng(lat, lng));
  }, [lat, lng, mapLoaded]);

  // 마커 추가
  const addMarker = useCallback((options: MarkerOptions): KakaoMarker | null => {
    if (!mapInstanceRef.current) return null;
    const position = new window.kakao.maps.LatLng(options.lat, options.lng);
    const marker = new window.kakao.maps.Marker({
      position,
      map: mapInstanceRef.current,
      title: options.title,
    });
    markersRef.current.push(marker);

    if (options.infoContent) {
      const infoWindow = new window.kakao.maps.InfoWindow({ content: options.infoContent });
      window.kakao.maps.event.addListener(marker, 'click', () => {
        infoWindow.open(mapInstanceRef.current!, marker);
        options.onClick?.();
      });
    } else if (options.onClick) {
      window.kakao.maps.event.addListener(marker, 'click', options.onClick);
    }

    return marker;
  }, []);

  // 모든 마커 제거
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
  }, []);

  // 특정 위치로 이동
  const panTo = useCallback((lat: number, lng: number) => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.setCenter(new window.kakao.maps.LatLng(lat, lng));
  }, []);

  return {
    mapRef,
    mapLoaded,
    mapInstance: mapInstanceRef.current,
    addMarker,
    clearMarkers,
    panTo,
  };
}
