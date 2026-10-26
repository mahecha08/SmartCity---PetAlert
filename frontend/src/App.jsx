import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Camera, MapPin, Send, CheckCircle, Search, PlusCircle, X, Info, AlertTriangle, Clock } from 'lucide-react';

const DEFAULT_CENTER = [2.4448, -76.6147];

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
  const [uploading, setUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  const [linkedReportId, setLinkedReportId] = useState('');

  // List States
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);

  useEffect(() => { fetchReports(); }, [activeTab]);

  const fetchReports = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/reports');
      if (res.ok) {
        const data = await res.json();
        setReports(data);
      }
    } catch (error) { console.error("Error fetching reports", error); }
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
    if (reportType === 'found' && !linkedReportId) return alert("Por favor selecciona el reporte de la mascota que crees haber visto.");
    if (!position) return alert("Por favor selecciona o busca una ubicación en el mapa.");
    if (!image) return alert("Por favor adjunta una foto.");

    setUploading(true);
    setSuccessMsg('');

    try {
      const compressedImage = await compressImage(image);

      if (compressedImage.length > 700000) {
        alert('La imagen comprimida supera el tamaño máximo permitido (700.000 caracteres). Por favor, seleccioná otra imagen.');
        return;
      }

      const reportData = {
        reporter_name: e.target.name.value,
        reporter_email: e.target.email.value,
        pet_type: reportType === 'lost' ? e.target.pet_type.value : 'N/A',
        description: e.target.description.value,
        location_lat: position.lat,
        location_lng: position.lng,
        image_url: compressedImage,
        report_type: reportType,
        linked_report_id: reportType === 'found' ? linkedReportId : null
      };

      const res = await fetch('http://localhost:8000/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportData)
      });

      if (res.ok) {
        const data = await res.json();
        setSuccessMsg(data.message || "Procesado con éxito.");
        e.target.reset();
        setPosition(null);
        setMapCenter(DEFAULT_CENTER);
        setSearchQuery('');
        setImage(null);
        setLinkedReportId('');
        fetchReports();
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
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">SmartCity Pets</h1>
        <p className="text-gray-400">Plataforma ciudadana de identificación de mascotas</p>
      </header>

      <div className="flex gap-4 mb-8 w-full max-w-4xl">
        <button onClick={() => setActiveTab('report')} className={`flex-1 flex items-center justify-center py-3 rounded-lg font-semibold transition-colors border ${activeTab === 'report' ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}>
          <PlusCircle className="w-5 h-5 mr-2" /> Crear Reporte
        </button>
        <button onClick={() => setActiveTab('list')} className={`flex-1 flex items-center justify-center py-3 rounded-lg font-semibold transition-colors border ${activeTab === 'list' ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}>
          <Search className="w-5 h-5 mr-2" /> Mascotas Reportadas
        </button>
      </div>

      <main className="w-full max-w-4xl bg-gray-800 rounded-2xl shadow-2xl p-6 md:p-10 border border-gray-700">
        
        {activeTab === 'report' && (
          <div className="animate-fade-in">
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
                  <div className="p-4 bg-amber-900/30 border border-amber-700 rounded-lg mb-2">
                    <label className="block text-sm font-semibold text-amber-400 mb-2">
                      <AlertTriangle className="inline w-4 h-4 mr-1 mb-1" />
                      ¿A cuál mascota se parece?
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
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{reportType === 'found' ? 'Tu Nombre (Quién la vio)' : 'Tu Nombre'}</label>
                  <input name="name" type="text" required className={`w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white outline-none transition-all focus:ring-2 ${reportType === 'found' ? 'focus:ring-amber-500' : 'focus:ring-indigo-500'}`} placeholder="Ej. Juan Pérez" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Tu Correo Electrónico</label>
                  <input name="email" type="email" required className={`w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white outline-none transition-all focus:ring-2 ${reportType === 'found' ? 'focus:ring-amber-500' : 'focus:ring-indigo-500'}`} placeholder="Para contacto" />
                </div>
                
                {reportType === 'lost' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Tipo de Mascota</label>
                    <select name="pet_type" className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none">
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
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Fotografía Reciente</label>
                  <label className={`flex items-center justify-center w-full bg-gray-900 border-2 border-dashed border-gray-600 rounded-lg p-4 cursor-pointer transition-colors group ${reportType === 'found' ? 'hover:border-amber-500' : 'hover:border-indigo-500'}`}>
                    <Camera className="w-6 h-6 text-gray-400 mr-2" />
                    <span className="text-gray-400 truncate max-w-[200px]">{image ? image.name : "Adjuntar foto"}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => setImage(e.target.files[0])} />
                  </label>
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
                <button type="submit" disabled={uploading} className={`w-full text-white font-semibold py-4 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50 shadow-lg ${reportType === 'found' ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/30' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30'}`}>
                  {uploading ? 'Procesando y Enviando...' : <><Send className="w-5 h-5 mr-2" /> Enviar Reporte</>}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'list' && (
          <div className="animate-fade-in">
            <h2 className="text-2xl font-bold mb-6 border-b border-gray-700 pb-4">Reportes de Mascotas</h2>
            {reports.length === 0 ? (
              <div className="text-center py-10 text-gray-400"><p>No hay mascotas reportadas aún.</p></div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {reports.map((report) => (
                  <div key={report.id} className={`bg-gray-900 border rounded-xl p-5 transition-colors flex flex-col justify-between ${report.status === 'En Evaluación' ? 'border-amber-900/50 hover:border-amber-500' : 'border-gray-700 hover:border-indigo-500'}`}>
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${report.status === 'En Evaluación' ? 'bg-amber-900/50 text-amber-400 border border-amber-800' : 'bg-red-900/50 text-red-400 border border-red-800'}`}>
                          {report.status}
                        </span>
                        <span className="text-gray-500 text-sm">
                          {report.pet_type === 'dog' ? 'Perro' : report.pet_type === 'cat' ? 'Gato' : 'Otro'}
                        </span>
                      </div>
                      <p className="text-gray-300 text-sm line-clamp-2 mb-4">"{report.description}"</p>
                      <p className="text-xs text-gray-500 mb-4">Dueño: {report.reporter_name}</p>
                      
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
                <span className={`px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide ${selectedReport.status === 'En Evaluación' ? 'bg-amber-900/50 text-amber-400 border border-amber-800' : 'bg-red-900/50 text-red-400 border border-red-800'}`}>
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
