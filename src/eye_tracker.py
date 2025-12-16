import cv2
import mediapipe as mp
import numpy as np


class EyeTracker:
    """Light-weight wrapper around MediaPipe FaceMesh for eye landmark extraction."""

    def __init__(self, max_num_faces: int = 1, refine_landmarks: bool = True) -> None:
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            max_num_faces=max_num_faces,
            refine_landmarks=refine_landmarks,
            static_image_mode=False,
        )
        self._drawing_utils = mp.solutions.drawing_utils
        self._drawing_spec = self._drawing_utils.DrawingSpec(
            color=(0, 255, 0), thickness=1, circle_radius=1
        )

        # Pre-computed landmark indices for each eye (MediaPipe reference frame)
        self.left_eye_idx = [33, 133, 160, 159, 158, 157, 173, 246]
        self.right_eye_idx = [362, 263, 387, 386, 385, 384, 398, 466]

    def process_frame(self, frame):
        """Run face mesh on a BGR frame and return annotated frame + eye landmarks."""
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face_mesh.process(rgb)
        eye_landmarks = []

        if results.multi_face_landmarks:
            h, w = frame.shape[:2]
            for face_landmarks in results.multi_face_landmarks:
                # Draw the full tesselation for quick visual feedback
                self._drawing_utils.draw_landmarks(
                    frame,
                    face_landmarks,
                    self.mp_face_mesh.FACEMESH_TESSELATION,
                    landmark_drawing_spec=None,
                    connection_drawing_spec=self._drawing_spec,
                )

                # Extract pixel coordinates for left / right eyes
                for idx in self.left_eye_idx + self.right_eye_idx:
                    lm = face_landmarks.landmark[idx]
                    x, y = int(lm.x * w), int(lm.y * h)
                    eye_landmarks.append((idx, (x, y)))
                    cv2.circle(frame, (x, y), 2, (0, 255, 255), -1)

        return frame, eye_landmarks
