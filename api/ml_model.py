import pandas as pd
import numpy as np
# from datetime import datetime, timedelta
# from sklearn.ensemble import RandomForestRegressor
from django.conf import settings
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
import xgboost as xgb
import requests
import json




def create_features(df):
    """
    Create features from your actual Harare weather CSV data
    """
    df = df.copy()
    df['datetime'] = pd.to_datetime(df['datetime'], errors='coerce')
    
    # Fill any missing datetime values
    if df['datetime'].isna().any():
        first_valid_mask = df['datetime'].notna()
        if first_valid_mask.any():
            first_valid = df.loc[first_valid_mask, 'datetime'].iloc[0]
        else:
            first_valid = pd.Timestamp('2020-01-01')
        df['datetime'] = df['datetime'].fillna(first_valid)
    
    # Time-based features
    df['hour'] = 12 
    df['day_of_year'] = df['datetime'].dt.dayofyear
    df['month'] = df['datetime'].dt.month
    df['season'] = df['month'].apply(lambda x: (x - 1) // 3)
    df['is_weekend'] = df['datetime'].dt.weekday >= 5

    # Default values for missing columns
    default_vals = {
        'tempmax': 20.0, 'tempmin': 10.0, 'temp': 15.0, 'humidity': 60.0,
        'sealevelpressure': 1013.25, 'cloudcover': 50.0, 'visibility': 10.0,
        'solarradiation': 200.0, 'windspeed': 10.0, 'precipprob': 0.0
    }

    for col, default_val in default_vals.items():
        df[col] = df.get(col, default_val)
        df[col] = df[col].fillna(default_val)

    # Approximate daylight 
    df['daylight_duration'] = 12

    # Composite light and weather features
    df['natural_light_index'] = (
        df['solarradiation'] * (100 - df['cloudcover']) / 100 *
        df['visibility'] / max(df['visibility'].quantile(0.95), 1)
    )

    df['weather_severity'] = (
        df['windspeed'] / max(df['windspeed'].quantile(0.95), 1) * 0.3 +
        df['precipprob'] / 100 * 0.4 +
        df['cloudcover'] / 100 * 0.3
    )

    return df




class StreetlightMLSystem:
    def __init__(self, visual_crossing_api_key=None, openweather_api_key=None):
        self.weather_model = None
        self.light_intensity_model = None
        self.is_trained = False
        self.visual_crossing_api_key = visual_crossing_api_key
        self.openweather_api_key = openweather_api_key
        
    def preprocess_weather_data(self, df):
        """Preprocess the weather dataset for ML training"""
        
        # Convert datetime
        df['sunrise'] = pd.to_datetime(df['sunrise'], errors='coerce')
        df['sunset'] = pd.to_datetime(df['sunset'], errors='coerce')
        df['datetime'] = pd.to_datetime(df['datetime'], errors='coerce')
        
        # Create time-based features
        df['hour'] = df['datetime'].dt.hour
        df['day_of_year'] = df['datetime'].dt.dayofyear
        df['month'] = df['datetime'].dt.month
        df['is_weekend'] = df['datetime'].dt.weekday >= 5
        
        # Calculate daylight duration
        df['daylight_duration'] = (df['sunset'] - df['sunrise']).dt.total_seconds() / 3600
        
        # Create composite light features
        df['natural_light_index'] = (
            df['solarradiation'] * (100 - df['cloudcover']) / 100 * 
            df['visibility'] / df['visibility'].quantile(0.95)
        )
        
        # Time to sunrise/sunset in minutes
        current_time = df['datetime'].dt.time
        sunrise_time = df['sunrise'].dt.time
        sunset_time = df['sunset'].dt.time
        
        # Weather severity score
        df['weather_severity'] = (
            df['windspeed'] / df['windspeed'].quantile(0.95) * 0.3 +
            df['precipprob'] / 100 * 0.4 +
            df['cloudcover'] / 100 * 0.3
        )
        
        return df
    
    def create_streetlight_targets(self, df):
        """Create target variables for streetlight control"""
        targets = {}
        
        # Light intensity needed (0-100 scale)
        # Higher values when less natural light available
        targets['light_intensity'] = np.clip(
            100 - (df['natural_light_index'] / df['natural_light_index'].quantile(0.95) * 100),
            0, 100
        )
        
        # Binary streetlight status
        targets['lights_on'] = (
            (df['hour'] < 6) | (df['hour'] > 18) |  # Night hours
            (df['cloudcover'] > 80) |  # Very cloudy
            (df['visibility'] < 5) |   # Poor visibility
            (df['precipprob'] > 70)    # High chance of rain
        ).astype(int)
        
        # Adaptive brightness based on conditions
        targets['adaptive_brightness'] = np.where(
            targets['lights_on'] == 1,
            np.clip(targets['light_intensity'] + df['weather_severity'] * 20, 20, 100),
            0
        )
        
        return targets
    
    def train_models(self, df):
        """Train ML models for streetlight prediction"""
        # Preprocess data
        df_processed = self.preprocess_weather_data(df.copy())
        targets = self.create_streetlight_targets(df_processed)
        
        # Feature selection
        feature_cols = [
            'tempmax', 'tempmin', 'temp', 'humidity', 'sealevelpressure',
            'cloudcover', 'visibility', 'solarradiation', 'windspeed',
            'precipprob', 'hour', 'day_of_year', 'month', 'is_weekend',
            'daylight_duration', 'natural_light_index', 'weather_severity'
        ]
        
        X = df_processed[feature_cols].fillna(0)
        
        # Train light intensity model
        y_intensity = targets['light_intensity']
        X_train, X_test, y_train, y_test = train_test_split(X, y_intensity, test_size=0.2, random_state=42)
        
        self.light_intensity_model = xgb.XGBRegressor(
            n_estimators=100,
            max_depth=6,
            learning_rate=0.1,
            random_state=42
        )
        self.light_intensity_model.fit(X_train, y_train)
        
        # Evaluate model
        y_pred = self.light_intensity_model.predict(X_test)
        mae = mean_absolute_error(y_test, y_pred)
        r2 = r2_score(y_test, y_pred)
        
        
        print(f"Light Intensity Model Performance:")
        print(f"MAE: {mae:.2f}")
        print(f"R² Score: {r2:.3f}")
        
        self.is_trained = True
        return {'mae': mae, 'r2': r2}
    

    def get_external_api_data(self):
        """
        Fetch real data from Visual Crossing Weather API and other sources
        Returns data in the same format as the original simulated data
        """
        
        # Check if API key is provided
        if not self.visual_crossing_api_key:
            print("⚠ No Visual Crossing API key provided, using simulated data")
            return self._get_simulated_data()
        
        LOCATION = "Harare,Zimbabwe"  
        
        # Initialize with default/fallback values
        external_data = {
            'current_weather': {
                'temperature': 20.0,
                'humidity': 60,
                'cloudcover': 50,
                'visibility': 10,
                'wind_speed': 10
            },
            'air_quality': {
                'aqi': 50,
                'pm25': 12.0
            },
            'traffic_data': {
                'pedestrian_count': 15,
                'vehicle_count': 8
            }
        }
        
        try:
            # Fetch current weather from Visual Crossing
            weather_url = f"https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/{LOCATION}/today"
            weather_params = {
                'key': self.visual_crossing_api_key,
                'include': 'current',
                'elements': 'temp,humidity,cloudcover,visibility,windspeed,conditions,datetime',
                'unitGroup': 'metric'
            }
            
            print(f"Fetching weather data for {LOCATION}...")
            weather_response = requests.get(weather_url, params=weather_params, timeout=10)
            
            if weather_response.status_code == 200:
                weather_data = weather_response.json()
                
                # Extract current conditions
                if 'currentConditions' in weather_data:
                    current = weather_data['currentConditions']
                    
                    external_data['current_weather'] = {
                        'temperature': float(current.get('temp', 20.0)),
                        'humidity': float(current.get('humidity', 60)),
                        'cloudcover': float(current.get('cloudcover', 50)),
                        'visibility': float(current.get('visibility', 10)),
                        'wind_speed': float(current.get('windspeed', 10))
                    }
                    
                    print(f"✓ Weather data fetched successfully")
                    print(f"  Temperature: {external_data['current_weather']['temperature']}°C")
                    print(f"  Humidity: {external_data['current_weather']['humidity']}%")
                    print(f"  Cloud Cover: {external_data['current_weather']['cloudcover']}%")
                    
                else:
                    print("⚠ No current conditions found in API response, using defaults")
                    
            else:
                print(f"⚠ Weather API request failed: {weather_response.status_code}")
                if weather_response.status_code == 401:
                    print("  Check your Visual Crossing API key")
                elif weather_response.status_code == 429:
                    print("  API rate limit exceeded")
                
        except requests.exceptions.Timeout:
            print("⚠ Weather API request timed out, using default values")
        except requests.exceptions.ConnectionError:
            print("⚠ Failed to connect to weather API, using default values")
        except Exception as e:
            print(f"⚠ Error fetching weather data: {str(e)}")
        

        # if self.openweather_api_key:
        #     try:
        #         air_quality = self._get_air_quality_data()
        #         external_data['air_quality'] = air_quality
        #     except Exception as e:
        #         print(f"⚠ Error fetching air quality data: {str(e)}")
        # else:
        #     # Estimate air quality based on weather conditions
        #     self._estimate_air_quality(external_data)
        
        # Generate traffic data based on time patterns
        self._generate_traffic_data(external_data)
        
        return external_data
    
    def _get_air_quality_data(self, lat=-17.8252, lon=31.0335):
        """Fetch real air quality data from OpenWeatherMap"""
        url = f"http://api.openweathermap.org/data/2.5/air_pollution"
        params = {
            'lat': lat,
            'lon': lon,
            'appid': self.openweather_api_key
        }
        
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if 'list' in data and len(data['list']) > 0:
                aqi_data = data['list'][0]
                return {
                    'aqi': aqi_data['main']['aqi'] * 20,  
                    'pm25': aqi_data['components'].get('pm2_5', 12.0)
                }
        
        return {'aqi': 50, 'pm25': 12.0}
    
    def _estimate_air_quality(self, external_data):
        """Estimate air quality based on weather conditions"""
        try:
            humidity = external_data['current_weather']['humidity']
            visibility = external_data['current_weather']['visibility']
            
            estimated_aqi = max(20, min(150, 100 - (visibility * 5) + (humidity * 0.5)))
            estimated_pm25 = max(5, min(50, estimated_aqi * 0.3))
            
            external_data['air_quality'] = {
                'aqi': int(estimated_aqi),
                'pm25': round(estimated_pm25, 1)
            }
        except Exception as e:
            print(f"⚠ Error estimating air quality: {str(e)}")
    
    def _generate_traffic_data(self, external_data):
        """Generate traffic data based on time patterns"""
        try:
            from datetime import datetime
            import random
            
            current_hour = datetime.now().hour
            
            # Simulate traffic patterns based on time
            if 7 <= current_hour <= 9 or 17 <= current_hour <= 19:  
                base_pedestrians = 40
                base_vehicles = 25
            elif 10 <= current_hour <= 16: 
                base_pedestrians = 25
                base_vehicles = 15
            elif 20 <= current_hour <= 23:
                base_pedestrians = 30
                base_vehicles = 20
            else: 
                base_pedestrians = 5
                base_vehicles = 3
            
            # Add some randomness
            pedestrian_variance = random.randint(-10, 10)
            vehicle_variance = random.randint(-5, 8)
            
            external_data['traffic_data'] = {
                'pedestrian_count': max(0, base_pedestrians + pedestrian_variance),
                'vehicle_count': max(0, base_vehicles + vehicle_variance)
            }
        except Exception as e:
            print(f"⚠ Error generating traffic data: {str(e)}")

    def _get_simulated_data(self):
        """Fallback simulated data (your original function)"""
        return {
            'current_weather': {
                'temperature': 15.2,
                'humidity': 65,
                'cloudcover': 45,
                'visibility': 10,
                'wind_speed': 12
            },
            'air_quality': {
                'aqi': 85,
                'pm25': 15.2
            },
            'traffic_data': {
                'pedestrian_count': 25,
                'vehicle_count': 12
            }
        }

    def simulate_iot_sensor_data(self):
        """Simulate IoT sensor data"""
        # This would come from C-based IoT devices
        myChannelID = settings.THINGSPEAK_CHANNEL_ID
        myWriteAPIKey = settings.THINGSPEAK_WRITE_API_KEY
        myReadAPIKey = settings.THINGSPEAK_READ_API_KEY

     
        url = f"https://api.thingspeak.com/channels/{myChannelID}/feeds.json?results=1&api_key={myReadAPIKey}"

        try:
            print(f"Fetching data from: {url}")
            response = requests.get(url, timeout=10)
            response.raise_for_status()  # Raises an HTTPError for bad responses

            json_data = response.json()
            print(f"ThingSpeak response: {json_data}")

            # Check if feeds exist and have data
            if 'feeds' not in json_data or not json_data['feeds']:
                print("No data available from ThingSpeak, using random data")
                # Fallback to random data if ThingSpeak is unavailable
                sensor_data = {
                    'ambient_light_sensor': np.random.uniform(0, 100),  # Lux reading
                    'motion_sensor': np.random.choice([0, 1]),  # Motion detected
                    'temperature_sensor': np.random.uniform(10, 25),  # Local temp
                    'power_consumption': np.random.uniform(50, 150),  # Current consumption
                    'device_health': np.random.uniform(0.8, 1.0)  # Device health score
                }
                return sensor_data

            data = json_data['feeds'][0]

            # Validate that required fields exist
            if 'field1' not in data or 'field2' not in data:
                print("Missing required sensor data fields, using random data")
                # Fallback to random data if required fields are missing
                sensor_data = {
                    'ambient_light_sensor': np.random.uniform(0, 100),  # Lux reading
                    'motion_sensor': np.random.choice([0, 1]),  # Motion detected
                    'temperature_sensor': np.random.uniform(10, 25),  # Local temp
                    'power_consumption': np.random.uniform(50, 150),  # Current consumption
                    'device_health': np.random.uniform(0.8, 1.0)  # Device health score
                }
                return sensor_data

            # Handle None values
            ambient_light = data['field1']
            motion_sensor = data['field2']

            if ambient_light is None:
                ambient_light = 0
            if motion_sensor is None:
                motion_sensor = 0

            # Return sensor data with ThingSpeak data for ambient light and motion,
            # and random data for other sensors
            sensor_data = {
                'ambient_light_sensor': float(ambient_light),
                'motion_sensor': int(motion_sensor),
                'temperature_sensor': np.random.uniform(10, 25),  # Local temp
                'power_consumption': np.random.uniform(50, 150),  # Current consumption
                'device_health': np.random.uniform(0.8, 1.0)  # Device health score
            }

            return sensor_data

        except requests.exceptions.Timeout:
            print("Request to ThingSpeak timed out, using random data")
            sensor_data = {
                'ambient_light_sensor': np.random.uniform(0, 100),  # Lux reading
                'motion_sensor': np.random.choice([0, 1]),  # Motion detected
                'temperature_sensor': np.random.uniform(10, 25),  # Local temp
                'power_consumption': np.random.uniform(50, 150),  # Current consumption
                'device_health': np.random.uniform(0.8, 1.0)  # Device health score
            }
            return sensor_data
        except requests.exceptions.ConnectionError:
            print("Connection error to ThingSpeak, using random data")
            sensor_data = {
                'ambient_light_sensor': np.random.uniform(0, 100),  # Lux reading
                'motion_sensor': np.random.choice([0, 1]),  # Motion detected
                'temperature_sensor': np.random.uniform(10, 25),  # Local temp
                'power_consumption': np.random.uniform(50, 150),  # Current consumption
                'device_health': np.random.uniform(0.8, 1.0)  # Device health score
            }
            return sensor_data
        except requests.exceptions.HTTPError as e:
            print(f"HTTP error: {e}, using random data")
            sensor_data = {
                'ambient_light_sensor': np.random.uniform(0, 100),  # Lux reading
                'motion_sensor': np.random.choice([0, 1]),  # Motion detected
                'temperature_sensor': np.random.uniform(10, 25),  # Local temp
                'power_consumption': np.random.uniform(50, 150),  # Current consumption
                'device_health': np.random.uniform(0.8, 1.0)  # Device health score
            }
            return sensor_data
        except KeyError as e:
            print(f"KeyError: {e}, using random data")
            sensor_data = {
                'ambient_light_sensor': np.random.uniform(0, 100),  # Lux reading
                'motion_sensor': np.random.choice([0, 1]),  # Motion detected
                'temperature_sensor': np.random.uniform(10, 25),  # Local temp
                'power_consumption': np.random.uniform(50, 150),  # Current consumption
                'device_health': np.random.uniform(0.8, 1.0)  # Device health score
            }
            return sensor_data
        except ValueError as e:
            print(f"ValueError: {e}, using random data")
            sensor_data = {
                'ambient_light_sensor': np.random.uniform(0, 100),  # Lux reading
                'motion_sensor': np.random.choice([0, 1]),  # Motion detected
                'temperature_sensor': np.random.uniform(10, 25),  # Local temp
                'power_consumption': np.random.uniform(50, 150),  # Current consumption
                'device_health': np.random.uniform(0.8, 1.0)  # Device health score
            }
            return sensor_data
        except Exception as e:
            print(f"Unexpected error: {e}, using random data")
            sensor_data = {
                'ambient_light_sensor': np.random.uniform(0, 100),  # Lux reading
                'motion_sensor': np.random.choice([0, 1]),  # Motion detected
                'temperature_sensor': np.random.uniform(10, 25),  # Local temp
                'power_consumption': np.random.uniform(50, 150),  # Current consumption
                'device_health': np.random.uniform(0.8, 1.0)  # Device health score
            }
            return sensor_data
        
    def make_prediction(self, weather_features, external_data=None, sensor_data=None):
        """Make streetlight control prediction"""
        if not self.is_trained:
            raise ValueError("Model not trained yet!")
        
        # Base prediction from weather model
        base_intensity = self.light_intensity_model.predict([weather_features])[0]
        
        # Adjust based on external data
        if external_data:
            # Adjust for air quality (poor air quality = more light needed)
            if external_data.get('air_quality', {}).get('aqi', 50) > 100:
                base_intensity = min(100, base_intensity * 1.2)
            
            # Adjust for traffic (more traffic = more light needed)
            traffic_factor = (
                external_data.get('traffic_data', {}).get('pedestrian_count', 0) +
                external_data.get('traffic_data', {}).get('vehicle_count', 0)
            ) / 20
            base_intensity = min(100, base_intensity + traffic_factor)
        
        # Adjust based on IoT sensor data
        if sensor_data:
            # Real-time ambient light reading
            ambient_light = sensor_data.get('ambient_light_sensor', 50)
            if ambient_light < 20:  # Very dark
                base_intensity = max(base_intensity, 80)
            elif ambient_light > 70:  # Bright enough
                base_intensity = min(base_intensity, 30)
            
            # Motion detection
            if sensor_data.get('motion_sensor', 0):
                base_intensity = max(base_intensity, 60)  # Ensure minimum light when motion detected
        
        return {
            'recommended_intensity': max(0, min(100, base_intensity)),
            'lights_should_be_on': base_intensity > 15,
            'confidence': min(1.0, abs(base_intensity - 50) / 50)
        }
    
    def get_feature_importance(self):
        """Get feature importance from the trained model"""
        if not self.is_trained:
            return None
        
        feature_names = [
            'tempmax', 'tempmin', 'temp', 'humidity', 'sealevelpressure',
            'cloudcover', 'visibility', 'solarradiation', 'windspeed',
            'precipprob', 'hour', 'day_of_year', 'month', 'is_weekend',
            'daylight_duration', 'natural_light_index', 'weather_severity'
        ]
        
        importance_scores = self.light_intensity_model.feature_importances_
        feature_importance = dict(zip(feature_names, importance_scores))
        
        return sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)
    
    
    def debug_prediction(self, weather_features, external_data=None, sensor_data=None):
        """Debug prediction with detailed logging"""
        if not self.is_trained:
            raise ValueError("Model not trained yet!")

        print("=== PREDICTION DEBUG ===")
        print(f"Input features length: {len(weather_features)}")
        print(f"Expected features: {len(self.get_expected_features())}")

        # Feature mapping for debugging
        feature_names = [
            'tempmax', 'tempmin', 'temp', 'humidity', 'sealevelpressure',
            'cloudcover', 'visibility', 'solarradiation', 'windspeed',
            'precipprob', 'hour', 'day_of_year', 'month', 'is_weekend',
            'daylight_duration', 'natural_light_index', 'weather_severity'
        ]

        for i, (name, value) in enumerate(zip(feature_names, weather_features)):
            print(f"  {i:2d}. {name:20s}: {value:8.2f}")

        # Make base prediction
        base_intensity = self.light_intensity_model.predict([weather_features])[0]
        print(f"\nBase model prediction: {base_intensity:.2f}")

        # Apply adjustments step by step
        adjusted_intensity = base_intensity

        if external_data:
            aqi = external_data.get('air_quality', {}).get('aqi', 50)
            if aqi > 100:
                old_intensity = adjusted_intensity
                adjusted_intensity = min(100, adjusted_intensity * 1.2)
                print(f"AQI adjustment ({aqi}): {old_intensity:.2f} → {adjusted_intensity:.2f}")

            pedestrians = external_data.get('traffic_data', {}).get('pedestrian_count', 0)
            vehicles = external_data.get('traffic_data', {}).get('vehicle_count', 0)
            traffic_factor = (pedestrians + vehicles) / 20

            old_intensity = adjusted_intensity
            adjusted_intensity = min(100, adjusted_intensity + traffic_factor)
            print(f"Traffic adjustment ({pedestrians}p + {vehicles}v): {old_intensity:.2f} → {adjusted_intensity:.2f}")

        if sensor_data:
            ambient_light = sensor_data.get('ambient_light_sensor', 50)
            motion = sensor_data.get('motion_sensor', 0)

            old_intensity = adjusted_intensity
            if ambient_light < 20:
                adjusted_intensity = max(adjusted_intensity, 80)
            elif ambient_light > 70:
                adjusted_intensity = min(adjusted_intensity, 30)
            print(f"Ambient light adjustment ({ambient_light}): {old_intensity:.2f} → {adjusted_intensity:.2f}")

            if motion:
                old_intensity = adjusted_intensity
                adjusted_intensity = max(adjusted_intensity, 60)
                print(f"Motion detection adjustment: {old_intensity:.2f} → {adjusted_intensity:.2f}")

        final_intensity = max(0, min(100, adjusted_intensity))
        print(f"\nFinal intensity: {final_intensity:.2f}")
        print("=== END DEBUG ===\n")

        return {
            'recommended_intensity': final_intensity,
            'lights_should_be_on': final_intensity > 15,
            'confidence': min(1.0, abs(final_intensity - 50) / 50),
            'debug_info': {
                'base_prediction': base_intensity,
                'final_prediction': final_intensity,
                'adjustments_applied': adjusted_intensity != base_intensity
            }
        }

    def get_expected_features(self):
        """Return the expected feature names in order"""
        return [
            'tempmax', 'tempmin', 'temp', 'humidity', 'sealevelpressure',
            'cloudcover', 'visibility', 'solarradiation', 'windspeed',
            'precipprob', 'hour', 'day_of_year', 'month', 'is_weekend',
            'daylight_duration', 'natural_light_index', 'weather_severity'
        ]

    def validate_features(self, weather_features):
        """Validate that features are in expected ranges"""
        feature_names = self.get_expected_features()
        expected_ranges = {
            'tempmax': (-10, 50),
            'tempmin': (-20, 40),
            'temp': (-15, 45),
            'humidity': (0, 100),
            'sealevelpressure': (900, 1100),
            'cloudcover': (0, 100),
            'visibility': (0, 50),
            'solarradiation': (0, 1000),
            'windspeed': (0, 100),
            'precipprob': (0, 100),
            'hour': (0, 23),
            'day_of_year': (1, 366),
            'month': (1, 12),
            'is_weekend': (0, 1),
            'daylight_duration': (8, 16),
            'natural_light_index': (0, 1000),
            'weather_severity': (0, 1)
        }

        warnings = []
        for i, (name, value) in enumerate(zip(feature_names, weather_features)):
            if name in expected_ranges:
                min_val, max_val = expected_ranges[name]
                if not (min_val <= value <= max_val):
                    warnings.append(f"Feature '{name}' value {value} is outside expected range [{min_val}, {max_val}]")

        return warnings
               
        
        
