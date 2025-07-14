import { useState, useEffect } from 'react';
import { CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { BarChart3, Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';


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

const LiveCharts = () => {
  const [sensorData, setSensorData] = useState({
    ambient_light_sensor: 0,
    motion_sensor: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Chart data state 
  const [chartData, setChartData] = useState([]);

//  func current time in HH:MM format
  const getCurrentTime = () => {
    return new Date().toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

//   function to get CSRF token 
  const getCsrfToken = () => {
    const cookieValue = document.cookie
      .split('; ')
      .find(row => row.startsWith('csrftoken='))
      ?.split('=')[1];
    
    const metaTag = document.querySelector('meta[name="csrf-token"]');
    return cookieValue || metaTag?.getAttribute('content') || '';
  };

  const fetchSensorData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    
    try {

      const possibleUrls = [
        '/api/get_sensor_data_from_thingspeak/',
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

      // Validate and update sensor data
      if (data.ambient_light_sensor !== undefined && data.motion_sensor !== undefined) {
        const newSensorData = {
          ambient_light_sensor: parseFloat(data.ambient_light_sensor) || 0,
          motion_sensor: parseInt(data.motion_sensor) || 0
        };
        
        setSensorData(newSensorData);
        setLastUpdated(new Date().toLocaleTimeString());
        
        // Add new data point to chart
        const currentTime = getCurrentTime();
        const lightIntensity = Math.max(0, Math.min(100, (1024 - newSensorData.ambient_light_sensor) / 1024 * 100));
        const motionActivity = newSensorData.motion_sensor * 100;
        
        setChartData(prev => {
          const newData = [...prev, {
            time: currentTime,
            lightLevel: Math.round(lightIntensity),
            motionActivity: motionActivity,
            rawLdr: newSensorData.ambient_light_sensor
          }];
          
          // Keep only last 10 data points
          return newData.slice(-10);
        });
        
        setIsConnected(true);
      } else {
        throw new Error('Invalid sensor data received');
      }
      
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

  // Initial fetch and setup auto-refresh
  useEffect(() => {
    fetchSensorData();
    
    
    const interval = setInterval(() => {
      fetchSensorData(false); 
    }, 15000);
    
    return () => clearInterval(interval);
  }, []);

  
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-900 text-white p-3 rounded-lg shadow-lg border border-gray-700">
          <p className="font-semibold">{`Time: ${label}`}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              {`${entry.name}: ${entry.value}${entry.name.includes('Level') ? '%' : '%'}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="p-6 lg:col-span-2">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-br from-green-500 to-blue-500 rounded-xl">
            <BarChart3 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Real-time Analytics</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {lastUpdated ? `Last updated: ${lastUpdated}` : 'Loading...'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Connection Status */}
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
            isConnected 
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          }`}>
            {isConnected ? (
              <Wifi className="w-4 h-4" />
            ) : (
              <WifiOff className="w-4 h-4" />
            )}
            <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
          
          {/* Refresh Button */}
          <button
            onClick={() => fetchSensorData(true)}
            disabled={loading}
            className={`p-2 rounded-lg transition-colors ${
              loading 
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                : 'bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400'
            }`}
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
            <p className="text-red-700 dark:text-red-400 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Current Sensor Values */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">Ambient Light</h3>
          <p className="text-2xl font-bold text-blue-900 dark:text-blue-300">
            {sensorData.ambient_light_sensor}
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400">
            {sensorData.ambient_light_sensor < 800 ? 'Dark' : 'Bright'}
          </p>
        </div>
        
        <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-green-700 dark:text-green-400 mb-1">Motion Status</h3>
          <p className="text-2xl font-bold text-green-900 dark:text-green-300">
            {sensorData.motion_sensor ? 'ACTIVE' : 'INACTIVE'}
          </p>
          <p className="text-xs text-green-600 dark:text-green-400">
            {sensorData.motion_sensor ? 'Motion detected' : 'No motion'}
          </p>
        </div>
      </div>
      
      {/* Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="lightGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="motionGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis 
              dataKey="time" 
              stroke="#6B7280"
              fontSize={12}
            />
            <YAxis 
              domain={[0, 100]} 
              stroke="#6B7280"
              fontSize={12}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area 
              type="monotone" 
              dataKey="lightLevel" 
              stroke="#3B82F6" 
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#lightGradient)"
              name="Light Level"
            />
            <Area 
              type="monotone" 
              dataKey="motionActivity" 
              stroke="#10B981" 
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#motionGradient)"
              name="Motion Activity"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      {/* Chart Legend */}
      <div className="flex justify-center space-x-6 mt-4">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <span className="text-sm text-gray-600 dark:text-gray-400">Light Level (%)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <span className="text-sm text-gray-600 dark:text-gray-400">Motion Activity (%)</span>
        </div>
      </div>
    </Card>
  );
}

export default LiveCharts;