"""
VISUAR - Distance Calibrator
Focal-length–based distance estimation from face width in pixels.
"""


class DistanceCalibrator:
    """
    Pinhole-camera distance model.

    Formula
    -------
    Calibration : focal_length = (face_px * known_dist) / real_face_cm
    Estimation  : distance     = (real_face_cm * focal_length) / face_px
    """

    REAL_FACE_WIDTH_CM: float = 15.0   # average adult inter-cheek width
    DEFAULT_DISTANCE_CM: float = 60.0  # assumed distance before calibration

    def __init__(self):
        # Bootstrap focal length from a sensible default so the module
        # returns plausible values even before the user calibrates.
        self._focal_length: float = self._bootstrap_focal()
        self._calibrated: bool = False
        print(
            f"[Calibrator] Bootstrap focal length: {self._focal_length:.1f} px "
            f"(assumed distance {self.DEFAULT_DISTANCE_CM} cm, "
            f"face width {self.REAL_FACE_WIDTH_CM} cm)"
        )

    # ──────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────

    def calibrate(self, face_px: float, known_distance_cm: float) -> None:
        """
        Compute and store focal length from a measurement at a known distance.

        Parameters
        ----------
        face_px           : face width in pixels at calibration moment
        known_distance_cm : actual distance from camera to face
        """
        if face_px <= 0 or known_distance_cm <= 0:
            print("[Calibrator] Skipping calibration: invalid inputs.")
            return

        self._focal_length = (face_px * known_distance_cm) / self.REAL_FACE_WIDTH_CM
        self._calibrated = True
        print(
            f"[Calibrator] Calibrated → focal_length={self._focal_length:.2f} px "
            f"(face_px={face_px:.1f}, dist={known_distance_cm} cm)"
        )

    def estimate(self, face_px: float) -> float:
        """
        Estimate distance in centimetres from the current face width in pixels.

        Parameters
        ----------
        face_px : face width in pixels

        Returns
        -------
        Estimated distance in centimetres (clamped to [5, 300]).
        """
        if face_px <= 0:
            return 300.0

        distance = (self.REAL_FACE_WIDTH_CM * self._focal_length) / face_px
        return max(5.0, min(distance, 300.0))

    @property
    def is_calibrated(self) -> bool:
        return self._calibrated

    @property
    def focal_length(self) -> float:
        return self._focal_length

    # ──────────────────────────────────────────
    # Internal helpers
    # ──────────────────────────────────────────

    def _bootstrap_focal(self) -> float:
        """
        Estimate focal length assuming a 640-wide frame where the face occupies
        roughly 1/4 of the width (~160 px) at DEFAULT_DISTANCE_CM.
        """
        assumed_face_px = 160.0
        return (assumed_face_px * self.DEFAULT_DISTANCE_CM) / self.REAL_FACE_WIDTH_CM