import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Plus,
  TrendingUp,
  Calendar,
  Download,
  Eye,
  Settings,
  LogOut,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

const API_URL = "http://localhost:8000";

export default function DashboardPage() {
  const { t } = useTranslation();
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();
  const { signOut, user, session } = useAuth();

  const [testHistory, setTestHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  // Get user's display name
  const getUserName = () => {
    if (user?.user_metadata?.full_name) return user.user_metadata.full_name;
    if (user?.email) return user.email.split("@")[0];
    return "User";
  };

  // Fetch real test history from database
  useEffect(() => {
    const fetchHistory = async () => {
      if (!session?.access_token) { setHistoryLoading(false); return; }
      try {
        const res = await fetch(`${API_URL}/api/test-results`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setTestHistory(
            data.map((r) => ({
              id: r.id,
              date: r.created_at,
              type: r.test_type === "snellen-acuity" ? "Snellen Acuity" : r.test_type,
              score: r.overall_score,
              left_acuity: r.left_eye_acuity,
              right_acuity: r.right_eye_acuity,
              status: r.overall_score >= 80 ? "excellent" : r.overall_score >= 50 ? "good" : "poor",
            }))
          );
        }
      } catch (err) {
        console.error("[Dashboard] Failed to fetch history:", err);
      }
      setHistoryLoading(false);
    };
    fetchHistory();
  }, [session]);

  const averageScore = testHistory.length > 0
    ? Math.round(testHistory.reduce((sum, t) => sum + t.score, 0) / testHistory.length)
    : 0;
  const latestScore = testHistory.length > 0 ? testHistory[0].score : 0;
  const scoreImprovement = testHistory.length >= 2
    ? testHistory[0].score - testHistory[testHistory.length - 1].score
    : 0;

  return (
    <div
      className={`min-h-screen p-4 md:p-8 relative overflow-hidden transition-colors duration-300 ${
        isDarkMode
          ? "bg-[#0a0e27]"
          : "bg-gradient-to-br from-blue-50 via-cyan-50 to-white"
      }`}
    >
      <AnimatedBackground isDarkMode={isDarkMode} />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link to="/">
            <Button
              variant="ghost"
              className={`transition-colors ${
                isDarkMode
                  ? "text-slate-300 hover:text-white hover:bg-slate-800/50"
                  : "text-slate-700 hover:text-cyan-600 hover:bg-white/60"
              }`}
            >
              <ArrowLeft className="mr-2 w-4 h-4" />
              {t("common.back")}
            </Button>
          </Link>
          <div className="flex gap-2">
            <LanguageSelector />
            <Link to="/settings">
              <Button
                variant="ghost"
                className={`transition-colors ${
                  isDarkMode
                    ? "text-slate-300 hover:text-white hover:bg-slate-800/50"
                    : "text-slate-700 hover:text-cyan-600 hover:bg-white/60"
                }`}
              >
                <Settings className="w-5 h-5" />
              </Button>
            </Link>
            <Button
              variant="ghost"
              className={`transition-colors ${
                isDarkMode
                  ? "text-slate-300 hover:text-red-400 hover:bg-slate-800/50"
                  : "text-slate-700 hover:text-red-600 hover:bg-white/60"
              }`}
              onClick={handleLogout}
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Main Content Card */}
        <div
          className={`backdrop-blur-md rounded-3xl shadow-xl p-8 md:p-12 transition-colors ${
            isDarkMode
              ? "bg-[#1a1f3a]/80 border border-slate-700/50"
              : "bg-white/80 border border-white/40"
          }`}
        >
          {/* Title Section */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
            <div>
              <h1
                className={`text-4xl md:text-5xl font-bold mb-2 transition-colors ${
                  isDarkMode ? "text-white" : "text-slate-900"
                }`}
              >
                {t("dashboard.title")}
              </h1>
              <p
                className={`text-lg transition-colors ${
                  isDarkMode ? "text-slate-300" : "text-slate-600"
                }`}
              >
                {t("dashboard.welcome")},{" "}
                <span
                  className={`font-semibold transition-colors ${
                    isDarkMode ? "text-cyan-400" : "text-cyan-600"
                  }`}
                >
                  {getUserName()}
                </span>
              </p>
            </div>
            <div className="flex gap-3">
              <Link to="/test-selection">
                <Button
                  size="lg"
                  className={`h-14 px-10 text-white text-lg rounded-full shadow-lg hover:shadow-xl transition-all ${
                    isDarkMode
                      ? "bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500"
                      : "bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
                  }`}
                >
                  <Plus className="mr-2 w-5 h-5" />
                  {t("dashboard.newTest")}
                </Button>
              </Link>
              <Link to="/profile">
                <Button
                  size="lg"
                  variant="outline"
                  className={`h-14 px-8 rounded-full transition-all ring-2 ring-offset-2 ${
                    isDarkMode
                      ? "border-cyan-400/30 text-cyan-400 hover:bg-cyan-400/10 hover:border-cyan-400/50 bg-slate-800/30 ring-cyan-400/60 ring-offset-[#0a0e27]"
                      : "border-cyan-500/20 text-cyan-600 hover:bg-cyan-500 hover:text-white hover:border-cyan-500 bg-transparent ring-cyan-500/40 ring-offset-white"
                  }`}
                >
                  {t("dashboard.profile")}
                </Button>
              </Link>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            <div
              className={`group rounded-2xl p-6 border hover:shadow-lg transition-all cursor-pointer active:scale-95 ${
                isDarkMode
                  ? "bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-400/20 shadow-lg shadow-cyan-500/10"
                  : "bg-gradient-to-br from-cyan-50 to-blue-50 border-cyan-100 shadow-md"
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    isDarkMode ? "bg-cyan-400/20" : "bg-cyan-500/20"
                  }`}
                >
                  <Eye
                    className={`w-6 h-6 ${
                      isDarkMode ? "text-cyan-400" : "text-cyan-600"
                    }`}
                  />
                </div>
                <Badge
                  className={`transition-all ${
                    isDarkMode
                      ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-400 group-hover:bg-cyan-500 group-hover:text-white group-hover:border-black/20"
                      : "bg-cyan-500 text-white group-hover:bg-cyan-600"
                  }`}
                >
                  Latest
                </Badge>
              </div>
              <div
                className={`text-3xl font-bold mb-1 transition-colors ${
                  isDarkMode ? "text-white" : "text-slate-900"
                }`}
              >
                {latestScore}
              </div>
              <div
                className={`text-sm transition-colors ${
                  isDarkMode ? "text-slate-400" : "text-slate-600"
                }`}
              >
                {t("dashboard.latestScore")}
              </div>
            </div>

            <div
              className={`group rounded-2xl p-6 border hover:shadow-lg transition-all cursor-pointer active:scale-95 ${
                isDarkMode
                  ? "bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border-blue-400/20 shadow-lg shadow-blue-500/10"
                  : "bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100 shadow-md"
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    isDarkMode ? "bg-blue-400/20" : "bg-blue-500/20"
                  }`}
                >
                  <TrendingUp
                    className={`w-6 h-6 ${
                      isDarkMode ? "text-blue-400" : "text-blue-600"
                    }`}
                  />
                </div>
                <Badge
                  className={`transition-all ${
                    isDarkMode
                      ? "bg-blue-500/20 border-blue-500/30 text-blue-400 group-hover:bg-blue-500 group-hover:text-white group-hover:border-black/20"
                      : "bg-blue-500 text-white group-hover:bg-blue-600"
                  }`}
                >
                  Average
                </Badge>
              </div>
              <div
                className={`text-3xl font-bold mb-1 transition-colors ${
                  isDarkMode ? "text-white" : "text-slate-900"
                }`}
              >
                {averageScore}
              </div>
              <div
                className={`text-sm transition-colors ${
                  isDarkMode ? "text-slate-400" : "text-slate-600"
                }`}
              >
                {t("dashboard.averageScore")}
              </div>
            </div>

            <div
              className={`group rounded-2xl p-6 border hover:shadow-lg transition-all cursor-pointer active:scale-95 ${
                isDarkMode
                  ? "bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-400/20 shadow-lg shadow-green-500/10"
                  : "bg-gradient-to-br from-green-50 to-emerald-50 border-green-100 shadow-md"
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    isDarkMode ? "bg-green-400/20" : "bg-green-500/20"
                  }`}
                >
                  <TrendingUp
                    className={`w-6 h-6 ${
                      isDarkMode ? "text-green-400" : "text-green-600"
                    }`}
                  />
                </div>
                <Badge
                  className={
                    scoreImprovement >= 0
                      ? isDarkMode
                        ? "bg-green-500/20 border-green-500/30 text-green-400 group-hover:bg-green-500 group-hover:text-white group-hover:border-black/20 transition-all"
                        : "bg-green-500 text-white group-hover:bg-green-600 transition-all"
                      : isDarkMode
                      ? "bg-red-500/20 border-red-500/30 text-red-400 group-hover:bg-red-500 group-hover:text-white group-hover:border-black/20 transition-all"
                      : "bg-red-500 text-white group-hover:bg-red-600 transition-all"
                  }
                >
                  {scoreImprovement >= 0
                    ? `+${scoreImprovement}`
                    : scoreImprovement}
                </Badge>
              </div>
              <div
                className={`text-3xl font-bold mb-1 transition-colors ${
                  isDarkMode ? "text-white" : "text-slate-900"
                }`}
              >
                {scoreImprovement >= 0
                  ? t("dashboard.improvement")
                  : "Declining"}
              </div>
              <div
                className={`text-sm transition-colors ${
                  isDarkMode ? "text-slate-400" : "text-slate-600"
                }`}
              >
                {t("dashboard.status")}
              </div>
            </div>

            <div
              className={`group rounded-2xl p-6 border hover:shadow-lg transition-all cursor-pointer active:scale-95 ${
                isDarkMode
                  ? "bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-400/20 shadow-lg shadow-purple-500/10"
                  : "bg-gradient-to-br from-purple-50 to-pink-50 border-purple-100 shadow-md"
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    isDarkMode ? "bg-purple-400/20" : "bg-purple-500/20"
                  }`}
                >
                  <Calendar
                    className={`w-6 h-6 ${
                      isDarkMode ? "text-purple-400" : "text-purple-600"
                    }`}
                  />
                </div>
                <Badge
                  className={`transition-all ${
                    isDarkMode
                      ? "bg-purple-500/20 border-purple-500/30 text-purple-400 group-hover:bg-purple-500 group-hover:text-white group-hover:border-black/20"
                      : "bg-purple-500 text-white group-hover:bg-purple-600"
                  }`}
                >
                  Total
                </Badge>
              </div>
              <div
                className={`text-3xl font-bold mb-1 transition-colors ${
                  isDarkMode ? "text-white" : "text-slate-900"
                }`}
              >
                {testHistory.length}
              </div>
              <div
                className={`text-sm transition-colors ${
                  isDarkMode ? "text-slate-400" : "text-slate-600"
                }`}
              >
                Tests Completed
              </div>
            </div>
          </div>

          {/* Test History */}
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2
                className={`text-2xl font-bold transition-colors ${
                  isDarkMode ? "text-white" : "text-slate-900"
                }`}
              >
                {t("dashboard.testHistory")}
              </h2>
              <Button
                variant="outline"
                size="sm"
                className={`transition-colors ${
                  isDarkMode
                    ? "border-slate-600 text-slate-300 bg-slate-800/50 hover:bg-slate-700/50"
                    : "border-slate-300 text-slate-700 bg-transparent"
                }`}
              >
                <Download className="mr-2 w-4 h-4" />
                {t("dashboard.downloadReport")}
              </Button>
            </div>

            <div className="space-y-4">
              {historyLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className={`w-8 h-8 animate-spin ${isDarkMode ? "text-cyan-400" : "text-cyan-600"}`} />
                  <span className={`ml-3 text-lg ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Loading history…</span>
                </div>
              ) : testHistory.length === 0 ? (
                <div className={`text-center py-12 rounded-xl border ${isDarkMode ? "border-slate-700/50 bg-slate-800/20" : "border-slate-200 bg-slate-50"}`}>
                  <Eye className={`w-10 h-10 mx-auto mb-3 ${isDarkMode ? "text-slate-600" : "text-slate-300"}`} />
                  <p className={`text-lg font-medium ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>No tests yet</p>
                  <p className={`text-sm mt-1 ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>Complete your first vision test to see results here.</p>
                </div>
              ) : (
              testHistory.map((test) => (
                <div
                  key={test.id}
                  className={`flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-xl border hover:shadow-md transition-all ${
                    isDarkMode
                      ? "bg-slate-800/30 border-slate-700/50 hover:border-cyan-400/50 hover:bg-slate-800/50"
                      : "bg-white border-slate-200 hover:border-cyan-300"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                        isDarkMode ? "bg-cyan-400/20" : "bg-cyan-100"
                      }`}
                    >
                      <Eye
                        className={`w-6 h-6 ${
                          isDarkMode ? "text-cyan-400" : "text-cyan-600"
                        }`}
                      />
                    </div>
                    <div>
                      <div
                        className={`font-semibold transition-colors ${
                          isDarkMode ? "text-white" : "text-slate-900"
                        }`}
                      >
                        {test.type}
                      </div>
                      <div
                        className={`text-sm transition-colors ${
                          isDarkMode ? "text-slate-400" : "text-slate-600"
                        }`}
                      >
                        {new Date(test.date).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div
                        className={`text-2xl font-bold transition-colors ${
                          isDarkMode ? "text-white" : "text-slate-900"
                        }`}
                      >
                        {test.score}
                      </div>
                      <Badge
                        className={
                          test.status === "excellent"
                            ? isDarkMode
                              ? "bg-green-500/20 border-green-500/30 text-green-400 transition-all"
                              : "bg-green-500 text-white transition-all"
                            : test.status === "good"
                            ? isDarkMode
                              ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-400 transition-all"
                              : "bg-cyan-500 text-white transition-all"
                            : isDarkMode
                            ? "bg-slate-500/20 border-slate-500/30 text-slate-400 transition-all"
                            : "bg-slate-500 text-white transition-all"
                        }
                      >
                        {test.status}
                      </Badge>
                    </div>
                    <Link to={`/results/${test.id}`}>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`transition-all ${
                          isDarkMode
                            ? "border-cyan-400/30 text-cyan-400 hover:bg-cyan-400/10 hover:border-slate-700/50 hover:shadow-md bg-transparent"
                            : "border-cyan-300 text-cyan-600 hover:bg-cyan-500 hover:text-white hover:border-cyan-500 bg-transparent"
                        }`}
                      >
                        {t("dashboard.viewDetails")}
                      </Button>
                    </Link>
                  </div>
                </div>
              ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
