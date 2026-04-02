"""
VISUAR - Vision Module
Main class for face detection, distance estimation, and eye state detection.
Uses MediaPipe Tasks API (LIVE_STREAM mode) with async detection.
"""

from __future__ import annotations

import cv2
import numpy as np
import threading
import time
import os
from typing import Optional, Dict, Any

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision
from mediapipe.tasks.python.vision.face_landmarker import FaceLandmarkerResult

from calibrator import DistanceCalibrator


mp_hands = mp.solutions.hands


# ──────────────────────────────────────────────
# Landmark indices
# ──────────────────────────────────────────────
FACE_WIDTH_LEFT  = 234   # left cheek landmark
FACE_WIDTH_RIGHT = 454   # right cheek landmark

# Eye landmarks (MediaPipe 478-point mesh)
LEFT_EYE_INDICES  = [33, 160, 158, 133, 153, 144]
RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380]

EAR_THRESHOLD = 0.17


def _ear(landmarks, indices, img_w: int, img_h: int) -> float:
    """Compute Eye Aspect Ratio for a set of 6 landmark indices."""
    pts = []
    for i in indices:
        lm = landmarks[i]
        pts.append(np.array([lm.x * img_w, lm.y * img_h]))

    # |P2-P6|
    A = np.linalg.norm(pts[1] - pts[5])
    # |P3-P5|
    B = np.linalg.norm(pts[2] - pts[4])
    # |P1-P4|
    C = np.linalg.norm(pts[0] - pts[3])

    if C < 1e-6:
        return 0.0
    return (A + B) / (2.0 * C)


