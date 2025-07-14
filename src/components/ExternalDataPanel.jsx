import { useState, useEffect } from 'react';
import { Car, Users, Cloud, RefreshCw, AlertCircle, WifiOff } from 'lucide-react';


const Card = ({ children, className = "", gradient = false }) => (
  <div className={`
    bg-white dark:bg-gray-900 backdrop-blur-sm
    ${gradient ? 'bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800' : ''}
    border border-gray-200 dark:border-gray-700
    rounded-2xl shadow-lg hover:shadow-xl
    transition-all duration-300 ease-in-out
    hover:scale-[1.02] hover:-translate-y-1
    ${className}
  `}>
    {children}
  </div>
);

const MetricCard = ({ icon: Icon, label, value, unit, color = "blue", trend, isOnline = true }) => (
  <div className={`
    p-4 rounded-xl border-l-4 transition-all duration-200
    ${isOnline 
      ? `bg-gradient-to-r from-${color}-50 to-transparent dark:from-${color}-900/20 dark:to-transparent border-l-${color}-500 hover:from-${color}-100 dark:hover:from-${color}-900/30`
      : 'bg-gradient-to-r from-gray-50 to-transparent dark:from-gray-900/20 dark:to-transparent border-l-gray-400 hover:from-gray-100 dark:hover:from-gray-900/30'
    }
  `}>
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className={`p-2 rounded-lg ${isOnline ? `bg-${color}-100 dark:bg-${color}-900/30` : 'bg-gray-100 dark:bg-gray-900/30'}`}>
          <Icon className={`w-5 h-5 ${isOnline ? `text-${color}-600 dark:text-${color}-400` : 'text-gray-500 dark:text-gray-400'}`} />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</p>
            {!isOnline && (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
          </div>
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {value} <span className="text-sm font-normal text-gray-500">{unit}</span>
          </p>
        </div>
      </div>
      {trend && isOnline && (
        <div className={`text-sm font-semibold ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
          {trend > 0 ? '+' : ''}{trend}%
        </div>
      )}
    </div>
  </div>
);

const ExternalDataPanel = () => {
  const [data, setData] = useState({
    aqi: 0,
    ambient_light: 0,
    cloudcover: 0,
    vehicle_count: 0,
    pedestrian_count: 0,
    motion: 0,
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [location, setLocation] = useState('Harare,ZW');

  // get CSRF token
  const getCsrfToken = () => {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'csrftoken') {
        return value;
      }
    }
    return '';
  };

  // AQI color based on value
  const getAqiColor = (aqi) => {
    if (aqi <= 50) return 'green';
    if (aqi <= 100) return 'yellow';
    if (aqi <= 150) return 'orange';
    return 'red';
  };

  // AQI level description
  const getAqiDescription = (aqi) => {
    if (aqi <= 50) return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
    if (aqi <= 200) return 'Unhealthy';
    if (aqi <= 300) return 'Very Unhealthy';
    return 'Hazardous';
  };

  // cloud cover description
  const getCloudDescription = (cloudcover) => {
    if (cloudcover <= 10) return 'Clear';
    if (cloudcover <= 30) return 'Partly Cloudy';
    if (cloudcover <= 70) return 'Mostly Cloudy';
    return 'Overcast';
  };

  // light level description
  const getLightDescription = (lux) => {
    if (lux === 0) return 'Night';
    if (lux < 50) return 'Very Dim';
    if (lux < 200) return 'Dim';
    if (lux < 500) return 'Indoor';
    if (lux < 1000) return 'Overcast';
    if (lux < 10000) return 'Daylight';
    return 'Bright Daylight';
  };

  const fetchWeatherData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    
    try {
      // Try multiple possible API endpoints
      const possibleUrls = [
        `http://127.0.0.1:8000/fetch_weather_data/?location=${encodeURIComponent(location)}`,
        `http://127.0.0.1:8000/api/fetch_weather_data/?location=${encodeURIComponent(location)}`,
        `http://localhost:8000/fetch_weather_data/?location=${encodeURIComponent(location)}`,
        `http://127.0.0.1:8000/fetch_weather_data/?location=${encodeURIComponent(location)}`,
      ];

      let response = null;
      let lastError = null;

      for (const url of possibleUrls) {
        try {
          console.log(`Trying to fetch weather data from: ${url}`);
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);
          
          response = await fetch(url, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'X-CSRFToken': getCsrfToken(),
            },
            signal: controller.signal,
            credentials: 'same-origin',
          });
          
          clearTimeout(timeoutId);
          console.log(`Response status: ${response.status}`);
          
          if (response.ok) {
            console.log(`Successfully connected to: ${url}`);
            setIsConnected(true);
            break;
          } else {
            lastError = `HTTP ${response.status}: ${response.statusText}`;
            console.log(`Failed with status: ${response.status}`);
          }
        } catch (fetchError) {
          lastError = fetchError.message;
          console.log(`Failed to fetch from ${url}:`, fetchError.message);
          if (fetchError.name === 'AbortError') {
            lastError = 'Request timed out after 15 seconds';
          }
        }
      }

      if (!response || !response.ok) {
        setIsConnected(false);
        throw new Error(lastError || 'All API endpoints failed');
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.log('Received non-JSON response:', text.substring(0, 200));
        throw new Error('Server returned HTML instead of JSON. Check if Django server is running and URLs are configured correctly.');
      }

      const responseData = await response.json();
      console.log('Fetched weather data:', responseData);
      
      if (responseData.error) {
        console.warn('API returned error:', responseData.error);
      }

      setData({
        aqi: responseData.aqi || 0,
        ambient_light: responseData.ambient_light || 0,
        cloudcover: responseData.cloudcover || 0,
        vehicle_count: responseData.vehicle_count || 0,
        pedestrian_count: responseData.pedestrian_count || 0,
        motion: responseData.motion || 0,
      });
      
      setLastUpdated(new Date().toLocaleTimeString());
      setIsConnected(true);
      
    } catch (err) {
      console.error('Failed to fetch weather data:', err);
      setIsConnected(false);
      
      if (err.name === 'AbortError') {
        setError('Request timed out. Please check your connection.');
      } else if (err.message.includes('NetworkError') || err.message.includes('Failed to fetch')) {
        setError('Network error. Please check if the Django server is running.');
      } else {
        setError(err.message);
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Manual refresh function
  const handleRefresh = () => {
    fetchWeatherData(true);
  };

  useEffect(() => {
    fetchWeatherData();
    
    // Auto-refresh every 30 minutes (weather data doesn't change frequently)
    const interval = setInterval(() => {
      fetchWeatherData(false);
    }, 300000);
    
    return () => clearInterval(interval);
  }, [location]);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className={`p-3 rounded-xl ${isConnected ? 'bg-gradient-to-br from-blue-500 to-cyan-500' : 'bg-gradient-to-br from-gray-500 to-gray-600'}`}>
            <Cloud className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Environment Data</h2>
            {lastUpdated && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Last updated: {lastUpdated}
              </p>
            )}
          </div>
        </div>
        
        <button
          onClick={handleRefresh}
          disabled={loading}
          className={`p-2 rounded-lg transition-all duration-200 ${
            loading 
              ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' 
              : 'bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50'
          }`}
        >
          <RefreshCw className={`w-5 h-5 text-blue-600 dark:text-blue-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <span className="text-red-800 dark:text-red-200 font-medium">Connection Error</span>
          </div>
          <p className="text-red-700 dark:text-red-300 mt-1 text-sm">{error}</p>
        </div>
      )}

      {/* Location Input */}
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Location
        </label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g., Harare,ZW or New York,NY"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                   bg-white dark:bg-gray-700 text-gray-900 dark:text-white 
                   focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          onKeyPress={(e) => e.key === 'Enter' && fetchWeatherData(true)}
        />
      </div>

      <div className="space-y-4">
        {/* Air Quality Index */}
        <MetricCard 
          icon={Cloud} 
          label="Air Quality Index" 
          value={`${data.aqi} (${getAqiDescription(data.aqi)})`}
          unit="" 
          color={getAqiColor(data.aqi)}
          isOnline={isConnected}
        />
        
        {/* Ambient Light */}
        {/* <MetricCard 
          icon={Cloud} 
          label="Ambient Light" 
          value={`${data.ambient_light - 22000} (${getLightDescription(data.ambient_light)})`}
          unit="lux" 
          color="yellow"
          isOnline={isConnected}
        /> */}
        
        {/* Cloud Cover */}
        <MetricCard 
          icon={Cloud} 
          label="Cloud Cover" 
          value={`${data.cloudcover}% (${getCloudDescription(data.cloudcover)})`}
          unit="" 
          color="gray"
          isOnline={isConnected}
        />
        
        {/* Pedestrian Traffic */}
        <MetricCard 
          icon={Users} 
          label="Pedestrian Traffic" 
          value={data.pedestrian_count} 
          unit="people" 
          color="indigo"
          isOnline={isConnected}
        />
        
        {/* Vehicle Traffic */}
        <MetricCard 
          icon={Car} 
          label="Vehicle Traffic" 
          value={data.vehicle_count} 
          unit="vehicles" 
          color="slate"
          isOnline={isConnected}
        />
      </div>

      {/* Raw Data for Debugging */}
      <div className="mt-6 bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Raw Data</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600 dark:text-gray-400">Motion:</span>
            <span className="ml-2 font-mono text-gray-900 dark:text-white">
              {data.motion ? 'Detected' : 'None'}
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400">Location:</span>
            <span className="ml-2 font-mono text-gray-900 dark:text-white">
              {location}
            </span>
          </div>
        </div>
      </div>

      {/* Connection Status */}
      <div className={`mt-4 p-4 rounded-xl border ${
        isConnected 
          ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800' 
          : 'bg-gradient-to-r from-red-50 to-red-50 dark:from-red-900/20 dark:to-red-900/20 border-red-200 dark:border-red-800'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`font-semibold ${isConnected ? 'text-green-900 dark:text-green-100' : 'text-red-900 dark:text-red-100'}`}>
            Weather API Status
          </span>
          <span className={`text-lg font-bold ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
            {isConnected ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className={`rounded-full h-3 ${isConnected ? 'bg-green-200 dark:bg-green-800' : 'bg-red-200 dark:bg-red-800'}`}>
          <div 
            className={`h-3 rounded-full transition-all duration-1000 ${
              isConnected 
                ? 'bg-gradient-to-r from-green-500 to-emerald-500' 
                : 'bg-gradient-to-r from-red-500 to-red-600'
            }`}
            style={{ width: isConnected ? '100%' : '0%' }}
          ></div>
        </div>
      </div>
    </Card>
  );
};

export default ExternalDataPanel;