import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Camera, MapPin, Send, CheckCircle, Search, PlusCircle, X, Info, AlertTriangle, Clock, LogOut, FileText, User as UserIcon, Bell, BellOff, BellRing } from 'lucide-react';
import {
  isNotificationSupported,
  obtainFcmToken,
  registerTokenWithBackend,
  unregisterTokenFromBackend,
  deleteFcmToken,
  setupForegroundNotifications
} from './services/notifications';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebaseConfig';
import { AuthCard } from './components/Auth';

const DEFAULT_CENTER = [2.4448, -76.6147];

function getStatusBadgeClass(status) {
  if (status === 'Resuelta') {
    return 'bg-emerald-900/50 text-emerald-400 border border-emerald-800';
  }
  if (status === 'En Evaluación') {
    return 'bg-amber-900/50 text-amber-400 border border-amber-800';
  }
  return 'bg-red-900/50 text-red-400 border border-red-800';
}

function NotificationBanner({ notificationState, onEnable, loading }) {
  if (notificationState === 'unsupported') {
    return (
      <div className="flex items-center text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 px-3.5 py-2 rounded-xl">
        <AlertTriangle className="w-4 h-4 mr-2 text-amber-400 shrink-0" />
        <span>Tu navegador no admite notificaciones. En iPhone, instalá la app en la pantalla de inicio.</span>
      </div>
    );
  }

  if (notificationState === 'denied') {
    return (
      <div className="flex items-center text-xs text-red-300 bg-red-950/40 border border-red-800/60 px-3.5 py-2 rounded-xl">
        <BellOff className="w-4 h-4 mr-2 text-red-400 shrink-0" />
        <span>Bloqueaste las notificaciones. Podés habilitarlas en la configuración del navegador.</span>
      </div>
    );
  }

  if (notificationState === 'granted') {
    return (
      <div className="flex items-center text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-800/60 px-3.5 py-2 rounded-xl font-medium">
        <CheckCircle className="w-4 h-4 mr-2 text-emerald-400 shrink-0" />
        <span>Notificaciones activadas</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onEnable}
      disabled={loading}
      className="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-md disabled:opacity-50"
    >
      <Bell className="w-4 h-4 mr-2" />
      {loading ? 'Activando...' : 'Activar notificaciones'}
    </button>
  );
}

function getCardBorderClass(status) {
  if (status === 'Resuelta') {
    return 'border-emerald-900/50 hover:border-emerald-500';
  }
  if (status === 'En Evaluación') {
    return 'border-amber-900/50 hover:border-amber-500';
  }
  return 'border-gray-700 hover:border-indigo-500';
}

// URL del backend. En Vercel se define con VITE_API_URL; en local apunta a localhost:8000.
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

function MapController({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 15, { animate: true });
  }, [center, map]);
  return null;
}

function LocationMarker({ position, setPosition }) {
  useMapEvents({ click(e) { if (setPosition) setPosition(e.latlng); } });
  return position === null ? null : <Marker position={position}></Marker>;
}

const compressImage = (file) => new Promise((resolve, reject) => {
  const img = new Image();
  const objectUrl = URL.createObjectURL(file);

  img.onload = () => {
    URL.revokeObjectURL(objectUrl);
    const maxDimension = 800;
    let { width, height } = img;

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('No se pudo procesar la imagen seleccionada.'));
      return;
    }
    ctx.drawImage(img, 0, 0, width, height);

    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
    resolve(compressedBase64);
  };

  img.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error('No se pudo cargar la imagen seleccionada. Por favor, intentá con otra.'));
  };

  img.src = objectUrl;
});

