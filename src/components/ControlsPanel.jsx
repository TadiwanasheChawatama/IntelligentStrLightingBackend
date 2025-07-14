import { useState, useEffect } from "react";
import {
  Settings,
  AlertCircle,
  CheckCircle,
  Loader,
  Lightbulb,
} from "lucide-react";


const Card = ({ children, className = "", gradient = false }) => (
  <div
    className={`
    bg-white dark:bg-gray-900 backdrop-blur-sm
    ${
      gradient
        ? "bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800"
        : ""
    }
    border border-gray-200 dark:border-gray-700
    rounded-2xl shadow-lg hover:shadow-xl
    transition-all duration-300 ease-in-out
    hover:scale-[1.02] hover:-translate-y-1
    ${className}
  `}
  >
    {children}
  </div>
);

const ControlsPanel = ({ onUpdate }) => {
    // State to manage controls and sensor data
  const [controls, setControls] = useState({
    ambient_light: 50,
    motion: 0,
    cloudcover: 40,
    pedestrian_count: 10,
    vehicle_count: 5,
    aqi: 80,
    lights_on: 0, 
  });
const [sensorData, setSensorData] = useState({
    ambient_light_sensor: 0,
    motion_sensor: 0
  });
  const [applied, setApplied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
//   const [ambientLight, setAmbientLight] = useState(false);
//   const [isMotionTrue, setIsMotionTrue] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === "checkbox" ? (checked ? 1 : 0) : Number(value);
    setControls((prev) => ({ ...prev, [name]: val }));
    setApplied(false);
  };

const handleSubmit = async () => {
  setLoading(true);
  setError(null);
  
  try {
    // send lights_on value to backend
    const lightsData = { lights_on: controls.lights_on };
    
    const possibleUrls = [
      'http://localhost:8000/api/update_light_control/',
      'http://127.0.0.1:8000/api/update_light_control/',
    ];

    let response = null;
    let lastError = null;

    for (const url of possibleUrls) {
      try {
        console.log(`Trying to update lights via: ${url}`);
        
        // AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); 
        
        // POST request for updating data
        response = await fetch(url, {
          method: 'POST',  
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(lightsData),
          signal: controller.signal,
          credentials: 'same-origin',
        });
        
        clearTimeout(timeoutId);
        console.log(`Response status: ${response.status}`);
        
        if (response.ok) {
          console.log(`Successfully connected to: ${url}`);
          break; 
        } else {
          const errorData = await response.json().catch(() => ({}));
          lastError = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
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
      throw new Error(lastError || 'All API endpoints failed');
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.log('Received non-JSON response:', text.substring(0, 200));
      throw new Error('Server returned HTML instead of JSON. Check if Django server is running.');
    }

    const data = await response.json();
    console.log('Light control response:', data);
    
    if (data.status === 'error') {
      throw new Error(data.error || 'Unknown error occurred');
    }

    // Update UI to show success
    setApplied(true);
    setLastUpdated(new Date().toLocaleTimeString());
    
    // Call the original onUpdate callback if needed
    onUpdate(lightsData);
    
    // Reset success state after 3 seconds
    setTimeout(() => setApplied(false), 3000);
    
  } catch (err) {
    console.error('Failed to update light control:', err);
    setError(err.message);
  } finally {
    setLoading(false);
  }
};



  const fetchWeatherData = async () => {
  setLoading(true);
  setError(null);
  
  try {
    const possibleUrls = [
      'http://localhost:8000/api/fetch_weather_data/?location=Harare,ZW',
      'http://127.0.0.1:8000/api/fetch_weather_data/?location=Harare,ZW',
      '/api/fetch_weather_data/?location=Harare,ZW',
    ];

    let response = null;
    let lastError = null;

    for (const url of possibleUrls) {
      try {
        console.log(`Trying to fetch from: ${url}`);
        
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        response = await fetch(url, {
          method: 'GET', 
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          credentials: 'same-origin',
        });
        
        clearTimeout(timeoutId);
        console.log(`Response status: ${response.status}`);
        
        if (response.ok) {
          console.log(`Successfully connected to: ${url}`);
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
      throw new Error(lastError || 'All API endpoints failed');
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.log('Received non-JSON response:', text.substring(0, 200));
      throw new Error('Server returned HTML instead of JSON. Check if Django server is running and URLs are configured correctly.');
    }

    const data = await response.json();
    console.log('Fetched weather api data:', data);
    if (data.error) {
      throw new Error(data.error);
    }

    // Update controls with the fetched data
    setControls(prev => ({ ...prev, ...data }));
    setLastUpdated(new Date().toLocaleTimeString());
    // console.log('Controls updated:', data);
    // console.log('all copntrols: ', controls)
  } catch (err) {
    console.error('Failed to load weather data:', err);
    setError(err.message);
  } finally {
    setLoading(false);
  }
};

  // Fetch data on component mount
  useEffect(() => {
    fetchWeatherData();
  }, []);



    // get current time in HH:MM format
  const getCurrentTime = () => {
    return new Date().toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };


  // get CSRF token 
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
      // Trying multiple possible API endpoints
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
            // setIsConnected(true);
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
        // setIsConnected(false);
        throw new Error(lastError || 'All API endpoints failed');
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.log('Received non-JSON response:', text.substring(0, 200));
        throw new Error('Server returned HTML instead of JSON. Check if Django server is running and URLs are configured correctly.');
      }

      const data = await response.json();
      console.log('Ftched sensor datea:', data);
      
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
        
        // setIsMotionTrue(motionActivity)
        // setAmbientLight(lightIntensity)
        // setIsConnected(true);
      } else {
        throw new Error('Invalid sensor data received');
      }
      
    } catch (err) {
      console.error('Failed to fetch sensor data:', err);
    //   setIsConnected(false);
      
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
    
    // Auto-refresh every 15 seconds
    const interval = setInterval(() => {
      fetchSensorData(false); 
    }, 15000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="p-6 lg:col-span-2">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl">
            <Settings className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Environment Simulator
            </h2>
            {lastUpdated && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Last updated: {lastUpdated}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={fetchWeatherData}
          disabled={loading}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 
                     disabled:bg-gray-400 text-white rounded-lg transition-colors duration-200"
        >
          {loading ? (
            <Loader className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle className="w-4 h-4" />
          )}
          <span>{loading ? "Loading..." : "Refresh Data"}</span>
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <div>
              <h3 className="font-semibold text-red-800 dark:text-red-300">
                API Connection Error
              </h3>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                {error}
              </p>
              <p className="text-xs text-red-500 dark:text-red-500 mt-2">
                Make sure your Django server is running on localhost:8000 and
                CORS is configured.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Lights Control */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            💡 Street Lights
          </label>
          <div className="flex items-center space-x-3">
            <button
              onClick={() =>
                handleChange({
                  target: {
                    name: "lights_on",
                    value: controls.lights_on ? 0 : 1,
                  },
                })
              }
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200
                ${
                  controls.lights_on
                    ? "bg-yellow-500"
                    : "bg-gray-300 dark:bg-gray-600"
                }
              `}
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200
                  ${controls.lights_on ? "translate-x-6" : "translate-x-1"}
                `}
              />
            </button>
            <div className="flex items-center space-x-2">
              <Lightbulb
                className={`w-4 h-4 ${
                  controls.lights_on ? "text-yellow-500" : "text-gray-400"
                }`}
              />
              <span className="text-sm font-medium">
                {controls.lights_on ? "On" : "Off"}
              </span>
            </div>
          </div>
        </div>

        {/* Ambient Light - Read Only */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            🌇 Ambient Light
          </label>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg relative">
            <div
              className="h-2 bg-gradient-to-r from-blue-500 to-yellow-500 rounded-lg transition-all duration-300"
              style={{ width: `${sensorData.ambient_light_sensor}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>0 lux</span>
            <span className="font-semibold">{sensorData.ambient_light_sensor} lux</span>
            <span>100 lux</span>
          </div>
        </div>

        {/* Motion Detection - Read Only */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            🚶 Motion Detection
          </label>
          <div className="flex items-center space-x-3">
            <div
              className={`
              relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200
              ${
                sensorData.motion_sensor
                  ? "bg-green-500"
                  : "bg-gray-300 dark:bg-gray-600"
              }
            `}
            >
              <span
                className={`
                inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200
                ${sensorData.motion_sensor ? "translate-x-6" : "translate-x-1"}
              `}
              />
            </div>
            <span className="text-sm font-medium">
              {sensorData.motion_sensor ? "Detected" : "None"}
            </span>
          </div>
        </div>

        {/* Cloud Cover - Read Only */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            ☁️ Cloud Cover
          </label>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg relative">
            <div
              className="h-2 bg-gradient-to-r from-blue-400 to-gray-400 rounded-lg transition-all duration-300"
              style={{ width: `${controls.cloudcover}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Clear</span>
            <span className="font-semibold">{controls.cloudcover}%</span>
            <span>Overcast</span>
          </div>
        </div>

        {/* Vehicle Count - Read Only */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            🚗 Vehicle Count
          </label>
          <div
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white
                       text-center font-semibold"
          >
            {controls.vehicle_count}
          </div>
        </div>

        {/* Pedestrian Count - Read Only */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            🚶 Pedestrian Count
          </label>
          <div
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white
                       text-center font-semibold"
          >
            {controls.pedestrian_count}
          </div>
        </div>

        {/* AQI - Read Only */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
             Air Quality Index
          </label>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg relative">
            <div
              className={`h-2 rounded-lg transition-all duration-300 ${
                controls.aqi <= 50
                  ? "bg-green-500"
                  : controls.aqi <= 100
                  ? "bg-yellow-500"
                  : controls.aqi <= 150
                  ? "bg-orange-500"
                  : controls.aqi <= 200
                  ? "bg-red-500"
                  : controls.aqi <= 300
                  ? "bg-purple-500"
                  : "bg-red-800"
              }`}
              style={{ width: `${Math.min((controls.aqi / 500) * 100, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Good</span>
            <span className="font-semibold">{controls.aqi}</span>
            <span>Hazardous</span>
          </div>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        className={`
          mt-6 w-full px-6 py-3 rounded-xl font-semibold transition-all duration-200
          transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl
          ${
            applied
              ? "bg-green-500 text-white"
              : "bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700"
          }
        `}
      >
        {applied ? (
          <div className="flex items-center justify-center space-x-2">
            <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            </div>
            <span>Controls Applied!</span>
          </div>
        ) : (
          "Apply Environment Controls"
        )}
      </button>
    </Card>
  );
};

export default ControlsPanel;
