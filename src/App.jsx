import React from 'react';
import Dashboard from './pages/Dashboard';

function App() {
  return (
      <Dashboard />
  );
}

export default App;
















// function App() {
//   const [count, setCount] = useState(0)

//   return (
//     <>
//       <div>
//         <a href="https://vite.dev" target="_blank">
//           <img src={viteLogo} className="logo" alt="Vite logo" />
//         </a>
//         <a href="https://react.dev" target="_blank">
//           <img src={reactLogo} className="logo react" alt="React logo" />
//         </a>
//       </div>
//       <h1>Vite + React</h1>
//       <div className="card">
//         <button onClick={() => setCount((count) => count + 1)}>
//           count is {count}
//         </button>
//         <p>
//           Edit <code>src/App.jsx</code> and save to test HMR
//         </p>
//       </div>
//       <p className="read-the-docs">
//         Click on the Vite and React logos to learn more
//       </p>
//     </>
//   )
// }

// export default App




// frontend/src/App.jsx
// import React, { useState } from 'react';
// import axios from 'axios';

// function App() {
//   const [result, setResult] = useState(null);

//   const testPrediction = async () => {
//     const response = await axios.post('http://localhost:8000/api/predict/', {
//       features: {
//         tempmax: 28, tempmin: 14, temp: 20, humidity: 55,
//         sealevelpressure: 1015, cloudcover: 60, visibility: 8,
//         solarradiation: 180, windspeed: 9, precipprob: 40,
//         hour: 19, day_of_year: 180, month: 6, is_weekend: true,
//         daylight_duration: 11.8, natural_light_index: 40,
//         weather_severity: 0.55
//       },
//       external: {
//         air_quality: { aqi: 120 },
//         traffic_data: { pedestrian_count: 30, vehicle_count: 20 }
//       },
//       sensors: {
//         ambient_light_sensor: 15,
//         motion_sensor: 1
//       }
//     });

//     setResult(response.data);
//   };

//   return (
//     <div className="p-8">
//       <h1 className="text-2xl font-bold">Smart Streetlight Control</h1>
//       <button onClick={testPrediction} className="mt-4 bg-blue-500 text-white px-4 py-2 rounded">
//         Test Prediction
//       </button>

//       {result && (
//         <div className="mt-4">
//           <p><strong>Recommended Intensity:</strong> {result.recommended_intensity}</p>
//           <p><strong>Lights Should Be On:</strong> {result.lights_should_be_on ? 'Yes' : 'No'}</p>
//           <p><strong>Confidence:</strong> {(result.confidence * 100).toFixed(1)}%</p>
//         </div>
//       )}
//     </div>
//   );
// }

// export default App;
