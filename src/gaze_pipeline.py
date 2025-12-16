"""Smart webcam-based eye tracking pipeline with calibration and dataset fusion.

This module combines lightweight MediaPipe face mesh landmarking, a simple
feature extractor around the irises, an optional dataset bootstrap, and a
ridge-regression calibration model to map eye features to screen coordinates.

It is intentionally dependency-light compared to the deep-learning baselines
found elsewhere in the repo (e.g., RT-GENE, webcam-eye-tracker), so you can
get a working prototype quickly and then swap in heavier models if desired.
"""
from __future__ import annotations

import pickle
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Tuple

import cv2
import mediapipe as mp
import numpy as np
from sklearn.linear_model import Ridge


# Paths for optional dataset bootstrapping
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATASET_ROOT = PROJECT_ROOT / "dataset-002"


def _get_screen_size() -> Tuple[int, int]:
    """Return screen width/height in pixels."""
    try:
        import ctypes  # Windows-friendly screen size detection

        user32 = ctypes.windll.user32
        return user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)
    except Exception:
        # Fallback to a safe default
        return 1280, 720


def _smooth(prev: Optional[np.ndarray], new: np.ndarray, alpha: float = 0.2) -> np.ndarray:
    """Simple exponential smoothing to stabilise jittery coordinates."""
    if prev is None:
        return new
    return (1 - alpha) * prev + alpha * new


@dataclass
class CalibrationModel:
    """Ridge-regression mapping from eye features to screen-normalised coords."""

    alpha: float = 1.0
    model: Ridge = field(init=False)
    is_fitted: bool = field(default=False, init=False)

    def __post_init__(self) -> None:
        self.model = Ridge(alpha=self.alpha)

    def fit(self, X: np.ndarray, y: np.ndarray) -> None:
        self.model.fit(X, y)
        self.is_fitted = True

    def predict(self, features: np.ndarray) -> Optional[np.ndarray]:
        if not self.is_fitted:
            return None
        return self.model.predict(features.reshape(1, -1))[0]

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as f:
            pickle.dump(self.model, f)

    def load(self, path: Path) -> bool:
        if not path.exists():
            return False
        with path.open("rb") as f:
            self.model = pickle.load(f)
        self.is_fitted = True
        return True


