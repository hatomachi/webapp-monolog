import { LocationInfo, LocationStatus } from '../types';

type LocationListener = (status: LocationStatus) => void;

export class LocationService {
  private static cachedLocation: LocationInfo | null = null;
  private static status: LocationStatus = { state: 'idle' };
  private static listeners: Set<LocationListener> = new Set();
  private static watchId: number | null = null;
  private static isPrefetching = false;

  /**
   * リスナー登録
   */
  static subscribe(listener: LocationListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private static notify(status: LocationStatus): void {
    this.status = status;
    this.listeners.forEach((l) => l(status));
  }

  /**
   * アプリ起動時にバックグラウンドでGPSの事前測位を開始
   */
  static startPrefetch(): void {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      this.notify({ state: 'error', errorMessage: 'Geolocation is not supported' });
      return;
    }

    if (this.isPrefetching) return;
    this.isPrefetching = true;

    this.notify({ state: 'locating', currentLocation: this.cachedLocation || undefined });

    // 高速応答のため、まずキャッシュ許容の即時取得を試みる
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.handlePositionSuccess(position);
      },
      (error) => {
        console.warn('Initial geolocation warning:', error.message);
        if (error.code === error.PERMISSION_DENIED) {
          this.notify({ state: 'denied', errorMessage: '位置情報の利用が許可されていません' });
        } else {
          this.notify({ state: 'error', errorMessage: error.message });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000, // 1分以内の測位キャッシュなら即座に使用
      }
    );

    // 継続的に位置を更新（移動時の現在地追従）
    if (this.watchId === null) {
      try {
        this.watchId = navigator.geolocation.watchPosition(
          (pos) => this.handlePositionSuccess(pos),
          (err) => console.warn('watchPosition error:', err.message),
          {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 30000,
          }
        );
      } catch (e) {
        console.warn('Failed to watch position', e);
      }
    }
  }

  private static async handlePositionSuccess(position: GeolocationPosition) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const accuracy = Math.round(position.coords.accuracy);

    // 直前のキャッシュとほぼ同じ（10m以内）かつ地名取得済みなら再取得をスキップ
    if (
      this.cachedLocation &&
      this.cachedLocation.address &&
      Math.abs(this.cachedLocation.latitude - lat) < 0.0002 &&
      Math.abs(this.cachedLocation.longitude - lng) < 0.0002
    ) {
      this.notify({
        state: 'ready',
        currentLocation: this.cachedLocation,
      });
      return;
    }

    const loc: LocationInfo = {
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
      accuracy,
      timestamp: position.timestamp,
    };

    this.cachedLocation = loc;
    this.notify({
      state: 'ready',
      currentLocation: loc,
    });

    // バックグラウンドで逆ジオコーディング（地名解決）
    this.reverseGeocode(loc.latitude, loc.longitude).then((address) => {
      if (address && this.cachedLocation) {
        this.cachedLocation = { ...this.cachedLocation, address };
        this.notify({
          state: 'ready',
          currentLocation: this.cachedLocation,
        });
      }
    });
  }

  /**
   * 現在取得済みの最新位置情報を同期的に即座に取得（待ち時間 0ms）
   */
  static getLatestLocation(): LocationInfo | null {
    return this.cachedLocation;
  }

  /**
   * 逆ジオコーディング（OpenStreetMap Nominatim）
   */
  private static async reverseGeocode(lat: number, lng: number): Promise<string | undefined> {
    try {
      // 短時間キャッシュキー
      const cacheKey = `geo_${lat.toFixed(3)}_${lng.toFixed(3)}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) return cached;

      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ja`;
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      });
      if (!res.ok) return undefined;
      const data = await res.json();
      
      const addr = data.address;
      if (!addr) return undefined;

      // 日本の住所表記に最適化（例: "東京都渋谷区道玄坂" や "大阪市北区梅田"）
      const parts: string[] = [];
      if (addr.province || addr.state) parts.push(addr.province || addr.state);
      if (addr.city && addr.city !== addr.province) parts.push(addr.city);
      if (addr.suburb && !parts.includes(addr.suburb)) parts.push(addr.suburb);
      if (addr.quarter && !parts.includes(addr.quarter)) parts.push(addr.quarter);
      if (addr.neighbourhood && !parts.includes(addr.neighbourhood)) parts.push(addr.neighbourhood);
      if (addr.road && !parts.includes(addr.road)) parts.push(addr.road);

      const formatted = parts.join('') || data.name || undefined;
      if (formatted) {
        try {
          sessionStorage.setItem(cacheKey, formatted);
        } catch (_) {}
      }
      return formatted;
    } catch (e) {
      console.warn('Reverse geocoding failed:', e);
      return undefined;
    }
  }

  /**
   * 監視停止
   */
  static stop(): void {
    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.isPrefetching = false;
  }
}