function App() {
  const [activeTab, setActiveTab] = useState('report'); 
  const [reportType, setReportType] = useState('lost');
  
  // Form States
  const [position, setPosition] = useState(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  const [user, setUser] = useState(null);
  const [reporterName, setReporterName] = useState('');
  const [reporterEmail, setReporterEmail] = useState('');
  const [myReports, setMyReports] = useState([]);
  const [myReportsLoading, setMyReportsLoading] = useState(false);
  const [linkedReportId, setLinkedReportId] = useState('');
  const [petType, setPetType] = useState('dog');
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [detectionNotice, setDetectionNotice] = useState('');
  const [detectionError, setDetectionError] = useState('');
  const [embedding, setEmbedding] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [noMatchesFound, setNoMatchesFound] = useState(false);
  const [notificationState, setNotificationState] = useState('default');
  const [fcmToken, setFcmToken] = useState(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [foregroundNotice, setForegroundNotice] = useState(null);

  // List States
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [listReports, setListReports] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [filterPetType, setFilterPetType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDays, setFilterDays] = useState('');
  const [nearLocation, setNearLocation] = useState(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [locating, setLocating] = useState(false);

  const totalPages = Math.max(1, Math.ceil(totalCount / 9));
  const hasActiveFilters = Boolean(filterPetType || filterStatus || filterDays || nearLocation);

  const handleClearFilters = () => {
    setFilterPetType('');
    setFilterStatus('');
    setFilterDays('');
    setNearLocation(null);
    setRadiusKm(5);
    setPage(1);
  };

  const handleNearMeClick = () => {
    if (!navigator.geolocation) {
      alert("No pudimos obtener tu ubicación.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setNearLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        });
        setRadiusKm(5);
        setPage(1);
      },
      (err) => {
        setLocating(false);
        console.error("Geolocation error:", err);
        alert("No pudimos obtener tu ubicación.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleClearNearMe = () => {
    setNearLocation(null);
    setRadiusKm(5);
    setPage(1);
  };

  const syncNotificationToken = async (currentUser) => {
    if (!currentUser) return;
    const supported = await isNotificationSupported();
    if (!supported) {
      setNotificationState('unsupported');
      return;
    }
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationState('unsupported');
      return;
    }
    if (Notification.permission === 'granted') {
      try {
        setNotifLoading(true);
        const fcm = await obtainFcmToken();
        if (fcm) {
          setFcmToken(fcm);
          const idToken = await currentUser.getIdToken();
          await registerTokenWithBackend(API_URL, fcm, idToken);
          setNotificationState('granted');
        }
      } catch (err) {
        console.error('Error sincronizando token de notificación:', err);
      } finally {
        setNotifLoading(false);
      }
    } else if (Notification.permission === 'denied') {
      setNotificationState('denied');
    } else {
      setNotificationState('default');
    }
  };

  const handleEnableNotifications = async () => {
    if (!auth.currentUser) return;
    const supported = await isNotificationSupported();
    if (!supported) {
      setNotificationState('unsupported');
      return;
    }
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationState('unsupported');
      return;
    }
    try {
      setNotifLoading(true);
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const fcm = await obtainFcmToken();
        if (fcm) {
          setFcmToken(fcm);
          const idToken = await auth.currentUser.getIdToken();
          await registerTokenWithBackend(API_URL, fcm, idToken);
          setNotificationState('granted');
        }
      } else if (permission === 'denied') {
        setNotificationState('denied');
      } else {
        setNotificationState('default');
      }
    } catch (err) {
      console.error('Error solicitando permisos de notificación:', err);
    } finally {
      setNotifLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      if (fcmToken && auth.currentUser) {
        const idToken = await auth.currentUser.getIdToken();
        await unregisterTokenFromBackend(API_URL, fcmToken, idToken);
        await deleteFcmToken();
      }
    } catch (err) {
      console.error('Error desregistrando notificaciones antes de signOut:', err);
    } finally {
      try {
        await signOut(auth);
      } catch (err) {
        console.error('Error en signOut:', err);
      }
      setFcmToken(null);
      setMyReports([]);
      setNotificationState('default');
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setReporterName(currentUser.displayName || '');
        setReporterEmail(currentUser.email || '');
        syncNotificationToken(currentUser);
      } else {
        setReporterName('');
        setReporterEmail('');
        setNotificationState('default');
        setFcmToken(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    setupForegroundNotifications((payload) => {
      const title = payload.notification?.title || payload.data?.title || 'PetAlert';
      const body = payload.notification?.body || payload.data?.body || 'Nueva actualización sobre tu reporte.';
      setForegroundNotice({ title, body });
    }).then((unsub) => {
      if (typeof unsub === 'function') unsubscribe = unsub;
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user && activeTab === 'my-reports') {
      setActiveTab('list');
    }
  }, [user, activeTab]);

  const fetchMyReports = async () => {
    if (!auth.currentUser) return;
    setMyReportsLoading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${API_URL}/api/my-reports`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.status === 401) {
        alert('Tu sesión expiró. Iniciá sesión de nuevo.');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setMyReports(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching my reports', err);
    } finally {
      setMyReportsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'my-reports' && user) {
      fetchMyReports();
    }
  }, [activeTab, user]);

  const handleMarkResolved = async (reportId) => {
    if (!window.confirm('¿Confirmás que la mascota fue encontrada?')) return;
    try {
      if (!auth.currentUser) {
        alert('Tu sesión expiró. Iniciá sesión de nuevo.');
        return;
      }
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${API_URL}/api/reports/${reportId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'Resuelta' })
      });
      if (res.status === 401) {
        alert('Tu sesión expiró. Iniciá sesión de nuevo.');
        return;
      }
      if (res.status === 403) {
        alert('Solo quien creó el reporte puede cambiar su estado.');
        return;
      }
      if (res.ok) {
        fetchMyReports();
        fetchReports();
        fetchListReports();
      } else {
        alert('Error al actualizar el estado del reporte.');
      }
    } catch (err) {
      console.error('Error al actualizar el estado:', err);
      alert('Error al comunicarse con el servidor.');
    }
  };

  useEffect(() => { fetchReports(); }, [activeTab]);

  const fetchReports = async () => {
    try {
      const res = await fetch(`${API_URL}/api/reports`);
      if (res.ok) {
        const data = await res.json();
        setReports(data);
      }
    } catch (error) { console.error("Error fetching reports", error); }
  };

  const fetchListReports = async () => {
    try {
      const params = new URLSearchParams();
      params.append('limit', '9');
      params.append('offset', String((page - 1) * 9));
      if (filterPetType) params.append('pet_type', filterPetType);
      if (filterStatus) params.append('status', filterStatus);
      if (filterDays) params.append('days', filterDays);
      if (nearLocation) {
        params.append('near_lat', String(nearLocation.lat));
        params.append('near_lng', String(nearLocation.lng));
        params.append('radius_km', String(radiusKm));
      }

      const res = await fetch(`${API_URL}/api/reports?${params.toString()}`);
      if (res.ok) {
        const countHeader = res.headers.get('X-Total-Count') || res.headers.get('x-total-count');
        if (countHeader !== null) {
          setTotalCount(parseInt(countHeader, 10) || 0);
        }
        const data = await res.json();
        setListReports(data);
      }
    } catch (error) { console.error("Error fetching list reports", error); }
  };

  useEffect(() => {
    fetchListReports();
  }, [page, filterPetType, filterStatus, filterDays, nearLocation, radiusKm]);

  const searchMatches = async (emb, pType, pos = position) => {
    if (!emb) return;
    setMatchingLoading(true);
    setNoMatchesFound(false);
    try {
      const body = {
        embedding: emb,
        pet_type: pType,
        limit: 5,
      };
      if (pos && typeof pos.lat === 'number' && typeof pos.lng === 'number') {
        body.near_lat = pos.lat;
        body.near_lng = pos.lng;
      }

      const res = await fetch(`${API_URL}/api/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setCandidates(list);
        if (list.length === 0) {
          setNoMatchesFound(true);
        }
      } else {
        setCandidates([]);
        setNoMatchesFound(true);
      }
    } catch (err) {
      console.error("Error fetching matches:", err);
      setCandidates([]);
      setNoMatchesFound(true);
    } finally {
      setMatchingLoading(false);
    }
  };

  useEffect(() => {
    if (reportType === 'found' && embedding) {
      searchMatches(embedding, petType, position);
    }
  }, [reportType, position, embedding, petType]);

  const handlePhotoSelected = async (file) => {
    if (!file) return;
    setImage(file);
    setDetectionNotice('');
    setDetectionError('');
    setEmbedding(null);
    setCandidates([]);
    setNoMatchesFound(false);
    setAnalyzingImage(true);

    try {
      const compressedBase64 = await compressImage(file);
      setImagePreview(compressedBase64);
      if (compressedBase64.length > 700000) {
        setDetectionError('La imagen comprimida supera el tamaño máximo permitido (700.000 caracteres). Por favor, seleccioná otra imagen.');
        setAnalyzingImage(false);
        return;
      }

      const { analyzePetImage } = await import('./services/petClassifier');
      const analysis = await analyzePetImage(compressedBase64);
      if (!analysis.detected) {
        setDetectionError(analysis.message);
        setAnalyzingImage(false);
        return;
      }

      setDetectionNotice(analysis.notice);
      setPetType(analysis.petType);
      setEmbedding(analysis.embedding);
    } catch (err) {
      console.error("Error al analizar la foto:", err);
      setDetectionError(err.message || 'Error al procesar la fotografía.');
    } finally {
      setAnalyzingImage(false);
    }
  };

  const handleSearchLocation = async (e) => {
    e.preventDefault();
    if (!searchQuery) return;
    setSearching(true);
    try {
      const query = encodeURIComponent(`${searchQuery}, Popayán, Colombia`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}`);
      const data = await res.json();
      if (data && data.length > 0) {
        const newPos = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        setMapCenter(newPos);
        setPosition(newPos);
      } else alert("No se encontró esa ubicación.");
    } catch (err) { alert("Error buscando la ubicación"); } 
    finally { setSearching(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!auth.currentUser) {
      alert("Iniciá sesión para reportar.");
      return;
    }
    if (reportType === 'found' && !linkedReportId) return alert("Por favor selecciona el reporte de la mascota que crees haber visto.");
    if (!position) return alert("Por favor selecciona o busca una ubicación en el mapa.");
    if (!image) return alert("Por favor adjunta una foto.");
    if (analyzingImage) return alert("Aún estamos analizando la foto. Por favor, aguardá un momento.");
    if (detectionError || !embedding) {
      return alert(detectionError || "No detectamos un perro o un gato en la foto. Probá con otra donde se vea bien la mascota.");
    }

    setUploading(true);
    setSuccessMsg('');

    try {
      const compressedImage = await compressImage(image);

      if (compressedImage.length > 700000) {
        alert('La imagen comprimida supera el tamaño máximo permitido (700.000 caracteres). Por favor, seleccioná otra imagen.');
        return;
      }

      const reportData = {
        reporter_name: reporterName || e.target.name.value,
        reporter_email: reporterEmail || e.target.email.value,
        pet_type: reportType === 'lost' ? (e.target.pet_type ? e.target.pet_type.value : petType) : 'N/A',
        description: e.target.description.value,
        location_lat: position.lat,
        location_lng: position.lng,
        image_url: compressedImage,
        report_type: reportType,
        linked_report_id: reportType === 'found' ? linkedReportId : null
      };

      if (reportType === 'lost' && embedding) {
        reportData.embedding = embedding;
      }

      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${API_URL}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(reportData)
      });

      if (res.status === 401) {
        alert("Tu sesión expiró. Iniciá sesión de nuevo.");
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setSuccessMsg(data.message || "Procesado con éxito.");
        e.target.reset();
        setPosition(null);
        setMapCenter(DEFAULT_CENTER);
        setSearchQuery('');
        setImage(null);
        setImagePreview(null);
        setLinkedReportId('');
        setPetType('dog');
        setDetectionNotice('');
        setDetectionError('');
        setEmbedding(null);
        setCandidates([]);
        setNoMatchesFound(false);
        fetchReports();
        fetchListReports();
        if (auth.currentUser) fetchMyReports();
        setTimeout(() => setSuccessMsg(''), 6000);
      } else {
        alert("Error al guardar el reporte");
      }
    } catch (error) {
      console.error(error);
      alert(error.message || "Hubo un error procesando el reporte.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center py-10 px-4 font-sans relative">
      {foregroundNotice && (
        <div className="fixed top-4 right-4 z-50 max-w-sm w-full bg-gray-900 border border-indigo-500 text-white p-4 rounded-xl shadow-2xl animate-fade-in flex items-start gap-3">
          <div className="p-2 bg-indigo-600/30 border border-indigo-500/50 rounded-lg shrink-0">
            <BellRing className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-sm text-white">{foregroundNotice.title}</h4>
            <p className="text-xs text-gray-300 mt-1 break-words">{foregroundNotice.body}</p>
          </div>
          <button
            type="button"
            onClick={() => setForegroundNotice(null)}
            className="text-gray-400 hover:text-white p-1 transition-colors"
            title="Cerrar notificación"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <header className="mb-8 text-center w-full max-w-4xl relative">
        {user && (
          <div className="flex flex-wrap items-center justify-end gap-3 mb-4">
            <NotificationBanner
              notificationState={notificationState}
              onEnable={handleEnableNotifications}
              loading={notifLoading}
            />
            <div className="flex items-center gap-3 bg-gray-800 border border-gray-700 px-4 py-2 rounded-full text-sm shadow-md">
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-xs overflow-hidden">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                ) : (
                  (user.displayName || user.email || 'U')[0].toUpperCase()
                )}
              </div>
              <span className="text-gray-300 font-medium truncate max-w-[150px] sm:max-w-[250px]">
                {user.displayName || user.email}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-gray-400 hover:text-red-400 p-1 transition-colors ml-1"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">SmartCity Pets</h1>
        <p className="text-gray-400">Plataforma ciudadana de identificación de mascotas</p>
      </header>

      <div className="flex flex-wrap sm:flex-nowrap gap-4 mb-8 w-full max-w-4xl">
        <button onClick={() => setActiveTab('report')} className={`flex-1 flex items-center justify-center py-3 rounded-lg font-semibold transition-colors border ${activeTab === 'report' ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}>
          <PlusCircle className="w-5 h-5 mr-2" /> Crear Reporte
        </button>
        <button onClick={() => setActiveTab('list')} className={`flex-1 flex items-center justify-center py-3 rounded-lg font-semibold transition-colors border ${activeTab === 'list' ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}>
          <Search className="w-5 h-5 mr-2" /> Mascotas Reportadas
        </button>
        {user && (
          <button onClick={() => setActiveTab('my-reports')} className={`flex-1 flex items-center justify-center py-3 rounded-lg font-semibold transition-colors border ${activeTab === 'my-reports' ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}>
            <FileText className="w-5 h-5 mr-2" /> Mis Reportes
          </button>
        )}
      </div>

      <main className="w-full max-w-4xl bg-gray-800 rounded-2xl shadow-2xl p-6 md:p-10 border border-gray-700">
        
        {activeTab === 'report' && (
          <div className="animate-fade-in">
            {!user ? (
              <div className="py-6">
                <AuthCard title="Iniciá sesión para reportar" />
              </div>
            ) : (
              <>
                {successMsg && (
              <div className="mb-6 bg-green-900/50 border border-green-500 text-green-200 p-4 rounded-lg flex items-center transition-all">
                <CheckCircle className="w-6 h-6 mr-3 text-green-400 flex-shrink-0" />
                <span className="font-medium">{successMsg}</span>
              </div>
            )}

            <div className="flex gap-4 mb-8">
              <button type="button" onClick={() => setReportType('lost')} className={`flex-1 py-3 rounded-lg font-medium transition-colors border ${reportType === 'lost' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'}`}>
                Perdí a mi mascota
              </button>
              <button type="button" onClick={() => setReportType('found')} className={`flex-1 py-3 rounded-lg font-medium transition-colors border ${reportType === 'found' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'}`}>
                Reportar Posible Avistamiento
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-5">
                
                {reportType === 'found' && (
                  <div className="space-y-3">
                    {matchingLoading && (
                      <div className="p-3 bg-amber-950/40 border border-amber-800/50 rounded-lg text-amber-300 text-sm flex items-center animate-pulse">
                        <span className="mr-2">⏳</span> Buscando mascotas parecidas...
                      </div>
                    )}

                    {!matchingLoading && noMatchesFound && (
                      <div className="p-3 bg-gray-900 border border-gray-700 rounded-lg text-amber-400 text-sm">
                        No encontramos mascotas perdidas parecidas
                      </div>
                    )}

                    {!matchingLoading && candidates.length > 0 && (
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-amber-400">
                          Coincidencias encontradas ({candidates.length})
                        </label>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {candidates.map((item, idx) => {
                            const cand = item.report || {};
                            const isSel = linkedReportId === cand.id;
                            return (
                              <div
                                key={cand.id || idx}
                                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                                  isSel
                                    ? 'bg-amber-950/60 border-amber-500 ring-2 ring-amber-500'
                                    : 'bg-gray-900 border-gray-700 hover:border-amber-700'
                                }`}
                              >
                                {cand.image_url && (
                                  <img
                                    src={cand.image_url}
                                    alt="Candidato"
                                    className="w-16 h-16 object-cover rounded-md border border-gray-700 flex-shrink-0 bg-gray-800"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-sm text-white truncate">
                                      {cand.pet_type === 'dog' ? 'Perro' : cand.pet_type === 'cat' ? 'Gato' : 'Mascota'}
                                    </span>
                                    <span className="text-xs font-bold text-amber-400 ml-2">
                                      {typeof item.similarity === 'number' ? `${Math.round(item.similarity)} %` : item.similarity}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-400 truncate">Dueño: {cand.reporter_name || 'Desconocido'}</p>
                                  {cand.distance_km !== undefined && cand.distance_km !== null && (
                                    <p className="text-xs text-amber-500">
                                      Distancia: {typeof cand.distance_km === 'number' ? cand.distance_km.toFixed(1) : cand.distance_km} km
                                    </p>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setLinkedReportId(cand.id)}
                                  className={`text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex-shrink-0 ${
                                    isSel
                                      ? 'bg-amber-600 text-white'
                                      : 'bg-gray-800 hover:bg-gray-700 text-amber-400 border border-gray-700'
                                  }`}
                                >
                                  {isSel ? '✓ Seleccionada' : 'Es esta mascota'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="p-4 bg-amber-900/30 border border-amber-700 rounded-lg mb-2">
                      <label className="block text-sm font-semibold text-amber-400 mb-2">
                        <AlertTriangle className="inline w-4 h-4 mr-1 mb-1" />
                        ¿A cuál mascota se parece? (Selección manual)
                      </label>
                      <select 
                        value={linkedReportId} 
                        onChange={(e) => setLinkedReportId(e.target.value)}
                        className="w-full bg-gray-900 border border-amber-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                      >
                        <option value="">Selecciona el reporte original...</option>
                        {reports.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.pet_type === 'dog' ? 'Perro' : p.pet_type === 'cat' ? 'Gato' : 'Mascota'} de {p.reporter_name} ({p.status})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{reportType === 'found' ? 'Tu Nombre (Quién la vio)' : 'Tu Nombre'}</label>
                  <input name="name" type="text" required value={reporterName} onChange={(e) => setReporterName(e.target.value)} className={`w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white outline-none transition-all focus:ring-2 ${reportType === 'found' ? 'focus:ring-amber-500' : 'focus:ring-indigo-500'}`} placeholder="Ej. Juan Pérez" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Tu Correo Electrónico</label>
                  <input name="email" type="email" required value={reporterEmail} onChange={(e) => setReporterEmail(e.target.value)} className={`w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white outline-none transition-all focus:ring-2 ${reportType === 'found' ? 'focus:ring-amber-500' : 'focus:ring-indigo-500'}`} placeholder="Para contacto" />
                </div>
                
                {reportType === 'lost' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Tipo de Mascota</label>
                    <select
                      name="pet_type"
                      value={petType}
                      onChange={(e) => setPetType(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="dog">Perro</option>
                      <option value="cat">Gato</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{reportType === 'found' ? 'Condiciones del avistamiento' : 'Descripción detallada'}</label>
                  <textarea name="description" required rows="3" className={`w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white outline-none transition-all focus:ring-2 ${reportType === 'found' ? 'focus:ring-amber-500' : 'focus:ring-indigo-500'}`} placeholder={reportType === 'found' ? 'La vi corriendo hacia el parque...' : 'Collar azul, tamaño mediano...'}></textarea>
                </div>
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-300">Fotografía Reciente</label>

                  {imagePreview && (
                    <div className="relative rounded-xl overflow-hidden border border-gray-700 bg-gray-900 mb-2">
                      <img
                        src={imagePreview}
                        alt="Vista previa"
                        className="w-full h-48 object-cover rounded-xl"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className={`flex items-center justify-center py-3 px-4 rounded-lg font-medium text-sm border cursor-pointer transition-colors ${
                      reportType === 'found'
                        ? 'bg-amber-600/20 border-amber-600 text-amber-300 hover:bg-amber-600/30'
                        : 'bg-indigo-600/20 border-indigo-600 text-indigo-300 hover:bg-indigo-600/30'
                    }`}>
                      <Camera className="w-4 h-4 mr-2" />
                      Tomar foto
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files && e.target.files[0];
                          if (file) handlePhotoSelected(file);
                        }}
                      />
                    </label>

                    <label className="flex items-center justify-center py-3 px-4 rounded-lg font-medium text-sm border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-300 cursor-pointer transition-colors">
                      <PlusCircle className="w-4 h-4 mr-2" />
                      Elegir de la galería
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files && e.target.files[0];
                          if (file) handlePhotoSelected(file);
                        }}
                      />
                    </label>
                  </div>

                  {analyzingImage && (
                    <div className="mt-2 text-sm text-amber-400 bg-amber-950/30 border border-amber-800/50 rounded-lg p-2.5 flex items-center justify-center animate-pulse">
                      <span className="mr-2">⏳</span> Analizando foto…
                    </div>
                  )}

                  {!analyzingImage && detectionNotice && (
                    <div className="mt-2 text-sm text-green-300 bg-green-950/40 border border-green-600/50 rounded-lg p-2.5 flex items-center">
                      <CheckCircle className="w-4 h-4 mr-2 text-green-400 flex-shrink-0" />
                      <span>{detectionNotice}</span>
                    </div>
                  )}

                  {!analyzingImage && detectionError && (
                    <div className="mt-2 text-sm text-red-300 bg-red-950/40 border border-red-600/50 rounded-lg p-2.5 flex items-center">
                      <AlertTriangle className="w-4 h-4 mr-2 text-red-400 flex-shrink-0" />
                      <span>{detectionError}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col h-full">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  <MapPin className="inline w-4 h-4 mr-1" />
                  Ubicación ({reportType === 'lost' ? 'Dónde se perdió' : 'Dónde la viste'})
                </label>
                <div className="flex mb-3">
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Barrio o dirección..." className={`flex-1 bg-gray-900 border border-gray-600 rounded-l-lg p-2 text-white outline-none text-sm focus:ring-2 ${reportType === 'found' ? 'focus:ring-amber-500' : 'focus:ring-indigo-500'}`} onKeyDown={(e) => e.key === 'Enter' && handleSearchLocation(e)}/>
                  <button type="button" onClick={handleSearchLocation} disabled={searching} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-r-lg border border-l-0 border-gray-600 text-sm font-semibold transition-colors disabled:opacity-50">
                    {searching ? '...' : 'Buscar'}
                  </button>
                </div>
                <div className="flex-1 min-h-[300px] rounded-lg overflow-hidden border border-gray-600 mb-5 relative z-0">
                  <MapContainer center={DEFAULT_CENTER} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
                    <MapController center={mapCenter} />
                    <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" className="dark-map-tiles" />
                    <LocationMarker position={position} setPosition={setPosition} />
                  </MapContainer>
                </div>
                <button
                  type="submit"
                  disabled={uploading || analyzingImage || Boolean(detectionError)}
                  className={`w-full text-white font-semibold py-4 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50 shadow-lg ${reportType === 'found' ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/30' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30'}`}
                >
                  {uploading ? 'Procesando y Enviando...' : analyzingImage ? 'Analizando foto…' : <><Send className="w-5 h-5 mr-2" /> Enviar Reporte</>}
                </button>
              </div>
            </form>
              </>
            )}
          </div>
        )}

        {activeTab === 'my-reports' && (
          <div className="animate-fade-in">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-gray-700 pb-4">
              <h2 className="text-2xl font-bold">Mis Reportes</h2>
              <NotificationBanner
                notificationState={notificationState}
                onEnable={handleEnableNotifications}
                loading={notifLoading}
              />
            </div>

            {myReportsLoading ? (
              <div className="text-center py-10 text-gray-400"><p className="animate-pulse">Cargando tus reportes...</p></div>
            ) : myReports.length === 0 ? (
              <div className="text-center py-10 text-gray-400"><p>No tenés reportes creados todavía.</p></div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {myReports.map((report) => (
                  <div key={report.id} className={`bg-gray-900 border rounded-xl p-5 transition-colors flex flex-col justify-between ${getCardBorderClass(report.status)}`}>
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${getStatusBadgeClass(report.status)}`}>
                          {report.status}
                        </span>
                        <span className="text-gray-500 text-sm">
                          {report.pet_type === 'dog' ? 'Perro' : report.pet_type === 'cat' ? 'Gato' : 'Otro'}
                        </span>
                      </div>
                      <p className="text-gray-300 text-sm line-clamp-2 mb-4">"{report.description}"</p>
                      
                      {report.updates && report.updates.length > 0 && (
                        <p className="text-xs text-amber-500 mb-4 flex items-center font-medium">
                          <Clock className="w-3 h-3 mr-1" /> {report.updates.length} avistamiento(s) reportado(s)
                        </p>
                      )}
                    </div>
                    <div className="space-y-2 mt-auto pt-3 border-t border-gray-800">
                      {report.status !== 'Resuelta' && (
                        <button
                          type="button"
                          onClick={() => handleMarkResolved(report.id)}
                          className="w-full flex items-center justify-center py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm font-semibold shadow-md"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" /> Marcar como encontrada
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedReport(report)}
                        className="w-full flex items-center justify-center py-2 bg-gray-800 hover:bg-gray-700 text-indigo-400 rounded-lg transition-colors text-sm font-semibold border border-gray-700 hover:border-indigo-500"
                      >
                        <Info className="w-4 h-4 mr-2" /> Ver Ficha / Histórico
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'list' && (
          <div className="animate-fade-in">
            <h2 className="text-2xl font-bold mb-6 border-b border-gray-700 pb-4">Reportes de Mascotas</h2>

            <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-gray-700/60">
              {!nearLocation ? (
                <button
                  type="button"
                  onClick={handleNearMeClick}
                  disabled={locating}
                  className="flex items-center px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/50 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  <MapPin className="w-4 h-4 mr-2 text-indigo-400" />
                  {locating ? 'Obteniendo ubicación...' : 'Cerca de mí'}
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-3 bg-indigo-950/40 border border-indigo-700/50 px-4 py-2 rounded-xl text-sm">
                  <div className="flex items-center text-indigo-300 font-medium">
                    <MapPin className="w-4 h-4 mr-1.5 text-indigo-400" />
                    Cerca de mí:
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400">Radio:</label>
                    <select
                      value={radiusKm}
                      onChange={(e) => {
                        setRadiusKm(Number(e.target.value));
                        setPage(1);
                      }}
                      className="bg-gray-900 border border-indigo-500/50 rounded-lg px-2.5 py-1 text-white text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value={1}>1 km</option>
                      <option value={5}>5 km</option>
                      <option value={10}>10 km</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearNearMe}
                    className="flex items-center text-xs text-gray-400 hover:text-red-400 transition-colors ml-2 py-1 px-2 rounded hover:bg-gray-800"
                    title="Quitar filtro de cercanía"
                  >
                    <X className="w-3.5 h-3.5 mr-1" /> Quitar cercanía
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Tipo de Mascota</label>
                <select
                  value={filterPetType}
                  onChange={(e) => { setFilterPetType(e.target.value); setPage(1); }}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2.5 text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Todos</option>
                  <option value="dog">Perro</option>
                  <option value="cat">Gato</option>
                  <option value="other">Otro</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Estado</label>
                <select
                  value={filterStatus}
                  onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2.5 text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Todos</option>
                  <option value="Perdida">Perdida</option>
                  <option value="En Evaluación">En Evaluación</option>
                  <option value="Resuelta">Resuelta</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Fecha de Reporte</label>
                <select
                  value={filterDays}
                  onChange={(e) => { setFilterDays(e.target.value); setPage(1); }}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2.5 text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Todos</option>
                  <option value="7">Últimos 7 días</option>
                  <option value="30">Últimos 30 días</option>
                </select>
              </div>
            </div>

            {listReports.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <p>
                  {hasActiveFilters
                    ? "No hay reportes que coincidan con los filtros."
                    : "No hay mascotas reportadas aún."}
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {listReports.map((report) => (
                    <div key={report.id} className={`bg-gray-900 border rounded-xl p-5 transition-colors flex flex-col justify-between ${getCardBorderClass(report.status)}`}>
                      <div>
                        <div className="flex justify-between items-start mb-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${getStatusBadgeClass(report.status)}`}>
                            {report.status}
                          </span>
                          <span className="text-gray-500 text-sm">
                            {report.pet_type === 'dog' ? 'Perro' : report.pet_type === 'cat' ? 'Gato' : 'Otro'}
                          </span>
                        </div>
                        <p className="text-gray-300 text-sm line-clamp-2 mb-4">"{report.description}"</p>
                        <p className="text-xs text-gray-500 mb-4">Dueño: {report.reporter_name}</p>

                        {report.distance_km !== undefined && report.distance_km !== null && (
                          <p className="text-xs text-indigo-400 mb-4 flex items-center font-medium">
                            <MapPin className="w-3 h-3 mr-1" /> a {Number(report.distance_km).toFixed(1)} km
                          </p>
                        )}
                        
                        {report.updates.length > 0 && (
                          <p className="text-xs text-amber-500 mb-4 flex items-center font-medium">
                            <Clock className="w-3 h-3 mr-1" /> {report.updates.length} avistamiento(s) reportado(s)
                          </p>
                        )}
                      </div>
                      <button onClick={() => setSelectedReport(report)} className="w-full mt-auto flex items-center justify-center py-2 bg-gray-800 hover:bg-gray-700 text-indigo-400 rounded-lg transition-colors text-sm font-semibold border border-gray-700 hover:border-indigo-500">
                        <Info className="w-4 h-4 mr-2" /> Ver Ficha / Histórico
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between mt-8 pt-4 border-t border-gray-700">
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                    disabled={page <= 1}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    Anterior
                  </button>
                  <span className="text-sm text-gray-400">
                    Página <span className="font-semibold text-white">{page}</span> de <span className="font-semibold text-white">{totalPages}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={page >= totalPages}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    Siguiente
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <button onClick={() => setSelectedReport(null)} className="absolute top-4 right-4 p-2 bg-gray-900 rounded-full text-gray-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
            <div className="p-8">
              
              <div className="flex items-center gap-4 mb-6">
                <h3 className="text-3xl font-bold">Ficha de la Mascota</h3>
                <span className={`px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide ${getStatusBadgeClass(selectedReport.status)}`}>
                  {selectedReport.status}
                </span>
              </div>

              {/* DATOS ORIGINALES */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div>
                  <h4 className="text-lg font-semibold text-gray-400 mb-3 border-b border-gray-700 pb-2">Reporte Original</h4>
                  <img src={selectedReport.image_url} alt="Original" className="w-full h-48 object-cover rounded-xl border border-gray-700 mb-4 bg-gray-900" />
                  <div className="space-y-3">
                    <p className="text-sm text-gray-300"><strong className="text-white">Descripción:</strong> {selectedReport.description}</p>
                    <p className="text-sm text-gray-300"><strong className="text-white">Dueño:</strong> {selectedReport.reporter_name}</p>
                    <p className="text-sm text-gray-300"><strong className="text-white">Contacto:</strong> {selectedReport.reporter_email}</p>
                  </div>
                </div>
                <div className="h-[350px] rounded-xl overflow-hidden border border-gray-700 relative z-0">
                  <MapContainer center={[selectedReport.location_lat, selectedReport.location_lng]} zoom={15} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
                    <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" className="dark-map-tiles" />
                    <Marker position={[selectedReport.location_lat, selectedReport.location_lng]} />
                    {/* Renderizar pines de avistamientos también */}
                    {selectedReport.updates.map((upd, idx) => (
                       <Marker key={idx} position={[upd.location_lat, upd.location_lng]} opacity={0.6} />
                    ))}
                  </MapContainer>
                </div>
              </div>

              {/* HISTÓRICO DE AVISTAMIENTOS */}
              {selectedReport.updates.length > 0 && (
                <div className="mt-8 border-t border-gray-700 pt-8">
                  <h4 className="text-xl font-bold text-amber-400 mb-6 flex items-center">
                    <Clock className="w-6 h-6 mr-2" /> Historial de Avistamientos
                  </h4>
                  <div className="space-y-6">
                    {selectedReport.updates.map((update, idx) => (
                      <div key={idx} className="bg-gray-900 border border-amber-900/30 p-5 rounded-xl flex flex-col md:flex-row gap-6 items-start">
                        <img src={update.image_url} alt="Avistamiento" className="w-full md:w-48 h-32 object-cover rounded-lg border border-gray-700" />
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 mb-2">{update.timestamp}</p>
                          <p className="text-sm text-gray-200 mb-3">"{update.description}"</p>
                          <p className="text-sm text-gray-400"><strong className="text-white">Visto por:</strong> {update.reporter_name} (<a href={`mailto:${update.reporter_email}`} className="text-indigo-400 hover:underline">{update.reporter_email}</a>)</p>
                          <a href={`https://www.google.com/maps?q=${update.location_lat},${update.location_lng}`} target="_blank" rel="noreferrer" className="inline-block mt-3 text-xs text-amber-400 hover:text-amber-300 font-semibold border border-amber-900/50 bg-amber-900/20 px-3 py-1.5 rounded-lg">
                            📍 Ver ubicación exacta en Google Maps
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
