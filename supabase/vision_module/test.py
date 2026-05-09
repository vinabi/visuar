"""
VISUAR - Webcam Demo
--------------------
Controls
  C    → Calibrate at ~50 cm (hold face steady at exactly 50 cm)
  ESC  → Exit
"""

import cv2
import time
import sys
import os
import mediapipe as mp

# Allow running from the repo root or from inside vision_module/
sys.path.insert(0, os.path.dirname(__file__))

from vision import VisionModule


# ──────────────────────────────────────────────────────────────
# Drawing helpers
# ──────────────────────────────────────────────────────────────

STATUS_COLORS = {
    "too_close": (0,   80, 255),
    "ok":        (0,  200,  80),
    "too_far":   (0, 160, 255),
}

EYE_COLORS = {
    "both_open":     (0, 220, 80),

    "both_closed":   (0,  80, 255),
    "left_closed":   (0, 120, 255),
    "right_closed":  (0, 120, 255),

    "left_covered":  (255, 180, 0),
    "right_covered": (255, 180, 0),
    "both_covered":  (255, 0, 0),
}

FONT       = cv2.FONT_HERSHEY_SIMPLEX
FONT_SCALE = 0.65
THICKNESS  = 2


def put_text(
    frame,
    text: str,
    y: int,
    color=(255, 255, 255),
    scale: float = FONT_SCALE,
) -> None:
    """Draw white-shadowed text for readability on any background."""
    x = 16
    # Shadow
    cv2.putText(frame, text, (x + 1, y + 1), FONT, scale, (0, 0, 0), THICKNESS + 1, cv2.LINE_AA)
    # Foreground
    cv2.putText(frame, text, (x, y), FONT, scale, color, THICKNESS, cv2.LINE_AA)


def draw_overlay(frame, result: dict, fps: float, calibrated: bool) -> None:
    h, w = frame.shape[:2]

    # ── Semi-transparent top bar ───────────────
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 140), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)

    # ── Face detected ─────────────────────────
    face_col = (0, 220, 80) if result["face_detected"] else (0, 80, 255)
    face_txt = "Face: DETECTED" if result["face_detected"] else "Face: NOT DETECTED"
    put_text(frame, face_txt, 28, face_col)

    # ── Distance ──────────────────────────────
    d = result["distance_cm"]
    dist_txt = f"Distance: {d:.1f} cm" if d is not None else "Distance: ---"
    dist_col = STATUS_COLORS.get(result["distance_status"], (200, 200, 200))
    status_txt = f"  [{result['distance_status'].replace('_', ' ').upper()}]"
    put_text(frame, dist_txt + status_txt, 60, dist_col)

    # ── Eye state ─────────────────────────────
    eye_col = EYE_COLORS.get(result["eye_state"], (200, 200, 200))
    eye_txt = f"Eyes: {result['eye_state'].replace('_', ' ').upper()}"
    put_text(frame, eye_txt, 92, eye_col)

    # ── FPS + calibration status ──────────────
    cal_str = "CALIBRATED" if calibrated else "NOT CALIBRATED (press C at 50 cm)"
    info_txt = f"FPS: {fps:.1f}   Cal: {cal_str}"
    put_text(frame, info_txt, 124, (160, 160, 160), scale=0.52)

    # ── Hint bar at bottom ────────────────────
    hint = "C = Calibrate at 50 cm    ESC = Quit"
    put_text(frame, hint, h - 12, (140, 140, 140), scale=0.48)


# ──────────────────────────────────────────────────────────────
# Main loop
# ──────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print(" VISUAR - Eye Testing Vision Module Demo")
    print("=" * 60)

    vm = VisionModule()
    vm.start()

    cap = cv2.VideoCapture(0, cv2.CAP_MSMF)
    print("Camera opened:", cap.isOpened())
    if not cap.isOpened():
        print("[Demo] ERROR: Cannot open camera.")
        vm.stop()
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1080)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    cap.set(cv2.CAP_PROP_FPS, 30)

    print("[Demo] Camera opened at 1080×720.")
    print("[Demo] Press C to calibrate, ESC to quit.\n")

    fps_timer = time.time()
    frame_count = 0
    fps = 0.0
    last_result = {
        "face_detected":   False,
        "distance_cm":     None,
        "distance_status": "too_far",
        "eye_state":       "both_open",
    }

    while True:
        ok, frame = cap.read()
        print("Frame read:", ok)
        if not ok:
            print("[Demo] Camera read failed — restarting camera...")
        
            cap.release()
            time.sleep(1)
        
            cap = cv2.VideoCapture(0, cv2.CAP_MSMF)
            time.sleep(1)
        
            if not cap.isOpened():
                print("[Demo] Camera reconnect FAILED")
                break
        
            continue

        frame = cv2.flip(frame, 1)

        # ── Analyse ───────────────────────────
        result = vm.process_frame(frame)
        
        # ── Draw face landmarks ──
        if vm._latest_result and vm._latest_result.face_landmarks:
            h, w = frame.shape[:2]
            for lm in vm._latest_result.face_landmarks[0]:
                x = int(lm.x * w)
                y = int(lm.y * h)
                cv2.circle(frame, (x, y), 1, (0, 255, 0), -1)
                
        
        # ── Draw hand landmarks ──
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        hand_results = vm._hands.process(rgb)
        
        if hand_results.multi_hand_landmarks:
            for hand_landmarks in hand_results.multi_hand_landmarks:
                mp.solutions.drawing_utils.draw_landmarks(
                    frame,
                    hand_landmarks,
                    mp.solutions.hands.HAND_CONNECTIONS,
                    mp.solutions.drawing_styles.get_default_hand_landmarks_style(),
                    mp.solutions.drawing_styles.get_default_hand_connections_style(),
                )
        
        
        if result["face_detected"]:
            last_result = result

        # ── FPS counter ───────────────────────
        frame_count += 1
        elapsed = time.time() - fps_timer
        if elapsed >= 1.0:
            fps = frame_count / elapsed
            frame_count = 0
            fps_timer = time.time()

        # ── Draw overlay ──────────────────────
        draw_overlay(frame, last_result, fps, vm._calibrator.is_calibrated)

        # ── Show ──────────────────────────────
        cv2.imshow("VISUAR - Vision Module", frame)

        # ── Key handling ──────────────────────
        key = cv2.waitKey(1) & 0xFF
        if key == 27:          # ESC
            print("[Demo] Exiting…")
            break
        elif key in (ord("c"), ord("C")):
            ok_cal = vm.calibrate(frame, known_distance_cm=50.0)
            if ok_cal:
                print("[Demo] Calibration SUCCESS at 50 cm.")
            else:
                print("[Demo] Calibration FAILED — no face detected, try again.")

    cap.release()
    cv2.destroyAllWindows()
    vm.stop()
    print("[Demo] Done.")


if __name__ == "__main__":
    main()