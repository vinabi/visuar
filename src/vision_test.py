"""Vision screening loop built on the smart gaze pipeline.

This script runs:
1) Optional dataset bootstrap (dataset-002)
2) User calibration (3x3 grid)
3) A Landolt-C style acuity screening that measures how closely the gaze
   follows small optotypes at random positions/sizes.

It borrows logic from the existing gaze pipeline (MediaPipe iris features,
Ridge mapping) and adds a lightweight acuity heuristic based on gaze error
vs. target size. It avoids pulling in full external code to keep things lean.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import List, Sequence, Tuple

import cv2
import numpy as np

from src.gaze_pipeline import (
    DATASET_ROOT,
    CalibrationModel,
    EyeFeatureExtractor,
    _get_screen_size,
    _smooth,
    collect_calibration_samples,
    load_dataset_features,
)


@dataclass
class Stimulus:
    logmar: float  # logMAR acuity line (1.0 = 20/200, 0.0 = 20/20)
    size_px: int
    gap_angle_deg: int
    position_norm: Tuple[float, float]


def _landolt_c(size: int, gap_angle: int = 0, thickness: int = 4) -> np.ndarray:
    """Create a simple Landolt C patch."""
    img = np.ones((size, size, 3), dtype=np.uint8) * 255
    center = size // 2
    radius_outer = size // 2 - thickness
    radius_inner = radius_outer - thickness
    cv2.circle(img, (center, center), radius_outer, (0, 0, 0), thickness)
    # Carve the gap
    start_angle = gap_angle - 20
    end_angle = gap_angle + 20
    cv2.ellipse(img, (center, center), (radius_outer, radius_outer), 0, start_angle, end_angle, (255, 255, 255), thickness + 2)
    cv2.circle(img, (center, center), radius_inner, (255, 255, 255), -1)
    return img


def _generate_stimuli(screen_w: int, screen_h: int) -> List[Stimulus]:
    """Create a descending set of optotypes with randomised positions."""
    # Rough mapping: smaller logMAR -> smaller size; calibrated for ~60cm viewing
    logmar_lines = [1.0, 0.8, 0.6, 0.4, 0.3, 0.2, 0.1, 0.0]
    stimuli: List[Stimulus] = []
    for logmar in logmar_lines:
        # Base size in degrees -> pixels (approx; 5 arcmin at 0.0 logMAR)
        size_deg = 5 * (10 ** logmar) / 60.0
        # Assume 60 cm viewing distance and 96 PPI screen -> px per degree ~ 34
        size_px = max(18, int(size_deg * 34))
        for _ in range(3):  # three trials per line
            pos = (random.uniform(0.2, 0.8), random.uniform(0.2, 0.8))
            gap = random.choice([0, 90, 180, 270])
            stimuli.append(Stimulus(logmar=logmar, size_px=size_px, gap_angle_deg=gap, position_norm=pos))
    return stimuli


def _place_patch(frame: np.ndarray, patch: np.ndarray, center: Tuple[int, int]) -> None:
    """Overlay patch onto frame with clipping."""
    h, w = frame.shape[:2]
    ph, pw = patch.shape[:2]
    x0 = max(0, center[0] - pw // 2)
    y0 = max(0, center[1] - ph // 2)
    x1 = min(w, x0 + pw)
    y1 = min(h, y0 + ph)
    # If the target is too close to the edge, the width/height may be zero.
    if x1 <= x0 or y1 <= y0:
        return
    patch_cropped = patch[: y1 - y0, : x1 - x0]
    # If cropping reduced patch dimensions to zero, bail out.
    if patch_cropped.size == 0:
        return
    frame[y0:y1, x0:x1] = patch_cropped


def run_vision_test() -> None:
    screen_w, screen_h = _get_screen_size()
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        raise RuntimeError("Could not open webcam. Ensure it is connected and free.")

    extractor = EyeFeatureExtractor()
    calibrator = CalibrationModel(alpha=1.2)

    # Optional dataset bootstrap
    train_dir = DATASET_ROOT / "Training"
    X_ds, y_ds = load_dataset_features(train_dir, extractor, max_samples=600)
    if len(X_ds):
        try:
            calibrator.fit(X_ds, y_ds)
            print(f"Bootstrapped calibrator with {len(X_ds)} samples.")
        except Exception:
            pass

    # User calibration
    X_cal, y_cal = collect_calibration_samples(
        cap,
        extractor,
        grid=((0.2, 0.2), (0.5, 0.2), (0.8, 0.2), (0.2, 0.5), (0.5, 0.5), (0.8, 0.5), (0.2, 0.8), (0.5, 0.8), (0.8, 0.8)),
        samples_per_point=8,
    )
    if len(X_cal):
        calibrator.fit(X_cal, y_cal)
    else:
        print("Calibration skipped; results may be unstable.")

    stimuli = _generate_stimuli(screen_w, screen_h)
    passed_lines: List[float] = []
    smoothing_state = None

    for stim in stimuli:
        target_px = (int(stim.position_norm[0] * screen_w), int(stim.position_norm[1] * screen_h))
        patch = _landolt_c(stim.size_px, stim.gap_angle_deg)
        gaze_errors: List[float] = []
        frames = 0
        while frames < 45:  # ~1.5s at 30fps
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
                    cv2.circle(annotated, (px, py), 8, (0, 200, 0), 2)
                    err = math.hypot(px - target_px[0], py - target_px[1]) / max(screen_w, screen_h)
                    gaze_errors.append(err)
            _place_patch(annotated, patch, target_px)
            cv2.putText(
                annotated,
                f"logMAR {stim.logmar:.1f} size {stim.size_px}px",
                (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255, 255, 255),
                2,
            )
            cv2.imshow("Vision Test", annotated)
            key = cv2.waitKey(1) & 0xFF
            if key == 27:
                cap.release()
                cv2.destroyAllWindows()
                return
            frames += 1

        if gaze_errors:
            median_err = float(np.median(gaze_errors))
            # Threshold: must be within ~1.2 * optotype half-size normalised
            allowed_err = (stim.size_px / 2) / max(screen_w, screen_h) * 1.2
            if median_err <= allowed_err:
                passed_lines.append(stim.logmar)
        else:
            # If no gaze data, treat as fail
            break

        # Stop if two failures at the same or larger size
        if len(passed_lines) and stim.logmar > min(passed_lines) and passed_lines.count(stim.logmar) == 0:
            break

    cap.release()
    cv2.destroyAllWindows()

    if passed_lines:
        best_logmar = min(passed_lines)
        snellen = 20 * (10 ** best_logmar)
        print(f"Estimated acuity: ~20/{int(snellen)} (logMAR {best_logmar:.2f})")
        if best_logmar <= 0.2:
            print("Feedback: Within typical range; maintain regular eye health checks.")
        elif best_logmar <= 0.4:
            print("Feedback: Mild reduction; consider formal refraction if symptomatic.")
        else:
            print("Feedback: Reduced acuity; recommend comprehensive eye exam.")
    else:
        print("Could not estimate acuity (insufficient gaze or calibration).")


if __name__ == "__main__":
    run_vision_test()