class VisionModule:
    """
    Async, non-blocking face analysis module for VISUAR.

    Usage
    -----
    vm = VisionModule()
    vm.start()
    result = vm.process_frame(bgr_frame)
    vm.stop()
    """

    MODEL_PATH = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "face_landmarker.task")
    )

    def __init__(self):
        self._landmarker: "Optional[mp_vision.FaceLandmarker]" = None
        
        # Hand detector
        self._hands = mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        
        self._calibrator = DistanceCalibrator()

        # Latest result from the async callback
        self._latest_result: Optional[FaceLandmarkerResult] = None
        self._result_lock = threading.Lock()
        self._result_ts: float = 0.0

        # Frame skipping
        self._frame_counter = 0
        self._skip_n = 2          # process every Nth frame

        self._running = False
        print("[VisionModule] Initialized (model not yet loaded).")

    # ──────────────────────────────────────────
    # Lifecycle
    # ──────────────────────────────────────────

    def start(self) -> None:
        """Lazy-load the MediaPipe model and start processing."""
        self._load_model()
        self._running = True
        print("[VisionModule] Started.")

    def stop(self) -> None:
        self._running = False
        if self._landmarker:
            self._landmarker.close()
        print("[VisionModule] Stopped.")

    # ──────────────────────────────────────────
    # Model loading
    # ──────────────────────────────────────────

    def _load_model(self) -> None:
        if not os.path.isfile(self.MODEL_PATH):
            raise FileNotFoundError(
                f"[VisionModule] Model file not found: {self.MODEL_PATH}\n"
                "Download from: https://storage.googleapis.com/mediapipe-models/"
                "face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
            )

        print(f"[VisionModule] Loading model from: {self.MODEL_PATH}")
        with open(self.MODEL_PATH, "rb") as f:
            model_bytes = f.read()

        # On some Windows setups, model_asset_path can be incorrectly treated as
        # a relative path inside site-packages. Passing bytes avoids that issue.
        base_opts = mp_python.BaseOptions(model_asset_buffer=model_bytes)
        options = mp_vision.FaceLandmarkerOptions(
            base_options=base_opts,
            running_mode=mp_vision.RunningMode.LIVE_STREAM,
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
            result_callback=self._on_result,
        )
        self._landmarker = mp_vision.FaceLandmarker.create_from_options(options)
        print("[VisionModule] Model loaded successfully.")
        
    def _get_eye_regions(self, landmarks, w, h):
        # Approx bounding boxes for eyes
        left_pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in LEFT_EYE_INDICES]
        right_pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in RIGHT_EYE_INDICES]
    
        def bbox(pts):
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            x1, y1, x2, y2 = int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))
            # Expand the eye ROI so hand overlap is easier to detect.
            eye_w = max(1, x2 - x1)
            eye_h = max(1, y2 - y1)
            pad_x = int(eye_w * 0.35) + 2
            pad_y = int(eye_h * 0.6) + 2
            return x1 - pad_x, y1 - pad_y, x2 + pad_x, y2 + pad_y
    
        return bbox(left_pts), bbox(right_pts)
    
    def _detect_hand_boxes(self, frame):
        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        hand_result = self._hands.process(rgb)

        boxes = []
        if not hand_result.multi_hand_landmarks:
            return boxes

        for hand_landmarks in hand_result.multi_hand_landmarks:
            xs = [lm.x * w for lm in hand_landmarks.landmark]
            ys = [lm.y * h for lm in hand_landmarks.landmark]
            x1, y1, x2, y2 = int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))

            # Slightly inflate box to capture partial eye covering.
            hand_w = max(1, x2 - x1)
            hand_h = max(1, y2 - y1)
            pad_x = int(hand_w * 0.12) + 2
            pad_y = int(hand_h * 0.12) + 2
            boxes.append((x1 - pad_x, y1 - pad_y, x2 + pad_x, y2 + pad_y))

        return boxes

    @staticmethod
    def _eye_box_overlapped(eye_box, other_box, min_eye_overlap: float = 0.25) -> bool:
        ex1, ey1, ex2, ey2 = eye_box
        ox1, oy1, ox2, oy2 = other_box

        ix1 = max(ex1, ox1)
        iy1 = max(ey1, oy1)
        ix2 = min(ex2, ox2)
        iy2 = min(ey2, oy2)

        if ix2 <= ix1 or iy2 <= iy1:
            return False

        inter_area = float((ix2 - ix1) * (iy2 - iy1))
        eye_area = float(max(1, (ex2 - ex1) * (ey2 - ey1)))
        return (inter_area / eye_area) >= min_eye_overlap

    def _is_eye_occluded(self, frame, eye_box, hand_boxes=None):
        x1, y1, x2, y2 = eye_box
    
        h, w = frame.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
    
        if x2 <= x1 or y2 <= y1:
            return False

        if hand_boxes:
            eye_box = (x1, y1, x2, y2)
            if any(self._eye_box_overlapped(eye_box, hb) for hb in hand_boxes):
                return True
    
        roi = frame[y1:y2, x1:x2]
    
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    
        # Texture fallback for non-hand occlusions.
        variance = np.var(gray)
        mean_intensity = np.mean(gray)
    
        return (variance < 120) and (mean_intensity < 150)

    # ──────────────────────────────────────────
    # Async callback
    # ──────────────────────────────────────────

    def _on_result(
        self,
        result: FaceLandmarkerResult,
        output_image: mp.Image,
        timestamp_ms: int,
    ) -> None:
        with self._result_lock:
            self._latest_result = result
            self._result_ts = timestamp_ms

    # ──────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────

    def process_frame(self, bgr_frame: np.ndarray) -> Dict[str, Any]:
        """
        Submit a BGR frame for async analysis and return the latest result.

        Returns
        -------
        dict with keys:
            face_detected   : bool
            distance_cm     : float | None
            distance_status : "too_close" | "ok" | "too_far"
            eye_state       : "both_open" | "both_closed" |
                              "left_covered" | "right_covered"
        """
        if not self._running or self._landmarker is None:
            return self._empty_result()

        self._frame_counter += 1
        if self._frame_counter % self._skip_n == 0:
            self._submit_frame(bgr_frame)

        return self._build_output(bgr_frame)

    def calibrate(self, bgr_frame: np.ndarray, known_distance_cm: float = 50.0) -> bool:
        """Calibrate using the current frame at a known distance."""
        result = self._get_latest_result()
        if result is None or not result.face_landmarks:
            return False

        h, w = bgr_frame.shape[:2]
        landmarks = result.face_landmarks[0]
        face_w_px = self._face_width_px(landmarks, w, h)
        if face_w_px is None:
            return False

        self._calibrator.calibrate(face_w_px, known_distance_cm)
        return True

    # ──────────────────────────────────────────
    # Internal helpers
    # ──────────────────────────────────────────

    def _submit_frame(self, bgr_frame: np.ndarray) -> None:
        rgb = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        ts_ms = int(time.time() * 1000)
        try:
            self._landmarker.detect_async(mp_image, ts_ms)
        except Exception as exc:
            print(f"[VisionModule] detect_async error: {exc}")

    def _get_latest_result(self) -> Optional[FaceLandmarkerResult]:
        with self._result_lock:
            return self._latest_result

    def _build_output(self, bgr_frame: np.ndarray) -> Dict[str, Any]:
        result = self._get_latest_result()

        if result is None or not result.face_landmarks:
            return self._empty_result()

        h, w = bgr_frame.shape[:2]
        landmarks = result.face_landmarks[0]

        # ── Distance ──────────────────────────
        face_w_px = self._face_width_px(landmarks, w, h)
        if face_w_px is not None:
            distance_cm = self._calibrator.estimate(face_w_px)
            distance_status = self._classify_distance(distance_cm)
        else:
            distance_cm = None
            distance_status = "too_far"

        # ── Eye state ─────────────────────────
        left_ear  = _ear(landmarks, LEFT_EYE_INDICES,  w, h)
        right_ear = _ear(landmarks, RIGHT_EYE_INDICES, w, h)
        # Eye regions
        left_box, right_box = self._get_eye_regions(landmarks, w, h)
        hand_boxes = self._detect_hand_boxes(bgr_frame)
        
        left_occ  = self._is_eye_occluded(bgr_frame, left_box, hand_boxes)
        right_occ = self._is_eye_occluded(bgr_frame, right_box, hand_boxes)
        
        # PRIORITY: real occlusion
        if left_occ and right_occ:
            eye_state = "both_covered"
        elif left_occ:
            eye_state = "left_covered"
        elif right_occ:
            eye_state = "right_covered"
        else:
            eye_state = self._classify_eye(left_ear, right_ear)

        return {
            "face_detected":   True,
            "distance_cm":     round(distance_cm, 1) if distance_cm is not None else None,
            "distance_status": distance_status,
            "eye_state":       eye_state,
        }

    @staticmethod
    def _face_width_px(
        landmarks, img_w: int, img_h: int
    ) -> Optional[float]:
        try:
            lx = landmarks[FACE_WIDTH_LEFT].x  * img_w
            rx = landmarks[FACE_WIDTH_RIGHT].x * img_w
            return abs(rx - lx)
        except (IndexError, AttributeError):
            return None

    @staticmethod
    def _classify_distance(d: float) -> str:
        if d < 40:
            return "too_close"
        if d <= 80:
            return "ok"
        return "too_far"

    @staticmethod
    def _classify_eye(left_ear: float, right_ear: float) -> str:
        # Strong thresholds
        CLOSED = 0.20
        COVERED = 0.05   # much lower → likely occlusion
    
        left_closed  = left_ear  < CLOSED
        right_closed = right_ear < CLOSED
    
        left_covered  = left_ear  < COVERED
        right_covered = right_ear < COVERED
    
        # ── COVERED detection (priority) ──
        if left_covered and right_covered:
            return "both_covered"
    
        if left_covered:
            return "left_covered"
    
        if right_covered:
            return "right_covered"
    
        # ── Normal blink logic ──
        if left_closed and right_closed:
            return "both_closed"
    
        if left_ear > 0.16 and right_ear > 0.16:
            return "both_open"
    
        # asymmetric blink (rare but possible)
        if left_closed:
            return "left_closed"
    
        return "right_closed"

    @staticmethod
    def _empty_result() -> Dict[str, Any]:
        return {
            "face_detected":   False,
            "distance_cm":     None,
            "distance_status": "too_far",
            "eye_state":       "both_open",
        }