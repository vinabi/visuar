# VISUAR Vision Module

Real-time computer vision module for:
- Face detection
- Distance estimation in cm
- Eye state detection (open, closed, covered)
- Hand-over-eye occlusion detection

This project uses MediaPipe Tasks face landmarks in live stream mode and OpenCV for camera capture and rendering.

## Features

- Async face landmark inference with MediaPipe Tasks API
- Distance estimation with a focal-length calibrator
- Eye state classification:
  - both_open
  - both_closed
  - left_closed
  - right_closed
  - left_covered
  - right_covered
  - both_covered
- Mirror webcam preview (selfie view)
- On-screen overlay for face status, distance, eye state, FPS, and calibration state

## Project Structure

- calibrator.py: DistanceCalibrator class (focal-length model)
- vision.py: Core VisionModule (face landmarks, eye logic, occlusion)
- test.py: Webcam demo app with UI overlay
- face_landmarker.task: MediaPipe face landmarker model file
- req.txt: Python dependencies

## Requirements

- Python 3.9 to 3.12 recommended
- Webcam
- Windows/Linux/macOS

Install dependencies:

```bash
pip install -r req.txt
```

## Model File

The repository expects this file in the project root:

- face_landmarker.task

If missing, VisionModule raises a clear error with the official MediaPipe model URL.

## Run

```bash
python test.py
```

## Controls

- C: Calibrate at about 50 cm (keep face steady)
- ESC: Exit

## How It Works

### 1) Face landmarks

VisionModule loads the face landmarker in LIVE_STREAM mode and processes frames asynchronously.

### 2) Distance estimation

DistanceCalibrator uses a pinhole camera approximation:

- Calibration:

  focal_length = (face_width_px * known_distance_cm) / real_face_width_cm

- Estimation:

  distance_cm = (real_face_width_cm * focal_length) / face_width_px

Distance status is mapped as:
- too_close: < 40 cm
- ok: 40 to 80 cm
- too_far: > 80 cm

### 3) Eye state

Eye Aspect Ratio (EAR) is computed from eye landmarks for open/closed logic.

### 4) Eye occlusion by hand

Eye covering is detected by combining:
- Hand bounding box overlap with each eye ROI (primary)
- Texture fallback in eye ROI (secondary)

This improves robustness when a hand is placed over one or both eyes.

## Typical Output

Runtime result object:

```python
{
  "face_detected": True,
  "distance_cm": 57.4,
  "distance_status": "ok",
  "eye_state": "left_covered"
}
```

## Troubleshooting

### Camera does not open

- Close apps that might be using the webcam.
- Re-run the app.
- On Windows, verify camera privacy permissions.

### Model file not found

- Place face_landmarker.task in the same folder as test.py and vision.py.

### Poor distance accuracy

- Recalibrate by pressing C at a known 50 cm distance.
- Keep face centered and steady while calibrating.

### Hand covering not detected well

- Improve lighting.
- Keep hand in front of the eye region (not too far from face).
- Ensure at least one hand is visible enough for landmark detection.

## Notes

- Current demo includes debug drawing for face and hand landmarks.
- For production, you may remove debug drawing for better FPS.
