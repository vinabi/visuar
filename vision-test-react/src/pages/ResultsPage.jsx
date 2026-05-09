import { Link, useParams, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  Share2,
  CheckCircle2,
  AlertTriangle,
  Info,
  TrendingUp,
  Eye,
  Activity,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useTheme } from "../context/ThemeContext";

// ─── Helpers ────────────────────────────────────────────
function acuityToScore(acuityStr) {
  if (!acuityStr) return 20;
  const map = {
    "6/6": 100, "6/9": 90, "6/12": 80, "6/18": 65,
    "6/24": 50, "6/36": 35, "6/60": 20,
  };
  return map[acuityStr] ?? 50;
}

function acuityToStatus(acuityStr) {
  if (!acuityStr) return "poor";
  const d = parseInt(acuityStr.split("/")[1], 10);
  if (d <= 6) return "excellent";
  if (d <= 12) return "good";
  if (d <= 24) return "moderate";
  return "poor";
}

function dioptersToLabel(d) {
  if (d == null) return "N/A";
  const abs = Math.abs(d).toFixed(2);
  if (d < -0.5) return `−${abs} D (Myopia)`;
  if (d > 0.5) return `+${abs} D (Hyperopia)`;
  return `${abs} D (Normal range)`;
}

export default function ResultsPage() {
  const { t } = useTranslation();
  const { isDarkMode } = useTheme();
  const { testId } = useParams();
  const location = useLocation();

  // Real results from Snellen test (passed via navigate state)
  const snellenData = location.state; // { leftEye: {acuity, diopter}, rightEye: {acuity, diopter}, timestamp }

  const testTitles = {
    "snellen-acuity": "Snellen Visual Acuity",
    contrast: "Contrast Sensitivity",
    color: "Color Differentiation",
    "eye-tracking": "Eye Tracking",
    depth: "Depth Perception",
    reaction: "Reaction Time",
    strain: "Digital Eye Strain",
    complete: "Complete Vision Assessment",
  };

  // Build results from actual data or fallback to mock
  const hasReal = snellenData && snellenData.leftEye && snellenData.rightEye;

  const leftAcuity = hasReal ? snellenData.leftEye.acuity : null;
  const rightAcuity = hasReal ? snellenData.rightEye.acuity : null;
  const leftDiopter = hasReal ? snellenData.leftEye.diopter : null;
  const rightDiopter = hasReal ? snellenData.rightEye.diopter : null;
  const leftScore = acuityToScore(leftAcuity);
  const rightScore = acuityToScore(rightAcuity);
  const overallScore = Math.round((leftScore + rightScore) / 2);

  const results = hasReal
    ? {
        overallScore,
        status: overallScore >= 80 ? "good" : overallScore >= 50 ? "moderate" : "poor",
        metrics: [
          {
            label: "Left Eye Acuity",
            value: leftScore,
            detail: leftAcuity || "Could not measure",
            status: acuityToStatus(leftAcuity),
          },
          {
            label: "Right Eye Acuity",
            value: rightScore,
            detail: rightAcuity || "Could not measure",
            status: acuityToStatus(rightAcuity),
          },
          {
            label: "Left Eye Refraction",
            value: Math.max(0, 100 - Math.abs(leftDiopter || 0) * 15),
            detail: dioptersToLabel(leftDiopter),
            status: Math.abs(leftDiopter || 0) < 1 ? "excellent" : Math.abs(leftDiopter || 0) < 2 ? "good" : "moderate",
          },
          {
            label: "Right Eye Refraction",
            value: Math.max(0, 100 - Math.abs(rightDiopter || 0) * 15),
            detail: dioptersToLabel(rightDiopter),
            status: Math.abs(rightDiopter || 0) < 1 ? "excellent" : Math.abs(rightDiopter || 0) < 2 ? "good" : "moderate",
          },
        ],
        findings: buildFindings(leftAcuity, rightAcuity, leftDiopter, rightDiopter),
        recommendations: buildRecommendations(leftAcuity, rightAcuity, leftDiopter, rightDiopter),
      }
    : {
        // Fallback mock data for non-Snellen tests or direct URL access
        overallScore: 87,
        status: "good",
        metrics: [
          { label: t("test.visualAcuity"), value: 92, status: "excellent" },
          { label: t("test.contrastSensitivity"), value: 85, status: "good" },
          { label: t("test.colorPerception"), value: 88, status: "good" },
          { label: t("test.blinkRate"), value: 78, status: "moderate" },
        ],
        findings: [
          { type: "info", title: t("test.finding1Title"), description: t("test.finding1Desc") },
          { type: "success", title: t("test.finding2Title"), description: t("test.finding2Desc") },
        ],
        recommendations: [
          t("test.recommendation1"),
          t("test.recommendation2"),
          t("test.recommendation3"),
          t("test.recommendation4"),
        ],
      };

  return (
    <div
      className={`min-h-screen p-4 md:p-8 relative overflow-hidden transition-colors ${
        isDarkMode
          ? "bg-[#0a0e27]"
          : "bg-gradient-to-br from-blue-50 via-cyan-50 to-white"
      }`}
    >
      <AnimatedBackground isDarkMode={isDarkMode} />

      {/* Language Selector */}
      <div className="absolute top-6 right-6 z-20">
        <LanguageSelector />
      </div>

      <div className="max-w-5xl mx-auto relative z-10">
        <Link to="/dashboard">
          <Button
            variant="ghost"
            className={`mb-6 transition-colors ${
              isDarkMode
                ? "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                : "text-slate-700 hover:text-cyan-600 hover:bg-white/60"
            }`}
          >
            <ArrowLeft className="mr-2 w-4 h-4" />
            {t("common.back")}
          </Button>
        </Link>

        <div
          className={`backdrop-blur-md rounded-3xl shadow-xl p-8 md:p-12 transition-colors ${
            isDarkMode
              ? "bg-[#1a1f3a]/80 border border-slate-700/50"
              : "bg-white/80 border border-white/40"
          }`}
        >
          {/* Header */}
          <div className="text-center mb-10">
            <div
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-4 transition-colors ${
                isDarkMode
                  ? "bg-green-500/20 border border-green-500/30 text-green-400"
                  : "bg-green-100 border border-green-200 text-green-700"
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              {t("test.testCompleted")}
            </div>
            <h1
              className={`text-4xl md:text-5xl font-bold mb-3 transition-colors ${
                isDarkMode ? "text-white" : "text-slate-900"
              }`}
            >
              {testTitles[testId] || "Vision Test"} Results
            </h1>
            <p
              className={`text-lg transition-colors ${
                isDarkMode ? "text-slate-300" : "text-slate-600"
              }`}
            >
              {t("test.completedOn")}{" "}
              {new Date(snellenData?.timestamp || Date.now()).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>

          {/* Overall Score */}
          <div
            className={`rounded-2xl p-8 mb-8 transition-colors ${
              isDarkMode
                ? "bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20"
                : "bg-gradient-to-br from-cyan-50 to-blue-50 border border-cyan-100"
            }`}
          >
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="relative">
                <div
                  className={`w-32 h-32 rounded-full border-8 flex items-center justify-center transition-colors ${
                    results.overallScore >= 80
                      ? "border-green-500"
                      : results.overallScore >= 50
                      ? "border-amber-500"
                      : "border-red-500"
                  } ${isDarkMode ? "bg-slate-800/50" : "bg-white"}`}
                >
                  <div className="text-center">
                    <div
                      className={`text-4xl font-bold transition-colors ${
                        isDarkMode ? "text-white" : "text-slate-900"
                      }`}
                    >
                      {results.overallScore}
                    </div>
                    <div
                      className={`text-xs transition-colors ${
                        isDarkMode ? "text-slate-400" : "text-slate-600"
                      }`}
                    >
                      {t("test.outOf")}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 text-center md:text-left">
                <h2
                  className={`text-3xl font-bold mb-2 transition-colors ${
                    isDarkMode ? "text-white" : "text-slate-900"
                  }`}
                >
                  {results.overallScore >= 80
                    ? "Great Vision Health"
                    : results.overallScore >= 50
                    ? "Moderate Results"
                    : "Consider a Professional Exam"}
                </h2>
                <p
                  className={`text-lg leading-relaxed transition-colors ${
                    isDarkMode ? "text-slate-300" : "text-slate-600"
                  }`}
                >
                  {hasReal
                    ? `Your left eye measured ${leftAcuity || "N/A"} and right eye ${rightAcuity || "N/A"}.`
                    : t("test.healthMessage")}
                </p>
                <div className="flex gap-3 mt-6 justify-center md:justify-start">
                  <Button
                    className={`rounded-full transition-colors ${
                      isDarkMode
                        ? "bg-cyan-500 hover:bg-cyan-400 text-white"
                        : "bg-cyan-500 hover:bg-cyan-600 text-white"
                    }`}
                  >
                    <Download className="mr-2 w-4 h-4" />
                    {t("test.downloadReport")}
                  </Button>
                  <Button
                    variant="outline"
                    className={`rounded-full transition-colors ${
                      isDarkMode
                        ? "border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300 bg-transparent"
                        : "border-cyan-300 text-cyan-600 hover:bg-cyan-50 hover:text-cyan-700 bg-transparent"
                    }`}
                  >
                    <Share2 className="mr-2 w-4 h-4" />
                    {t("test.shareResults")}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Metrics */}
          <div
            className={`rounded-2xl p-8 mb-8 transition-colors ${
              isDarkMode
                ? "bg-slate-800/50 border border-slate-700/50"
                : "bg-white border border-slate-200"
            }`}
          >
            <h3
              className={`text-2xl font-bold mb-6 flex items-center gap-2 transition-colors ${
                isDarkMode ? "text-white" : "text-slate-900"
              }`}
            >
              <Activity
                className={`w-6 h-6 transition-colors ${
                  isDarkMode ? "text-cyan-400" : "text-cyan-600"
                }`}
              />
              {t("test.detailedMetrics")}
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              {results.metrics.map((metric, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span
                      className={`font-medium transition-colors ${
                        isDarkMode ? "text-white" : "text-slate-900"
                      }`}
                    >
                      {metric.label}
                    </span>
                    <Badge
                      className={
                        metric.status === "excellent"
                          ? isDarkMode
                            ? "bg-green-500/20 border-green-500/30 text-green-400"
                            : "bg-green-500 text-white"
                          : metric.status === "good"
                          ? isDarkMode
                            ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-400"
                            : "bg-cyan-500 text-white"
                          : metric.status === "moderate"
                          ? isDarkMode
                            ? "bg-amber-500/20 border-amber-500/30 text-amber-400"
                            : "bg-amber-500 text-white"
                          : isDarkMode
                          ? "bg-red-500/20 border-red-500/30 text-red-400"
                          : "bg-red-500 text-white"
                      }
                    >
                      {metric.status}
                    </Badge>
                  </div>
                  <div
                    className={`h-2 rounded-full overflow-hidden transition-colors ${
                      isDarkMode ? "bg-slate-700/50" : "bg-slate-100"
                    }`}
                  >
                    <div
                      className={`h-full transition-all ${
                        metric.status === "excellent"
                          ? "bg-green-500"
                          : metric.status === "good"
                          ? "bg-cyan-500"
                          : metric.status === "moderate"
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${Math.max(5, metric.value)}%` }}
                    />
                  </div>
                  <div
                    className={`text-sm transition-colors ${
                      isDarkMode ? "text-slate-400" : "text-slate-600"
                    }`}
                  >
                    {metric.detail || `${metric.value}%`}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Key Findings */}
          <div
            className={`rounded-2xl p-8 mb-8 transition-colors ${
              isDarkMode
                ? "bg-slate-800/50 border border-slate-700/50"
                : "bg-white border border-slate-200"
            }`}
          >
            <h3
              className={`text-2xl font-bold mb-6 flex items-center gap-2 transition-colors ${
                isDarkMode ? "text-white" : "text-slate-900"
              }`}
            >
              <Eye
                className={`w-6 h-6 transition-colors ${
                  isDarkMode ? "text-cyan-400" : "text-cyan-600"
                }`}
              />
              {t("test.keyFindings")}
            </h3>
            <div className="space-y-4">
              {results.findings.map((finding, index) => (
                <div
                  key={index}
                  className={`flex gap-4 p-5 rounded-xl border transition-colors ${
                    isDarkMode
                      ? finding.type === "success"
                        ? "bg-green-500/10 border-green-500/30"
                        : finding.type === "warning"
                        ? "bg-amber-500/10 border-amber-500/30"
                        : "bg-blue-500/10 border-blue-500/30"
                      : finding.type === "success"
                      ? "bg-green-50 border-green-200"
                      : finding.type === "warning"
                      ? "bg-amber-50 border-amber-200"
                      : "bg-blue-50 border-blue-200"
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {finding.type === "success" && (
                      <CheckCircle2
                        className={`w-5 h-5 transition-colors ${
                          isDarkMode ? "text-green-400" : "text-green-600"
                        }`}
                      />
                    )}
                    {finding.type === "warning" && (
                      <AlertTriangle
                        className={`w-5 h-5 transition-colors ${
                          isDarkMode ? "text-amber-400" : "text-amber-600"
                        }`}
                      />
                    )}
                    {finding.type === "info" && (
                      <Info
                        className={`w-5 h-5 transition-colors ${
                          isDarkMode ? "text-blue-400" : "text-blue-600"
                        }`}
                      />
                    )}
                  </div>
                  <div>
                    <h4
                      className={`font-semibold mb-1 transition-colors ${
                        isDarkMode ? "text-white" : "text-slate-900"
                      }`}
                    >
                      {finding.title}
                    </h4>
                    <p
                      className={`text-sm leading-relaxed transition-colors ${
                        isDarkMode ? "text-slate-300" : "text-slate-600"
                      }`}
                    >
                      {finding.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          <div
            className={`rounded-2xl p-8 transition-colors ${
              isDarkMode
                ? "bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20"
                : "bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100"
            }`}
          >
            <h3
              className={`text-2xl font-bold mb-6 flex items-center gap-2 transition-colors ${
                isDarkMode ? "text-white" : "text-slate-900"
              }`}
            >
              <TrendingUp
                className={`w-6 h-6 transition-colors ${
                  isDarkMode ? "text-cyan-400" : "text-cyan-600"
                }`}
              />
              {t("test.recommendations")}
            </h3>
            <div className="space-y-4">
              {results.recommendations.map((recommendation, index) => (
                <div key={index} className="flex gap-4">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                      isDarkMode ? "bg-cyan-500/20" : "bg-cyan-100"
                    }`}
                  >
                    <div
                      className={`w-2 h-2 rounded-full transition-colors ${
                        isDarkMode ? "bg-cyan-400" : "bg-cyan-500"
                      }`}
                    />
                  </div>
                  <p
                    className={`leading-relaxed transition-colors ${
                      isDarkMode ? "text-slate-300" : "text-slate-700"
                    }`}
                  >
                    {recommendation}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
            <Link to="/test-selection">
              <Button
                size="lg"
                className={`h-14 px-10 rounded-full transition-colors ${
                  isDarkMode
                    ? "bg-cyan-500 hover:bg-cyan-400 text-white"
                    : "bg-cyan-500 hover:bg-cyan-600 text-white"
                }`}
              >
                {t("test.retakeTest")}
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button
                size="lg"
                variant="outline"
                className={`h-14 px-10 border-2 rounded-full bg-transparent transition-colors ${
                  isDarkMode
                    ? "border-cyan-400/50 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-400"
                    : "border-cyan-500/30 text-cyan-600 hover:bg-cyan-50 hover:border-cyan-500 hover:text-cyan-700"
                }`}
              >
                {t("test.backToDashboard")}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dynamic findings generator ──────────────────────────
function buildFindings(leftAcuity, rightAcuity, leftD, rightD) {
  const findings = [];
  const leftOk = leftAcuity && parseInt(leftAcuity.split("/")[1], 10) <= 12;
  const rightOk = rightAcuity && parseInt(rightAcuity.split("/")[1], 10) <= 12;

  if (leftOk && rightOk) {
    findings.push({
      type: "success",
      title: "Healthy Distance Vision",
      description: `Both eyes measured ${leftAcuity} (left) and ${rightAcuity} (right), which is within the normal range for distance vision.`,
    });
  } else {
    if (!leftOk) {
      findings.push({
        type: "warning",
        title: "Left Eye — Reduced Acuity",
        description: `Your left eye measured ${leftAcuity || "below threshold"}. This may indicate myopia or other refractive error. Consider an eye exam.`,
      });
    }
    if (!rightOk) {
      findings.push({
        type: "warning",
        title: "Right Eye — Reduced Acuity",
        description: `Your right eye measured ${rightAcuity || "below threshold"}. This may indicate myopia or other refractive error. Consider an eye exam.`,
      });
    }
  }

  // Asymmetry check
  if (leftAcuity && rightAcuity) {
    const ld = parseInt(leftAcuity.split("/")[1], 10);
    const rd = parseInt(rightAcuity.split("/")[1], 10);
    if (Math.abs(ld - rd) >= 12) {
      findings.push({
        type: "warning",
        title: "Significant Eye Asymmetry",
        description: `There is a notable difference between your left (${leftAcuity}) and right (${rightAcuity}) eye. This should be evaluated by an optometrist.`,
      });
    }
  }

  if (leftD != null && rightD != null) {
    findings.push({
      type: "info",
      title: "Estimated Refractive Error",
      description: `Left eye: ${leftD.toFixed(2)}D, Right eye: ${rightD.toFixed(2)}D. This is an AI-based estimate and should be confirmed by a professional refraction test.`,
    });
  }

  return findings;
}

function buildRecommendations(leftAcuity, rightAcuity, leftD, rightD) {
  const recs = [];
  const worst = [leftAcuity, rightAcuity]
    .filter(Boolean)
    .map((a) => parseInt(a.split("/")[1], 10))
    .sort((a, b) => b - a)[0];

  if (worst && worst > 12) {
    recs.push("Schedule a comprehensive eye exam with an optometrist to get an accurate prescription.");
    recs.push("Avoid prolonged screen time without corrective lenses if you experience strain or headaches.");
  }

  if (worst && worst > 24) {
    recs.push("You may benefit from prescription glasses for distance tasks like driving or watching presentations.");
  }

  recs.push("Follow the 20-20-20 rule: every 20 minutes, look at something 20 feet away for 20 seconds.");
  recs.push("Ensure adequate lighting when reading or working on screens.");
  recs.push("Re-test periodically (every 6-12 months) to track changes in your vision over time.");

  return recs;
}
