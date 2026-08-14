export type GeoPosition = { lat: number; lng: number; accuracy: number };

// 컴포넌트는 이 인터페이스만 알아야 한다. 나중에 Capacitor(@capacitor/geolocation) 또는
// React Native로 전환할 때 이 인터페이스를 구현하는 provider만 새로 만들어 교체하면 된다.
export interface GeoProvider {
  getCurrentPosition(): Promise<GeoPosition>;
  watchPosition(cb: (pos: GeoPosition) => void): () => void;
}

function toGeoPosition(pos: GeolocationPosition): GeoPosition {
  return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
}

// navigator.geolocation을 감싼 웹 구현체. 지금은 이것만 있고, 앱 전환 시 같은 인터페이스의
// capacitorGeoProvider 등을 추가해 교체한다.
export const webGeoProvider: GeoProvider = {
  getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("이 브라우저는 위치 정보를 지원하지 않습니다."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(toGeoPosition(pos)),
        (err) => reject(new Error(err.message || "위치 정보를 가져올 수 없습니다.")),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
  },

  watchPosition(cb) {
    if (!navigator.geolocation) return () => {};
    const watchId = navigator.geolocation.watchPosition(
      (pos) => cb(toGeoPosition(pos)),
      () => {},
      { enableHighAccuracy: true, maximumAge: 0 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  },
};