def example_usage():
    """
    Example usage with actual CSV data using current date - WITH DEBUGGING
    """
    # Initialize system
    streetlight_system = StreetlightMLSystem()
    
    try:
        print("Loading your actual weather data...")
        
        # Load your CSV file
        df_raw = pd.read_csv('harareweather2.csv')
        print(f"✓ Loaded {len(df_raw)} records from harareweather2.csv")
        print(f"Columns found: {df_raw.columns.tolist()}")
        
        # Show sample of raw data
        print("\nSample of raw data:")
        print(df_raw.head(2))
        
        # Apply feature engineering
        print("\nCreating features from data...")
        df = create_features(df_raw)
        print(f"✓ Feature engineering complete. Shape: {df.shape}")
        
        # Show sample of processed data
        print("\nSample of processed data:")
        print(df[['datetime', 'temp', 'cloudcover', 'natural_light_index', 'weather_severity']].head(2))
        
        # Train the model
        print("\nTraining streetlight control model...")
        performance = streetlight_system.train_models(df)
        print(f"✓ Model training complete!")
        
        # Get feature importance
        print("\nTop Feature Importances:")
        importance = streetlight_system.get_feature_importance()
        if importance:
            for feature, score in importance[:5]:
                print(f"  {feature}: {score:.3f}")
        
        # Make a prediction using current date data from your CSV
        print("\nMaking prediction with current date data...")
        
        # Get current date
        from datetime import datetime
        current_date = datetime.now().date()
        
        # Convert datetime column to date for comparison
        df['date_only'] = pd.to_datetime(df['datetime']).dt.date
        
        # Find rows matching current date
        current_date_rows = df[df['date_only'] == current_date]
        
        # Variable to store the data we'll use for prediction
        sample_row = None
        actual_date_used = None
        
        if current_date_rows.empty:
            print(f"⚠️  No data found for current date ({current_date})")
            print("Available date range in your CSV:")
            print(f"  Earliest: {df['date_only'].min()}")
            print(f"  Latest: {df['date_only'].max()}")
            
            # Since we don't have current date data, let's use today's date but with historical weather patterns
            print(f"\n🔄 Creating prediction for current date using historical patterns...")
            
            # Get current month and day
            current_month = current_date.month
            current_day = current_date.day
            
            # Find historical data for same month/day
            df['month_from_date'] = pd.to_datetime(df['datetime']).dt.month
            df['day_from_date'] = pd.to_datetime(df['datetime']).dt.day
            
            historical_same_date = df[(df['month_from_date'] == current_month) & (df['day_from_date'] == current_day)]
            
            if not historical_same_date.empty:
                print(f"✓ Found {len(historical_same_date)} historical records for same date (month: {current_month}, day: {current_day})")
                # Use the most recent year's data for this date
                sample_row = historical_same_date.iloc[-1].copy()
                # Update the datetime to current date
                sample_row['datetime'] = pd.to_datetime(f"{current_date} {sample_row['datetime'].strftime('%H:%M:%S')}")
                actual_date_used = current_date
            else:
                print(f"❌ No historical data found for same date. Using most recent available data...")
                most_recent_date = df['date_only'].max()
                most_recent_rows = df[df['date_only'] == most_recent_date]
                sample_row = most_recent_rows.iloc[0]
                actual_date_used = most_recent_date
        else:
            print(f"✓ Found {len(current_date_rows)} records for current date ({current_date})")
            sample_row = current_date_rows.iloc[0]
            actual_date_used = current_date
        
        # Ensure we have a valid sample_row
        if sample_row is None:
            print("❌ Could not find any suitable data for prediction")
            return
        
        # DEBUG: Show the sample row we're using
        print(f"\n=== DEBUG: Sample Row Used ===")
        print(f"Date: {sample_row['datetime']}")
        print(f"Temperature: {sample_row['temp']:.1f}°C")
        print(f"Cloud cover: {sample_row['cloudcover']:.1f}%")
        print(f"Natural light index: {sample_row['natural_light_index']:.2f}")
        print(f"Weather severity: {sample_row['weather_severity']:.2f}")
        print(f"Hour: {sample_row['hour']}")
        print(f"Is weekend: {sample_row['is_weekend']}")
        
        # Extract features from the sample row
        sample_features = [
            sample_row['tempmax'],
            sample_row['tempmin'], 
            sample_row['temp'],
            sample_row['humidity'],
            sample_row['sealevelpressure'],
            sample_row['cloudcover'],
            sample_row['visibility'],
            sample_row['solarradiation'],
            sample_row['windspeed'],
            sample_row['precipprob'],
            sample_row['hour'],
            sample_row['day_of_year'],
            sample_row['month'],
            int(sample_row['is_weekend']),
            sample_row['daylight_duration'],
            sample_row['natural_light_index'],
            sample_row['weather_severity']
        ]
        
        # DEBUG: Validate features
        print(f"\n=== DEBUG: Feature Validation ===")
        feature_names = [
            'tempmax', 'tempmin', 'temp', 'humidity', 'sealevelpressure',
            'cloudcover', 'visibility', 'solarradiation', 'windspeed',
            'precipprob', 'hour', 'day_of_year', 'month', 'is_weekend',
            'daylight_duration', 'natural_light_index', 'weather_severity'
        ]
        
        print(f"Number of features: {len(sample_features)}")
        print("Feature values:")
        for i, (name, value) in enumerate(zip(feature_names, sample_features)):
            print(f"  {i:2d}. {name:20s}: {value:8.2f}")
        
        # Check for any NaN or invalid values
        nan_features = [i for i, val in enumerate(sample_features) if pd.isna(val)]
        if nan_features:
            print(f"⚠️  Found NaN values in features: {[feature_names[i] for i in nan_features]}")
            # Replace NaN with defaults
            for i in nan_features:
                sample_features[i] = 0.0
                print(f"  Replaced {feature_names[i]} NaN with 0.0")
        
        # Get external and sensor data
        print(f"\n=== DEBUG: External Data ===")
        external_data = streetlight_system.get_external_api_data()
        print(f"External data: {external_data}")
        
        print(f"\n=== DEBUG: Sensor Data ===")
        sensor_data = streetlight_system.simulate_iot_sensor_data()
        print(f"Sensor data: {sensor_data}")
        
        # Make prediction with debugging
        print(f"\n=== DEBUG: Making Prediction ===")
        try:
            # First, try a simple prediction without external data
            simple_prediction = streetlight_system.light_intensity_model.predict([sample_features])[0]
            print(f"Raw model prediction: {simple_prediction:.2f}")
            
            # Now make full prediction
            prediction = streetlight_system.make_prediction(
                sample_features, 
                external_data, 
                sensor_data
            )
            print(f"Full prediction result: {prediction}")
            
        except Exception as pred_error:
            print(f"❌ Prediction failed: {str(pred_error)}")
            import traceback
            traceback.print_exc()
            
            # Try with default values
            print("\n🔄 Trying with default feature values...")
            default_features = [
                25.0, 15.0, 20.0, 70.0, 1013.25, 30.0, 10.0, 300.0, 15.0, 20.0,
                14, 150, 6, 0, 12.0, 210.0, 0.3
            ]
            
            try:
                default_prediction = streetlight_system.make_prediction(default_features)
                print(f"✓ Default prediction works: {default_prediction}")
            except Exception as default_error:
                print(f"❌ Even default prediction failed: {str(default_error)}")
                return
        
        print(f"\n=== Streetlight Control Prediction ===")
        print(f"Prediction Date: {actual_date_used}")
        print(f"Data Source Date: {sample_row['datetime'].strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Weather conditions:")
        print(f"  Temperature: {sample_row['temp']:.1f}°C (max: {sample_row['tempmax']:.1f}°C)")
        print(f"  Cloud cover: {sample_row['cloudcover']:.1f}%")
        print(f"  Solar radiation: {sample_row['solarradiation']:.1f}")
        print(f"  Visibility: {sample_row['visibility']:.1f} km")
        print(f"\nRecommendations:")
        print(f"  Light Intensity: {prediction['recommended_intensity']:.1f}%")
        print(f"  Lights Should Be On: {'Yes' if prediction['lights_should_be_on'] else 'No'}")
        print(f"  Confidence: {prediction['confidence']:.2f}")
        
        print(f"\n=== Model Performance ===")
        print(f"Mean Absolute Error: {performance['mae']:.2f}%")
        print(f"R² Score: {performance['r2']:.3f}")
        
        # Test with multiple samples
        print(f"\n=== Testing Multiple Samples ===")
        test_samples = df.sample(min(5, len(df))).copy()
        
        for idx, row in test_samples.iterrows():
            test_features = [
                row['tempmax'], row['tempmin'], row['temp'], row['humidity'],
                row['sealevelpressure'], row['cloudcover'], row['visibility'],
                row['solarradiation'], row['windspeed'], row['precipprob'],
                row['hour'], row['day_of_year'], row['month'], int(row['is_weekend']),
                row['daylight_duration'], row['natural_light_index'], row['weather_severity']
            ]
            
            try:
                test_pred = streetlight_system.make_prediction(test_features)
                print(f"Sample {idx}: Temp={row['temp']:.1f}°C, Cloud={row['cloudcover']:.0f}% → Intensity={test_pred['recommended_intensity']:.1f}%")
            except Exception as e:
                print(f"Sample {idx}: Failed - {str(e)}")
        
        print(f"\n✓ Successfully processed your actual weather data!")
        
    except FileNotFoundError:
        print("❌ Error: 'harareweather2.csv' file not found!")
        print("Please make sure the file is in the same directory as your script.")
    except Exception as e:
        print(f"❌ Error processing your data: {str(e)}")
        import traceback
        traceback.print_exc()
        print("\nPlease check your CSV file format and try again.")