class EyeFeatureExtractor:
    """Feature extractor built on MediaPipe FaceMesh with iris refinement."""

    def __init__(self, max_num_faces: int = 1) -> None:
        self.mesh = mp.solutions.face_mesh.FaceMesh(
            max_num_faces=max_num_faces,
            refine_landmarks=True,
            static_image_mode=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.left_eye_idx = [33, 133, 159, 145]  # corners + top/bottom
        self.right_eye_idx = [362, 263, 386, 374]
        self.left_iris_idx = [468, 469, 470, 471, 472]
        self.right_iris_idx = [473, 474, 475, 476, 477]

    def _landmarks_to_points(
        self, face_landmarks, indices: Iterable[int], w: int, h: int
    ) -> np.ndarray:
        return np.array(
            [(face_landmarks.landmark[i].x * w, face_landmarks.landmark[i].y * h) for i in indices]
        )

    def extract(
        self, frame: np.ndarray, annotate: bool = True
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        """Return annotated frame and flattened feature vector or None."""
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.mesh.process(rgb)
        if not results.multi_face_landmarks:
            return frame, None

        face_landmarks = results.multi_face_landmarks[0]
        h, w = frame.shape[:2]

        left_eye = self._landmarks_to_points(face_landmarks, self.left_eye_idx, w, h)
        right_eye = self._landmarks_to_points(face_landmarks, self.right_eye_idx, w, h)
        left_iris = self._landmarks_to_points(face_landmarks, self.left_iris_idx, w, h)
        right_iris = self._landmarks_to_points(face_landmarks, self.right_iris_idx, w, h)

        left_center = left_iris.mean(axis=0)
        right_center = right_iris.mean(axis=0)

        # Eye bounding boxes
        left_min, left_max = left_eye.min(axis=0), left_eye.max(axis=0)
        right_min, right_max = right_eye.min(axis=0), right_eye.max(axis=0)

        # Normalise iris centers within their eye boxes to gain some head-pose invariance
        left_norm = (left_center - left_min) / (left_max - left_min + 1e-6)
        right_norm = (right_center - right_min) / (right_max - right_min + 1e-6)

        # Eye aspect ratios as a proxy for blink/occlusion
        def eye_aspect_ratio(eye_pts: np.ndarray) -> float:
            horiz = np.linalg.norm(eye_pts[0] - eye_pts[1])
            vert = np.linalg.norm(eye_pts[2] - eye_pts[3])
            return vert / (horiz + 1e-6)

        ear_left = eye_aspect_ratio(left_eye)
        ear_right = eye_aspect_ratio(right_eye)

        # Inter-pupil distance for scale normalisation
        interpupil = np.linalg.norm(left_center - right_center) / max(w, h)

        features = np.concatenate(
            [
                left_norm,  # 2
                right_norm,  # 2
                [ear_left, ear_right],
                [interpupil],
            ]
        ).astype(np.float32)

        if annotate:
            for pt in np.vstack([left_eye, right_eye, left_iris, right_iris]).astype(int):
                cv2.circle(frame, tuple(pt), 1, (0, 255, 255), -1)
            cv2.circle(frame, tuple(left_center.astype(int)), 2, (0, 200, 0), -1)
            cv2.circle(frame, tuple(right_center.astype(int)), 2, (0, 200, 0), -1)

        return frame, features


def _candidate_label_arrays(arr: np.lib.npyio.NpzFile) -> List[np.ndarray]:
    """Heuristically locate a 2D gaze label inside an npz payload."""
    preferred_keys = (
        "gaze",
        "gaze_point",
        "target",
        "screen_point",
        "point",
        "coords",
        "labels",
    )
    for key in preferred_keys:
        if key in arr.files:
            label = np.array(arr[key])
            if label.size >= 2:
                return [label.reshape(-1, 2)[0]]
    # Fall back: pick the first 2-long vector
    for key in arr.files:
        val = np.array(arr[key])
        if val.size >= 2 and val.ndim <= 2 and val.shape[-1] >= 2:
            return [val.reshape(-1, 2)[0]]
    return []


def load_dataset_features(
    root: Path, extractor: EyeFeatureExtractor, max_samples: int = 600
) -> Tuple[np.ndarray, np.ndarray]:
    """Load any usable samples from dataset-002 style npz/jpg pairs."""
    X: List[np.ndarray] = []
    y: List[np.ndarray] = []
    if not root.exists():
        return np.empty((0, 7)), np.empty((0, 2))

    npz_files = sorted(root.glob("*.npz"))
    for npz_file in npz_files[:max_samples]:
        try:
            payload = np.load(npz_file)
        except Exception:
            continue

        labels = _candidate_label_arrays(payload)
        if not labels:
            continue

        jpg_path = npz_file.with_suffix(".jpg")
        if not jpg_path.exists():
            continue

        frame = cv2.imread(str(jpg_path))
        if frame is None:
            continue
        _, features = extractor.extract(frame, annotate=False)
        if features is None:
            continue

        X.append(features)
        y.append(labels[0])

    if not X:
        return np.empty((0, 7)), np.empty((0, 2))

    X_arr = np.vstack(X)
    y_arr = np.vstack(y)

    # Normalise labels if they look like pixel coords
    if np.any(y_arr > 2.0):
        screen_w, screen_h = _get_screen_size()
        y_arr[:, 0] = y_arr[:, 0] / float(screen_w)
        y_arr[:, 1] = y_arr[:, 1] / float(screen_h)

    return X_arr, y_arr


def collect_calibration_samples(
    cap: cv2.VideoCapture,
    extractor: EyeFeatureExtractor,
    grid: Sequence[Tuple[float, float]],
    samples_per_point: int = 8,
) -> Tuple[np.ndarray, np.ndarray]:
    """Guide the user through a grid of points and capture stable feature/label pairs."""
    screen_w, screen_h = _get_screen_size()
    X: List[np.ndarray] = []
    y: List[np.ndarray] = []

    for gx, gy in grid:
        target_px = (int(gx * screen_w), int(gy * screen_h))
        collected = 0
        patience = 0
        while collected < samples_per_point and patience < 200:
            ok, frame = cap.read()
            if not ok:
                break
            annotated, features = extractor.extract(frame, annotate=True)
            cv2.circle(annotated, target_px, 14, (0, 0, 255), 2)
            cv2.putText(
                annotated,
                f"Look at the red dot ({collected+1}/{samples_per_point})",
                (12, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255, 255, 255),
                2,
            )
            cv2.imshow("Calibration", annotated)
            key = cv2.waitKey(1) & 0xFF
            if key == 27:  # ESC
                return np.array(X), np.array(y)

            if features is None:
                patience += 1
                continue

            X.append(features)
            y.append(np.array([gx, gy], dtype=np.float32))
            collected += 1

        # Small pause to let the user reposition gaze
        time.sleep(0.2)

    cv2.destroyWindow("Calibration")
    return np.array(X), np.array(y)


def run_smart_tracker(
    use_dataset_bootstrap: bool = True,
    calibration_grid: Sequence[Tuple[float, float]] = (
        (0.1, 0.1),
        (0.5, 0.1),
        (0.9, 0.1),
        (0.1, 0.5),
        (0.5, 0.5),
        (0.9, 0.5),
        (0.1, 0.9),
        (0.5, 0.9),
        (0.9, 0.9),
    ),
) -> None:
    """Main orchestration: optional dataset pre-fit, user calibration, then live tracking."""
    screen_w, screen_h = _get_screen_size()
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        raise RuntimeError("Could not open webcam. Ensure it is connected and free.")

    extractor = EyeFeatureExtractor()
    calibrator = CalibrationModel(alpha=1.2)

    # Optional dataset bootstrap to give the calibrator a head start
    if use_dataset_bootstrap:
        train_dir = DATASET_ROOT / "Training"
        X_ds, y_ds = load_dataset_features(train_dir, extractor, max_samples=600)
        if len(X_ds):
            try:
                calibrator.fit(X_ds, y_ds)
                print(f"Bootstrapped calibrator with {len(X_ds)} dataset samples.")
            except Exception:
                # Carry on with user calibration only
                pass

    # User-guided calibration to personalise mapping
    X_cal, y_cal = collect_calibration_samples(cap, extractor, calibration_grid)
    if len(X_cal):
        if calibrator.is_fitted:
            X_stack = np.vstack([X_cal])
            y_stack = np.vstack([y_cal])
            calibrator.fit(X_stack, y_stack)
        else:
            calibrator.fit(X_cal, y_cal)

    smoothing_state: Optional[np.ndarray] = None
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        annotated, features = extractor.extract(frame, annotate=True)

        if features is not None:
            pred = calibrator.predict(features)
            if pred is not None:
                smoothing_state = _smooth(smoothing_state, pred)
                px = int(smoothing_state[0] * screen_w)
                py = int(smoothing_state[1] * screen_h)
                cv2.circle(annotated, (px, py), 10, (0, 255, 0), 2)
                cv2.putText(
                    annotated,
                    f"Gaze: {px},{py}",
                    (12, annotated.shape[0] - 12),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 255, 0),
                    2,
                )
        cv2.imshow("Smart Eye Tracker", annotated)
        if cv2.waitKey(1) & 0xFF == 27:  # ESC
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    run_smart_tracker()
