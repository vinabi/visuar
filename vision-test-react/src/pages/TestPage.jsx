import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Camera, CheckCircle2, Lock, Eye, EyeOff,
  AlertTriangle, Activity, Ruler, Mic
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

import { PPICalibrator } from "../components/PPICalibrator";
import { SnellenEngine } from "../components/SnellenEngine";

// ─── Constants ───────────────────────────────────────────
const ACUITY_LEVELS = ["6/60", "6/36", "6/24", "6/18", "6/12", "6/9", "6/6"];
const PRECHECK_LOCK_MS = 3000;
const WS_URL = "ws://localhost:8000/ws/vision";
const API_URL = "http://localhost:8000";
const EYE_VIOLATION_THRESHOLD_MS = 5000; // 5s of both-open → warning
const EYE_WARNING_COUNTDOWN_S = 5;       // 5s countdown before restart
const MAX_VIOLATIONS = 3;

export default function TestPage() {
  const { t } = useTranslation();
  const { isDarkMode } = useTheme();
  const { testId } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();

  // ─── Master State ────────────────────────────────────
  const [testPhase, setTestPhase] = useState("SETUP_PPI");
  const [ppi, setPpi] = useState(148);
  const [testingEye, setTestingEye] = useState("left");

  // Camera / WS
  const [cameraPermission, setCameraPermission] = useState("idle");
  const [visionResult, setVisionResult] = useState(null);
  const [fps, setFps] = useState(0);

  // Snellen state
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
  // Incremented whenever we need the engine to hard-reset even if
  // acuityLevel hasn't changed (e.g. violation restart at level 0).
  const [snellenResetToken, setSnellenResetToken] = useState(0);
  // Prevents handleSnellenLevelResult from being called twice for the
  // same level (stale voice result arriving in the 200 ms timer window).
  const levelResultFiredRef = useRef(false);

  // Results
  const resultsRef = useRef({ left: null, right: null });

  // Pre-check lock
  const lockStartRef = useRef(null);
  const [lockProgress, setLockProgress] = useState(0);

  // Eye violation tracking
  const [eyeWarningVisible, setEyeWarningVisible] = useState(false);
  const [eyeWarningCountdown, setEyeWarningCountdown] = useState(EYE_WARNING_COUNTDOWN_S);
  const [violationCount, setViolationCount] = useState(0);
  const eyeBadSinceRef = useRef(null);
  // Prevents finishEye from running twice if a stale callback fires during async save
  const finishingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);

  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());
  const visionResultRef = useRef(visionResult);
  visionResultRef.current = visionResult;

  // ─── Camera ──────────────────────────────────────────
  const requestCamera = useCallback(async () => {
    setCameraPermission("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setCameraPermission("granted");
    } catch {
      setCameraPermission("denied");
    }
  }, []);

  useEffect(() => {
    if (cameraPermission !== "granted" || !streamRef.current) return;
    if (videoRef.current) videoRef.current.srcObject = streamRef.current;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    let isWaiting = false;

    ws.onmessage = (event) => {
      isWaiting = false;
      try {
        const data = JSON.parse(event.data);
        if (data.eye_state === "left_covered") data.eye_state = "right_covered";
        else if (data.eye_state === "right_covered") data.eye_state = "left_covered";
        else if (data.eye_state === "left_closed") data.eye_state = "right_closed";
        else if (data.eye_state === "right_closed") data.eye_state = "left_closed";
        setVisionResult(data);

        frameCountRef.current += 1;
        const now = Date.now();
        if (now - lastFpsTimeRef.current >= 1000) {
          setFps(Math.round((frameCountRef.current * 1000) / (now - lastFpsTimeRef.current)));
          frameCountRef.current = 0;
          lastFpsTimeRef.current = now;
        }
      } catch (e) { console.error("[WS] parse error", e); }
    };

    const iv = setInterval(() => {
      if (!isWaiting && videoRef.current && canvasRef.current && wsRef.current?.readyState === WebSocket.OPEN && videoRef.current.videoWidth > 0) {
        isWaiting = true;
        const c = canvasRef.current;
        c.width = videoRef.current.videoWidth;
        c.height = videoRef.current.videoHeight;
        c.getContext("2d").drawImage(videoRef.current, 0, 0, c.width, c.height);
        wsRef.current.send(c.toDataURL("image/jpeg", 0.95));
      }
    }, 33);
    intervalRef.current = iv;

    return () => { clearInterval(iv); ws.close(); };
  }, [cameraPermission]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (wsRef.current) wsRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ─── Pre-check lock timer ────────────────────────────
  const badSinceRef = useRef(null);
  const GRACE_MS = 500;

  useEffect(() => {
    if (testPhase !== "PRE_CHECK") {
      lockStartRef.current = null;
      badSinceRef.current = null;
      setLockProgress(0);
      return;
    }
    const expectedCover = testingEye === "left" ? "right_covered" : "left_covered";
    const tick = setInterval(() => {
      const vr = visionResultRef.current;
      if (!vr) return;
      const ok = vr.face_detected && vr.distance_status === "ok" && vr.eye_state === expectedCover;
      if (ok) {
        badSinceRef.current = null;
        if (!lockStartRef.current) lockStartRef.current = Date.now();
        const elapsed = Date.now() - lockStartRef.current;
        setLockProgress(Math.min(1, elapsed / PRECHECK_LOCK_MS));
        if (elapsed >= PRECHECK_LOCK_MS) {
          setEyeWarningVisible(false);
          eyeBadSinceRef.current = null;
          setTestPhase("TESTING");
        }
      } else {
        if (!badSinceRef.current) badSinceRef.current = Date.now();
        else if (Date.now() - badSinceRef.current > GRACE_MS) {
          lockStartRef.current = null;
          setLockProgress(0);
        }
      }
    }, 100);
    return () => clearInterval(tick);
  }, [testPhase, testingEye]);

  // ─── Eye violation monitor (during TESTING) ──────────
  useEffect(() => {
    if (testPhase !== "TESTING") {
      eyeBadSinceRef.current = null;
      setEyeWarningVisible(false);
      return;
    }

    const expectedCover = testingEye === "left" ? "right_covered" : "left_covered";
    const tick = setInterval(() => {
      const vr = visionResultRef.current;
      if (!vr || !vr.face_detected) return;

      const eyeOk = vr.eye_state === expectedCover;

      if (eyeOk) {
        eyeBadSinceRef.current = null;
        setEyeWarningVisible(false);
        setEyeWarningCountdown(EYE_WARNING_COUNTDOWN_S);
      } else {
        if (!eyeBadSinceRef.current) {
          eyeBadSinceRef.current = Date.now();
        } else if (Date.now() - eyeBadSinceRef.current > EYE_VIOLATION_THRESHOLD_MS) {
          setEyeWarningVisible(true);
        }
      }
    }, 200);
    return () => clearInterval(tick);
  }, [testPhase, testingEye]);

  // ─── Eye warning countdown ──────────────────────────
  useEffect(() => {
    if (!eyeWarningVisible) {
      setEyeWarningCountdown(EYE_WARNING_COUNTDOWN_S);
      return;
    }
    const tick = setInterval(() => {
      setEyeWarningCountdown((prev) => {
        if (prev <= 1) {
          // BUG FIX: Don't call navigate() or setViolationCount inside a state
          // updater — schedule side-effects via a timeout instead.
          setTimeout(() => {
            setViolationCount((v) => {
              const newV = v + 1;
              if (newV >= MAX_VIOLATIONS) {
                // Too many violations — fail the test
                const failPayload = {
                  leftEye: resultsRef.current.left || { acuity: null, diopter: null },
                  rightEye: resultsRef.current.right || { acuity: null, diopter: null },
                  timestamp: new Date().toISOString(),
                  unreliable: true,
                };
                if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
                navigate(`/results/${testId || "snellen-acuity"}`, { state: failPayload });
              }
              return newV;
            });
            setCurrentLevelIndex(0);
            // Bump resetToken so SnellenEngine hard-resets even when
            // acuityLevel stays at ACUITY_LEVELS[0] (same eye, same level).
            setSnellenResetToken((t) => t + 1);
            levelResultFiredRef.current = false;
            setEyeWarningVisible(false);
            setTestPhase("PRE_CHECK");
            eyeBadSinceRef.current = null;
          }, 0);
          return EYE_WARNING_COUNTDOWN_S;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [eyeWarningVisible, navigate, testId]);

  // ─── Calibrate ─────────────────────────────────────────
  const handleCalibrate = useCallback(async () => {
    if (!canvasRef.current) return;
    const b64 = canvasRef.current.toDataURL("image/jpeg", 0.95);
    try {
      const res = await fetch(`${API_URL}/api/vision/calibrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, distance: 50.0 }),
      });
      const data = await res.json();
      if (data.success) setTestPhase("PRE_CHECK");
      else alert("Calibration failed — make sure your face is visible.");
    } catch (err) {
      console.error("Calibration error:", err);
      alert("Could not reach the backend. Is the server running?");
    }
  }, []);

  // ─── Diopter estimation ────────────────────────────────
  const computeDiopter = useCallback((acuityStr) => {
    if (!acuityStr) return -5.0;
    const denom = parseInt(acuityStr.split("/")[1], 10);
    const farCm = ((60 * 6) / denom) * 3.2;
    return -(1 / (farCm / 100));
  }, []);

  // ─── Save results to database ──────────────────────────
  const saveResultsToDB = useCallback(async (payload) => {
    if (!session?.access_token) return;
    try {
      const leftScore = acuityToScore(payload.leftEye?.acuity);
      const rightScore = acuityToScore(payload.rightEye?.acuity);

      await fetch(`${API_URL}/api/test-results`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          test_type: testId || "snellen-acuity",
          left_eye_acuity: payload.leftEye?.acuity || null,
          right_eye_acuity: payload.rightEye?.acuity || null,
          left_eye_diopter: payload.leftEye?.diopter || null,
          right_eye_diopter: payload.rightEye?.diopter || null,
          overall_score: Math.round((leftScore + rightScore) / 2),
        }),
      });
    } catch (err) {
      // Non-fatal: log but don't block navigation
      console.error("[VISUAR] Failed to save results:", err);
    }
  }, [session, testId]);

  // ─── Finish one eye ────────────────────────────────────
  const finishEye = useCallback(
    async (acuity) => {
      if (finishingRef.current) return; // prevent double-call during async save
      const diopter = computeDiopter(acuity);
      resultsRef.current[testingEye] = { acuity, diopter };

      if (testingEye === "left") {
        setTestingEye("right");
        setCurrentLevelIndex(0);
        setSnellenResetToken((t) => t + 1);
        levelResultFiredRef.current = false;
        setTestPhase("PRE_CHECK");
      } else {
        finishingRef.current = true;
        setIsSaving(true);
        const payload = {
          leftEye: resultsRef.current.left,
          rightEye: resultsRef.current.right,
          timestamp: new Date().toISOString(),
        };
        console.log("[VISUAR] Test complete:", payload);
        await saveResultsToDB(payload);
        if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
        navigate(`/results/${testId || "snellen-acuity"}`, { state: payload });
      }
    },
    [testingEye, computeDiopter, navigate, testId, saveResultsToDB]
  );

  // ─── Snellen level handler ────────────────────────────
  const handleSnellenLevelResult = useCallback(
    (passed, levelIndex) => {
      // Guard: ignore duplicate calls for the same level
      // (can happen when a stale voice result fires during the 200ms feedback timer).
      if (levelResultFiredRef.current) return;
      levelResultFiredRef.current = true;

      if (passed) {
        if (levelIndex < ACUITY_LEVELS.length - 1) {
          levelResultFiredRef.current = false; // next level can fire
          setCurrentLevelIndex(levelIndex + 1);
        } else {
          finishEye(ACUITY_LEVELS[ACUITY_LEVELS.length - 1]);
        }
      } else {
        finishEye(levelIndex > 0 ? ACUITY_LEVELS[levelIndex - 1] : null);
      }
    },
    [finishEye]
  );

  // ─── Derived state ─────────────────────────────────────
  const expectedCover = testingEye === "left" ? "right_covered" : "left_covered";
  const coveredEyeLabel = testingEye === "left" ? "RIGHT" : "LEFT";
  const testingEyeLabel = testingEye === "left" ? "LEFT" : "RIGHT";

  // Grace-period test pause (face + distance only)
  const testBadSinceRef = useRef(null);
  const [isTestPaused, setIsTestPaused] = useState(false);

  useEffect(() => {
    if (testPhase !== "TESTING") {
      testBadSinceRef.current = null;
      setIsTestPaused(false);
      return;
    }
    const tick = setInterval(() => {
      const vr = visionResultRef.current;
      const ok = vr && vr.face_detected && vr.distance_status === "ok";
      if (ok) { testBadSinceRef.current = null; setIsTestPaused(false); }
      else {
        if (!testBadSinceRef.current) testBadSinceRef.current = Date.now();
        else if (Date.now() - testBadSinceRef.current > 2000) setIsTestPaused(true);
      }
    }, 200);
    return () => clearInterval(tick);
  }, [testPhase]);

  const isConditionsMet = !isTestPaused;

  // ─── Render ────────────────────────────────────────────
  return (
    <div className={`min-h-screen flex flex-col relative overflow-hidden transition-colors duration-300 ${
      isDarkMode ? "bg-[#0a0e27]" : "bg-gradient-to-br from-blue-50 via-cyan-50 to-white"
    }`}>
      <AnimatedBackground isDarkMode={isDarkMode} />
      <div className="absolute top-6 right-6 z-20"><LanguageSelector /></div>

      {/* Saving overlay — shown briefly after right eye test before navigation */}
      {isSaving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div className={`px-10 py-8 rounded-3xl text-center shadow-2xl ${
            isDarkMode ? "bg-[#1a1f3a] border border-slate-700" : "bg-white border border-slate-200"
          }`}>
            <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>Saving results…</p>
          </div>
        </div>
      )}

      {/* Persistent hidden video + canvas */}
      <video ref={videoRef} autoPlay playsInline muted
        style={{ position: "fixed", top: 0, left: 0, width: 320, height: 240, opacity: 0, pointerEvents: "none", zIndex: -1 }}
      />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* ── EYE VIOLATION WARNING OVERLAY ── */}
      {eyeWarningVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className={`max-w-lg w-full mx-4 p-8 rounded-3xl text-center shadow-2xl ${
            isDarkMode ? "bg-red-950/90 border border-red-500/50" : "bg-white border-2 border-red-300"
          }`}>
            <div className="flex items-center justify-center gap-3 mb-4">
              <AlertTriangle className="w-10 h-10 text-red-500" />
              <h2 className={`text-3xl font-black ${isDarkMode ? "text-red-400" : "text-red-600"}`}>
                Eye Cover Violation
              </h2>
            </div>
            <p className={`text-lg mb-6 ${isDarkMode ? "text-red-300" : "text-red-700"}`}>
              You are not covering the correct eye. Please cover your <strong>{coveredEyeLabel}</strong> eye to continue.
            </p>
            <div className="text-6xl font-black text-red-500 animate-pulse mb-4">
              {eyeWarningCountdown}
            </div>
            <p className={`text-sm ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
              Test will restart in {eyeWarningCountdown}s · Violation {violationCount + 1}/{MAX_VIOLATIONS}
            </p>
          </div>
        </div>
      )}

      <div className="w-full max-w-6xl mx-auto relative z-10 flex flex-col flex-1 p-4 md:p-6">
        <Link to="/dashboard" onClick={() => {
          if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
        }}>
          <Button variant="ghost" className={`mb-4 transition-colors ${isDarkMode ? "text-slate-300 hover:text-white" : "text-slate-700"}`}>
            <ArrowLeft className="mr-2 w-4 h-4" /> {t("common.back")}
          </Button>
        </Link>

        {/* ═══ PHASE: PPI CALIBRATION ═══ */}
        {testPhase === "SETUP_PPI" && (
          <div className={`backdrop-blur-md rounded-3xl shadow-xl p-8 md:p-10 transition-colors ${
            isDarkMode ? "bg-[#1a1f3a]/80 border border-slate-700/50" : "bg-white/80 border border-white/40"
          }`}>
            <PPICalibrator onCalibrate={(val) => { setPpi(val); setTestPhase("SETUP_CAMERA"); }} isDarkMode={isDarkMode} />
          </div>
        )}

        {/* ═══ PHASE: CAMERA + DISTANCE CALIBRATION ═══ */}
        {testPhase === "SETUP_CAMERA" && (
          <div className={`backdrop-blur-md rounded-3xl shadow-xl p-8 md:p-10 text-center transition-colors ${
            isDarkMode ? "bg-[#1a1f3a]/80 border border-slate-700/50" : "bg-white/80 border border-white/40"
          }`}>
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isDarkMode ? "bg-cyan-500/20" : "bg-cyan-100"}`}>
              <Ruler className={`w-8 h-8 ${isDarkMode ? "text-cyan-400" : "text-cyan-600"}`} />
            </div>
            <h2 className={`text-3xl font-bold mb-3 ${isDarkMode ? "text-white" : "text-slate-900"}`}>Distance Calibration</h2>
            <p className={`mb-2 max-w-lg mx-auto ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
              Sit approximately <strong>50 cm</strong> from your screen, then click Calibrate.
            </p>
            <div className={`mb-6 max-w-lg mx-auto p-3 rounded-xl text-sm font-medium ${
              isDarkMode ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "bg-cyan-50 text-cyan-700 border border-cyan-100"
            }`}>
              💡 <strong>Tip:</strong> One full arm's length ≈ 50 cm
            </div>

            {cameraPermission !== "granted" ? (
              <Button size="lg" className="h-14 px-12 rounded-full" onClick={requestCamera}>
                <Camera className="mr-2 w-5 h-5" /> Enable Camera
              </Button>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <MirrorPreview videoRef={videoRef} className="w-full max-w-md rounded-2xl shadow-inner" />
                {visionResult && (
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold uppercase tracking-wider ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Distance:</span>
                    <span className={`text-2xl font-black tabular-nums ${visionResult.distance_status === "ok" ? "text-green-500" : "text-amber-500"}`}>
                      {visionResult.distance_cm ? `${visionResult.distance_cm} cm` : "Scanning…"}
                    </span>
                    {visionResult.distance_status === "ok" && <CheckCircle2 className="w-6 h-6 text-green-500" />}
                  </div>
                )}
                <Button size="lg" className="h-14 px-12 rounded-full" onClick={handleCalibrate}>
                  <CheckCircle2 className="mr-2 w-5 h-5" /> Calibrate at ~50 cm
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ═══ PHASE: PRE-CHECK ═══ */}
        {testPhase === "PRE_CHECK" && (
          <div className={`backdrop-blur-md rounded-3xl shadow-xl p-8 md:p-10 text-center transition-colors ${
            isDarkMode ? "bg-[#1a1f3a]/80 border border-slate-700/50" : "bg-white/80 border border-white/40"
          }`}>
            <div className="flex items-center justify-center gap-3 mb-2">
              <EyeOff className={`w-8 h-8 ${isDarkMode ? "text-cyan-400" : "text-cyan-600"}`} />
              <h2 className={`text-3xl md:text-4xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                Cover Your {coveredEyeLabel} Eye
              </h2>
            </div>
            <p className={`text-lg mb-6 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
              We're testing your <strong>{testingEyeLabel} eye</strong>. Cover the other eye with your hand.
            </p>

            <div className="flex flex-col items-center gap-6">
              <div className="relative w-full max-w-xl rounded-2xl overflow-hidden shadow-lg border-2 border-slate-200 dark:border-slate-700">
                <MirrorPreview videoRef={videoRef} className="w-full" />
                {visionResult && (
                  <div className="absolute bottom-0 inset-x-0 bg-black/70 backdrop-blur-sm p-4 flex justify-around text-white">
                    <StatusIndicator label="Distance" ok={visionResult.distance_status === "ok"}
                      valueOk={visionResult.distance_cm ? `${visionResult.distance_cm} cm ✓` : "---"}
                      valueBad={visionResult.distance_cm ? `${visionResult.distance_cm} cm` : "No face"} />
                    <StatusIndicator label="Eye Cover" ok={visionResult.eye_state === expectedCover}
                      valueOk={`${coveredEyeLabel} Covered ✓`}
                      valueBad={visionResult.eye_state.replace(/_/g, " ").toUpperCase()} />
                  </div>
                )}
              </div>

              <div className="w-full max-w-xl">
                <div className={`h-3 rounded-full overflow-hidden ${isDarkMode ? "bg-slate-800" : "bg-slate-200"}`}>
                  <div className="h-full rounded-full transition-all duration-150 bg-gradient-to-r from-cyan-500 to-green-500"
                    style={{ width: `${lockProgress * 100}%` }} />
                </div>
                {lockProgress > 0 ? (
                  <div className="mt-3 flex items-center justify-center gap-2 text-green-500 font-bold animate-pulse text-lg">
                    <Lock className="w-5 h-5" /> Locking in… ({Math.round(lockProgress * 100)}%)
                  </div>
                ) : (
                  <p className={`mt-3 text-sm ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                    Hold position for 3 seconds to begin
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ PHASE: ACTIVE SNELLEN TEST ═══ */}
        <div style={{ display: testPhase === "TESTING" ? "flex" : "none" }} className="gap-5 flex-1 min-h-0">
          <div className={`flex-1 rounded-3xl shadow-xl flex flex-col items-center justify-center transition-colors overflow-hidden ${
            isDarkMode ? "bg-[#0d1117] border border-slate-800" : "bg-white border border-slate-200"
          }`}>
            <SnellenEngine
              key={testingEye}
              ppi={ppi}
              acuityLevel={ACUITY_LEVELS[currentLevelIndex]}
              levelIndex={currentLevelIndex}
              onLevelResult={handleSnellenLevelResult}
              isDarkMode={isDarkMode}
              testingEye={testingEye}
              visionOk={testPhase === "TESTING" && isConditionsMet && !eyeWarningVisible}
              coveredEyeLabel={coveredEyeLabel}
              resetToken={snellenResetToken}
            />
          </div>

          {/* Sidebar */}
          <div className={`w-64 xl:w-72 shrink-0 rounded-3xl shadow-xl overflow-hidden flex flex-col transition-colors ${
            isDarkMode ? "bg-slate-900 border border-slate-800" : "bg-white border border-slate-200"
          }`}>
            <div className="relative">
              <MirrorPreview videoRef={videoRef} className="w-full" />
              <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/70 text-white text-[10px] font-bold">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> {fps} FPS
              </div>
            </div>
            <div className="p-4 space-y-4 flex-1">
              <TelemetryRow label="Testing Eye" value={testingEyeLabel} color="text-cyan-500" />
              <TelemetryRow label="Distance"
                value={visionResult?.distance_cm ? `${visionResult.distance_cm} cm` : "---"}
                color={visionResult?.distance_status === "ok" ? "text-green-500" : "text-red-500"} />
              <TelemetryRow label="Eye State"
                value={visionResult?.eye_state?.replace(/_/g, " ").toUpperCase() || "---"}
                color={
                  visionResult?.eye_state === expectedCover ? "text-green-500"
                  : visionResult?.eye_state === "both_open" ? "text-red-500"
                  : "text-amber-500"
                } />
              <div className={`pt-3 border-t ${isDarkMode ? "border-slate-800" : "border-slate-200"}`}>
                <TelemetryRow label="Acuity Level" value={ACUITY_LEVELS[currentLevelIndex]}
                  color={isDarkMode ? "text-white" : "text-slate-900"} large />
              </div>
              {violationCount > 0 && (
                <div className={`p-2 rounded-lg text-xs font-medium ${isDarkMode ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-600"}`}>
                  ⚠ Eye violations: {violationCount}/{MAX_VIOLATIONS}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helper Components ──────────────────────────────────

function acuityToScore(acuityStr) {
  if (!acuityStr) return 20;
  const map = { "6/6": 100, "6/9": 90, "6/12": 80, "6/18": 65, "6/24": 50, "6/36": 35, "6/60": 20 };
  return map[acuityStr] ?? 50;
}

function MirrorPreview({ videoRef, className = "" }) {
  const mirrorCanvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    let active = true;
    const draw = () => {
      if (!active) return;
      const video = videoRef.current;
      const canvas = mirrorCanvasRef.current;
      if (video && canvas && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { active = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [videoRef]);

  return <canvas ref={mirrorCanvasRef} className={className} style={{ display: "block", background: "#000" }} />;
}

function StatusIndicator({ label, ok, valueOk, valueBad }) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wider opacity-70 mb-1">{label}</div>
      <div className={`font-bold text-sm ${ok ? "text-green-400" : "text-red-400"}`}>{ok ? valueOk : valueBad}</div>
    </div>
  );
}

function TelemetryRow({ label, value, color = "text-white", large = false }) {
  return (
    <div>
      <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-0.5">{label}</div>
      <div className={`${large ? "text-xl" : "text-sm"} font-bold ${color} uppercase`}>{value}</div>
    </div>
  );
}
