// General adult reference ranges for flagging readings.
// These are broad screening ranges, not a diagnosis. The app always shows them with a disclaimer.

const VITAL_TYPES = {
  blood_pressure: { label: 'Blood Pressure', unit: 'mmHg', min: 40, max: 300, min2: 20, max2: 200 },
  heart_rate: { label: 'Heart Rate', unit: 'bpm', min: 20, max: 250 },
  blood_sugar: { label: 'Blood Sugar', unit: 'mg/dL', min: 10, max: 800 },
  weight: { label: 'Weight', unit: 'kg', min: 1, max: 400 },
  temperature: { label: 'Temperature', unit: '°C', min: 30, max: 45 },
  spo2: { label: 'Oxygen (SpO₂)', unit: '%', min: 50, max: 100 },
};

// Returns { level: 'normal'|'low'|'elevated'|'high'|'critical'|'info', label }
function classify(type, v1, v2, context) {
  switch (type) {
    case 'blood_pressure': {
      const s = v1, d = v2;
      if (s > 180 || d > 120) return { level: 'critical', label: 'Very high – seek urgent care' };
      if (s < 90 || d < 60) return { level: 'low', label: 'Low' };
      if (s >= 140 || d >= 90) return { level: 'high', label: 'High (stage 2)' };
      if (s >= 130 || d >= 80) return { level: 'high', label: 'High (stage 1)' };
      if (s >= 120) return { level: 'elevated', label: 'Elevated' };
      return { level: 'normal', label: 'Normal' };
    }
    case 'heart_rate':
      if (v1 > 130 || v1 < 40) return { level: 'critical', label: v1 > 130 ? 'Very fast' : 'Very slow' };
      if (v1 > 100) return { level: 'high', label: 'Fast (resting)' };
      if (v1 < 60) return { level: 'low', label: 'Slow (can be normal if athletic)' };
      return { level: 'normal', label: 'Normal' };
    case 'blood_sugar': {
      if (v1 < 54) return { level: 'critical', label: 'Very low – treat now' };
      if (v1 < 70) return { level: 'low', label: 'Low' };
      if (v1 > 300) return { level: 'critical', label: 'Very high' };
      if (context === 'fasting') {
        if (v1 >= 126) return { level: 'high', label: 'High (fasting)' };
        if (v1 >= 100) return { level: 'elevated', label: 'Elevated (fasting)' };
        return { level: 'normal', label: 'Normal (fasting)' };
      }
      if (v1 >= 200) return { level: 'high', label: 'High' };
      if (v1 >= 140) return { level: 'elevated', label: 'Elevated' };
      return { level: 'normal', label: 'Normal' };
    }
    case 'temperature':
      if (v1 >= 39.5) return { level: 'critical', label: 'High fever' };
      if (v1 >= 38) return { level: 'high', label: 'Fever' };
      if (v1 >= 37.3) return { level: 'elevated', label: 'Slightly raised' };
      if (v1 < 35) return { level: 'critical', label: 'Very low – seek care' };
      if (v1 < 36) return { level: 'low', label: 'Low' };
      return { level: 'normal', label: 'Normal' };
    case 'spo2':
      if (v1 < 90) return { level: 'critical', label: 'Very low – seek urgent care' };
      if (v1 < 95) return { level: 'low', label: 'Below normal' };
      return { level: 'normal', label: 'Normal' };
    default:
      return { level: 'info', label: '' };
  }
}

module.exports = { VITAL_TYPES, classify };
