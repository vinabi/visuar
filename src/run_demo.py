"""Quick-start script to visualise eye landmarks with a webcam."""
import cv2
from eye_tracker import EyeTracker

def main() -> None:
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)  # CAP_DSHOW for Windows reliability
    tracker = EyeTracker()

    if not cap.isOpened():
        raise RuntimeError("Could not open the default webcam. Is it connected and free?")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame, _ = tracker.process_frame(frame)
        cv2.imshow("Eye Tracking Demo – Press ESC to quit", frame)

        if cv2.waitKey(1) & 0xFF == 27:  # ESC key
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