# Additional debugging function
def debug_model_directly():
    """
    Direct model debugging without CSV dependency
    """
    print("=== DIRECT MODEL DEBUG ===")
    
    # Create a simple test dataset
    test_data = {
        'datetime': pd.date_range('2024-01-01', periods=100, freq='D'),
        'tempmax': np.random.uniform(15, 35, 100),
        'tempmin': np.random.uniform(5, 25, 100),
        'temp': np.random.uniform(10, 30, 100),
        'humidity': np.random.uniform(30, 90, 100),
        'sealevelpressure': np.random.uniform(1000, 1020, 100),
        'cloudcover': np.random.uniform(0, 100, 100),
        'visibility': np.random.uniform(5, 15, 100),
        'solarradiation': np.random.uniform(100, 800, 100),
        'windspeed': np.random.uniform(0, 30, 100),
        'precipprob': np.random.uniform(0, 100, 100),
        'sunrise': pd.date_range('2024-01-01 06:00', periods=100, freq='D'),
        'sunset': pd.date_range('2024-01-01 18:00', periods=100, freq='D')
    }
    
    df_test = pd.DataFrame(test_data)
    
    # Initialize and train system
    system = StreetlightMLSystem()
    print("Training with synthetic data...")
    performance = system.train_models(df_test)
    print(f"Training complete. R² Score: {performance['r2']:.3f}")
    
    # Test prediction
    test_features = [
        25.0, 15.0, 20.0, 70.0, 1013.25, 30.0, 10.0, 300.0, 15.0, 20.0,
        14, 150, 6, 0, 12.0, 210.0, 0.3
    ]
    
    try:
        prediction = system.make_prediction(test_features)
        print(f"✓ Test prediction successful: {prediction}")
    except Exception as e:
        print(f"❌ Test prediction failed: {str(e)}")
        import traceback
        traceback.print_exc()
        
        
        
example_usage()