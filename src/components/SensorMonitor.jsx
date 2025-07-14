import { useState, useEffect } from 'react';
import { Eye, Users, Wifi, AlertCircle, RefreshCw, WifiOff } from 'lucide-react';

// Modern Card Component
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

// Animated Metric Card
const MetricCard = ({ icon: Icon, label, value, unit, color = "blue", trend, isOnline = true, sensorConnected = true }) => (
  <div className={`
    p-4 rounded-xl border-l-4 transition-all duration-200
    ${isOnline && sensorConnected
      ? `bg-gradient-to-r from-${color}-50 to-transparent dark:from-${color}-900/20 dark:to-transparent border-l-${color}-500 hover:from-${color}-100 dark:hover:from-${color}-900/30`
      : 'bg-gradient-to-r from-gray-50 to-transparent dark:from-gray-900/20 dark:to-transparent border-l-gray-400 hover:from-gray-100 dark:hover:from-gray-900/30'
    }
  `}>
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className={`p-2 rounded-lg ${isOnline && sensorConnected ? `bg-${color}-100 dark:bg-${color}-900/30` : 'bg-gray-100 dark:bg-gray-900/30'}`}>
          <Icon className={`w-5 h-5 ${isOnline && sensorConnected ? `text-${color}-600 dark:text-${color}-400` : 'text-gray-500 dark:text-gray-400'}`} />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</p>
            {!sensorConnected && (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
          </div>
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {value} <span className="text-sm font-normal text-gray-500">{unit}</span>
          </p>
        </div>
      </div>
      {trend && sensorConnected && (
        <div className={`text-sm font-semibold ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
          {trend > 0 ? '+' : ''}{trend}%
        </div>
      )}
    </div>
  </div>
);

const SensorMonitor = () => {
  // State for real sensor data
  const [sensorData, setSensorData] = useState({
    ambient_light_sensor: 0,
    motion_sensor: 0
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [sensorHistory, setSensorHistory] = useState({
    light: [],
    motion: [],
    lastValues: { light: null, motion: null }
  });

  // Helper function to get CSRF token
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

  // Check if sensor is connected/working
  const isSensorConnected = (sensorType, currentValue) => {
    const history = sensorHistory[sensorType];
    
    // If we have no history yet, assume connected
    if (history.length === 0) {
      return true;
    }
    

    if (sensorType === 'light') {
      if (currentValue === 0) {
        const recentZeros = history.slice(-3).filter(val => val === 0).length;
        if (recentZeros >= 3) return false; 
      }
      
      if (currentValue >= 1023) {
        const recentMax = history.slice(-3).filter(val => val >= 1023).length;
        if (recentMax >= 3) return false;
      }
      
     
      if (history.length >= 5) {
        const recentValues = history.slice(-5);
        const allSame = recentValues.every(val => val === currentValue);
        if (allSame && currentValue !== sensorHistory.lastValues.light) {
          return false;
        }
      }
    }
    

    if (sensorType === 'motion') {
     
      if (currentValue !== 0 && currentValue !== 1) {
        return false;
      }
    }
    
    return true;
  };

  // Convert LDR reading to light intensity percentage
  const getLightIntensity = (ldrValue, isConnected) => {
    if (!isConnected) return 0;
    
    // LDR conversion
    const maxLdr = 1024;
    const minLdr = 0;
    

    const clampedValue = Math.max(minLdr, Math.min(maxLdr, ldrValue));
    
    
    const intensity = Math.max(0, Math.min(100, (maxLdr - clampedValue) / maxLdr * 100));
    return Math.round(intensity);
  };

  // Get motion status text
  const getMotionStatus = (motionValue, isConnected) => {
    if (!isConnected) return 'Sensor Disconnected';
    return motionValue === 1 ? 'Motion Detected' : 'No Motion';
  };

  // Get light level description
  const getLightDescription = (intensity, isConnected) => {
    if (!isConnected) return 'Sensor Disconnected';
    if (intensity > 80) return 'Very Bright';
    if (intensity > 60) return 'Bright';
    if (intensity > 40) return 'Medium';
    if (intensity > 20) return 'Dim';
    return 'Very Dim';
  };

  const fetchSensorData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    
    try {
      // Try multiple possible API endpoints
      const possibleUrls = [
        '/api/get_live_sensor_logs_from_thingspeak/',
        '/api/get_sensor_data_from_thingspeak/',
        'http://localhost:8000/api/get_live_sensor_logs_from_thingspeak/',
        'http://127.0.0.1:8000/api/get_live_sensor_logs_from_thingspeak/',
        'http://localhost:8000/api/get_sensor_data_from_thingspeak/',
        'http://127.0.0.1:8000/api/get_sensor_data_from_thingspeak/',
      ];

      let response = null;
      let lastError = null;

      for (const url of possibleUrls) {
        try {
          console.log(`Trying to fetch from: ${url}`);
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          
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
            lastError = 'Request timed out after 10 seconds';
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

      const data = await response.json();
      console.log('Fetched data:', data);
      
      if (data.error) {
        throw new Error(data.error);
      }

      let newSensorData = { ambient_light_sensor: 0, motion_sensor: 0 };

      // Handle the response from live logs endpoint
      if (data.live_logs && data.live_logs.length > 0) {
        const latestEntry = data.live_logs[0];
        newSensorData = {
          ambient_light_sensor: parseFloat(latestEntry.ambient_light_sensor) || 0,
          motion_sensor: parseInt(latestEntry.motion_sensor) || 0
        };
      } 
      // Handle single entry response format
      else if (data.ambient_light_sensor !== undefined && data.motion_sensor !== undefined) {
        newSensorData = {
          ambient_light_sensor: parseFloat(data.ambient_light_sensor) || 0,
          motion_sensor: parseInt(data.motion_sensor) || 0
        };
      } else {
        throw new Error('Invalid sensor data received');
      }

      // Update sensor history for connectivity checking
      setSensorHistory(prev => ({
        light: [...prev.light.slice(-9), newSensorData.ambient_light_sensor],
        motion: [...prev.motion.slice(-9), newSensorData.motion_sensor],
        lastValues: {
          light: prev.lastValues.light || newSensorData.ambient_light_sensor,
          motion: prev.lastValues.motion || newSensorData.motion_sensor
        }
      }));

      setSensorData(newSensorData);
      setLastUpdated(new Date().toLocaleTimeString());
      setIsConnected(true);
      
    } catch (err) {
      console.error('Failed to fetch sensor data:', err);
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
    fetchSensorData(true);
  };

  // Initial fetch and setup auto-refresh
  useEffect(() => {
    fetchSensorData();
    
    // Auto-refresh every 15 seconds
    const interval = setInterval(() => {
      fetchSensorData(false); // Don't show loading for auto-refresh
    }, 15000);
    
    return () => clearInterval(interval);
  }, []);

  // Check sensor connectivity
  const lightSensorConnected = isSensorConnected('light', sensorData.ambient_light_sensor);
  const motionSensorConnected = isSensorConnected('motion', sensorData.motion_sensor);
  
  const lightIntensity = getLightIntensity(sensorData.ambient_light_sensor, lightSensorConnected);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className={`p-3 rounded-xl ${isConnected ? 'bg-gradient-to-br from-emerald-500 to-teal-500' : 'bg-gradient-to-br from-gray-500 to-gray-600'}`}>
            <Wifi className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Live Sensors</h2>
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

      <div className="space-y-4">
        {/* Ambient Light Sensor */}
        <MetricCard 
          icon={Eye} 
          label="Ambient Light" 
          value={lightSensorConnected ? `${lightIntensity}% (${getLightDescription(lightIntensity, lightSensorConnected)})` : 'Sensor Disconnected'} 
          unit="" 
          color="yellow"
          isOnline={isConnected}
          sensorConnected={lightSensorConnected}
        />
        
        {/* Motion Sensor */}
        <MetricCard 
          icon={Users} 
          label="Motion Detection" 
          value={getMotionStatus(sensorData.motion_sensor, motionSensorConnected)} 
          unit="" 
          color={motionSensorConnected && sensorData.motion_sensor === 1 ? "green" : "gray"}
          isOnline={isConnected}
          sensorConnected={motionSensorConnected}
        />
        
        {/* Sensor Status Summary */}
        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Sensor Status</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Light Sensor:</span>
              <span className={`text-sm font-medium ${lightSensorConnected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {lightSensorConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Motion Sensor:</span>
              <span className={`text-sm font-medium ${motionSensorConnected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {motionSensorConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
        
        {/* Raw sensor values for debugging */}
        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Raw Sensor Values</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600 dark:text-gray-400">LDR Value:</span>
              <span className="ml-2 font-mono text-gray-900 dark:text-white">
                {sensorData.ambient_light_sensor}
              </span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Motion Value:</span>
              <span className="ml-2 font-mono text-gray-900 dark:text-white">
                {sensorData.motion_sensor}
              </span>
            </div>
          </div>
          {/* Show recent readings for debugging */}
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Recent Light Readings: {sensorHistory.light.slice(-5).join(', ')}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Recent Motion Readings: {sensorHistory.motion.slice(-5).join(', ')}
            </div>
          </div>
        </div>
        
        {/* Connection Status */}
        <div className={`p-4 rounded-xl border ${
          isConnected 
            ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800' 
            : 'bg-gradient-to-r from-red-50 to-red-50 dark:from-red-900/20 dark:to-red-900/20 border-red-200 dark:border-red-800'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`font-semibold ${isConnected ? 'text-green-900 dark:text-green-100' : 'text-red-900 dark:text-red-100'}`}>
              API Connection
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
      </div>
    </Card>
  );
};

export default SensorMonitor;