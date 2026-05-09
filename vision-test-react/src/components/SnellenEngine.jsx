import { useState, useEffect, useRef, useCallback } from "react";
import { AlertTriangle, Mic } from "lucide-react";

// Standard Snellen optotypes
const OPTOTYPES = ["C", "D", "E", "F", "L", "N", "O", "P", "T", "Z"];
const LETTERS_PER_ROW = 5;
const PASS_THRESHOLD = 3;

// ─── Phonetic alias map ───────────────────────────────────
// Maps every plausible spoken form → the canonical letter.
// Covers: the letter itself, NATO phonetics, common mis-transcriptions,
// and how the Web Speech API typically transcribes single letters.
const PHONETIC_MAP = {
  C: ["c", "sea", "see", "si", "charlie", "ce", "the c"],
  D: ["d", "dee", "de", "delta", "di"],
  E: ["e", "echo", "ee", "ea", "he", "me", "be", "we"],
  F: ["f", "ef", "foxtrot", "ph", "half"],
  L: ["l", "el", "lima", "elle", "al", "ll"],
  N: ["n", "en", "november", "and", "in", "any"],
  O: ["o", "oh", "oscar", "zero", "owe", "eau", "oo"],
  P: ["p", "pee", "papa", "pe", "pi"],
  T: ["t", "tee", "tea", "tango", "ti", "the"],
  Z: ["z", "zee", "zed", "zulu", "se", "said"],
};

// Build reverse lookup once at module level: "sea" → "C"
const PHONETIC_LOOKUP = {};
Object.entries(PHONETIC_MAP).forEach(([letter, aliases]) => {
  aliases.forEach((alias) => {
    PHONETIC_LOOKUP[alias.toLowerCase()] = letter;
  });
  // Always include the bare letter itself (upper + lower)
  PHONETIC_LOOKUP[letter.toLowerCase()] = letter;
});

/** Try to extract a valid optotype letter from any transcript string. */
function transcriptToLetter(transcript) {
  const clean = transcript.trim().toLowerCase();

  // 1. Exact phrase match (handles multi-word aliases like "the c")
  if (PHONETIC_LOOKUP[clean]) return PHONETIC_LOOKUP[clean];

  // 2. Word-by-word scan
  const words = clean.split(/\s+/);
  for (const word of words) {
    if (PHONETIC_LOOKUP[word]) return PHONETIC_LOOKUP[word];
  }

  // 3. First character fallback
  const first = clean.charAt(0).toUpperCase();
  if (OPTOTYPES.includes(first)) return first;

  return null;
}

function pickLetters(count) {
  const pool = [...OPTOTYPES];
  const result = [];
  for (let i = 0; i < count; i++) {
    const available = pool.filter((c) => !result.includes(c));
    if (available.length === 0) break;
    result.push(available[Math.floor(Math.random() * available.length)]);
  }
  return result;
}

const SpeechRecognition =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export function SnellenEngine({
  ppi,
  acuityLevel,
  levelIndex,
  onLevelResult,
  isDarkMode,
  testingEye,
  visionOk,
  coveredEyeLabel,
  resetToken,
}) {
  const [rowLetters, setRowLetters] = useState(() => pickLetters(LETTERS_PER_ROW));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [letterHistory, setLetterHistory] = useState(() => Array(LETTERS_PER_ROW).fill(null));
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [feedback, setFeedback] = useState(null);

  const pendingTimerRef = useRef(null);
  const processingRef = useRef(false);
  const resetGenRef = useRef(0);

  // Voice state
  const [micActive, setMicActive] = useState(false);
  const [voiceHeard, setVoiceHeard] = useState(null);
  // interimLetter: shown while the engine is still transcribing (before isFinal)
  const [interimLetter, setInterimLetter] = useState(null);
  const recognitionRef = useRef(null);
  const visionOkRef = useRef(false);
  const rafRestartRef = useRef(null);

  const scaleMap = {
    "6/60": 10, "6/36": 6, "6/24": 4, "6/18": 3,
    "6/12": 2, "6/9": 1.5, "6/6": 1,
  };
  const scaleFactor = scaleMap[acuityLevel] || 1;
  const pixelHeight = Math.round(0.34 * ppi * scaleFactor);

  // ─── Full reset on level / forced reset ─────────────────
  useEffect(() => {
    resetGenRef.current += 1;
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    setRowLetters(pickLetters(LETTERS_PER_ROW));
    setCurrentIndex(0);
    setCorrectCount(0);
    setWrongCount(0);
    setFeedback(null);
    setVoiceHeard(null);
    setInterimLetter(null);
    setLetterHistory(Array(LETTERS_PER_ROW).fill(null));
    processingRef.current = false;
  }, [acuityLevel, resetToken]);

  // ─── Core answer handler ─────────────────────────────
  const handleAnswer = useCallback(
    (key) => {
      if (processingRef.current || !visionOk) return;
      processingRef.current = true;
      const myGen = resetGenRef.current;

      const expected = rowLetters[currentIndex];
      const isCorrect = key === expected;
      const newCorrect = correctCount + (isCorrect ? 1 : 0);
      const newWrong   = wrongCount   + (isCorrect ? 0 : 1);

      setFeedback(isCorrect ? "correct" : "wrong");
      setInterimLetter(null);
      if (isCorrect) setCorrectCount(newCorrect);
      else           setWrongCount(newWrong);

      setLetterHistory((prev) => {
        const next = [...prev];
        next[currentIndex] = isCorrect ? "correct" : "wrong";
        return next;
      });

      const nextIndex = currentIndex + 1;

      pendingTimerRef.current = setTimeout(() => {
        pendingTimerRef.current = null;
        if (myGen !== resetGenRef.current) return; // reset happened mid-timer

        setFeedback(null);
        setVoiceHeard(null);

        if (newCorrect >= PASS_THRESHOLD) {
          onLevelResult(true, levelIndex);
          processingRef.current = false;
          return;
        }
        if (newWrong > LETTERS_PER_ROW - PASS_THRESHOLD) {
          onLevelResult(false, levelIndex);
          processingRef.current = false;
          return;
        }
        if (nextIndex >= LETTERS_PER_ROW) {
          onLevelResult(newCorrect >= PASS_THRESHOLD, levelIndex);
          processingRef.current = false;
          return;
        }

        setCurrentIndex(nextIndex);
        processingRef.current = false;
      }, 200);
    },
    [rowLetters, currentIndex, correctCount, wrongCount, visionOk, onLevelResult, levelIndex]
  );

  const handleAnswerRef = useRef(handleAnswer);
  handleAnswerRef.current = handleAnswer;

  // ─── Keyboard input ──────────────────────────────────
  useEffect(() => {
    if (!visionOk) return;
    const onKey = (e) => {
      const key = e.key.toUpperCase();
      if (OPTOTYPES.includes(key)) {
        e.preventDefault();
        handleAnswer(key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleAnswer, visionOk]);

  // ─── Voice Recognition ───────────────────────────────
  //
  // KEY ARCHITECTURAL CHANGES vs. previous implementation:
  //
  // 1. continuous=FALSE — the browser commits a final result immediately after
  //    the user stops speaking, instead of waiting 1-3 s for more speech.
  //    This is the single biggest latency win.
  //
  // 2. maxAlternatives=5 — we check all alternatives through the phonetic map
  //    so a slightly mis-heard word still resolves to the right letter.
  //
  // 3. Interim results → setInterimLetter — the user sees visual feedback
  //    while still speaking, so they know they were heard.
  //
  // 4. Restart via requestAnimationFrame — instead of a fixed setTimeout the
  //    restart happens in the next paint frame (~16 ms), eliminating the
  //    dead-mic window between utterances.
  //
  // 5. Phonetic alias map — handles "Charlie"→C, "sea"→C, "Delta"→D, etc.
  //    so the user can speak naturally without repeating bare letters.
  //
  useEffect(() => {
    if (!SpeechRecognition) return;
    let active = true;
    let gen = 0;

    function startListening() {
      if (!active) return;

      // Cancel any queued rAF restart before creating a new session.
      if (rafRestartRef.current) {
        cancelAnimationFrame(rafRestartRef.current);
        rafRestartRef.current = null;
      }

      const myGen = ++gen;

      try { recognitionRef.current?.abort(); } catch {}
      recognitionRef.current = null;

      const rec = new SpeechRecognition();
      rec.lang = "en-US";
      rec.continuous = false;      // ← commit results fast
      rec.interimResults = true;   // ← show live feedback
      rec.maxAlternatives = 5;     // ← more chances to match via phonetics

      rec.onresult = (event) => {
        if (myGen !== gen) return;
        // If already processing a previous answer (200ms feedback window),
        // ignore everything — the session will restart after the window clears.
        if (processingRef.current) return;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];

          // Scan all alternatives through the phonetic map
          let matched = null;
          for (let alt = 0; alt < result.length; alt++) {
            const letter = transcriptToLetter(result[alt].transcript);
            if (letter) { matched = letter; break; }
          }

          if (!matched) {
            // Nothing matched yet — show a "…" hint so the user knows
            // the mic is hearing them even if the word isn't recognised yet
            if (!result.isFinal) setInterimLetter("…");
            continue;
          }

          // ── COMMIT ON INTERIM (the core latency fix) ──────────────────
          // We no longer wait for isFinal. The moment an interim transcript
          // matches a valid optotype we commit it immediately. This eliminates
          // the 1-2 s end-of-speech detection delay that made the test feel slow.
          setInterimLetter(null);
          setVoiceHeard(matched);
          handleAnswerRef.current(matched);

          // Abort this session now that we have our answer.
          // onend will fire → restart is delayed 220ms (processingRef=true)
          // so the new session is ready the moment the feedback clears.
          setTimeout(() => {
            if (myGen === gen) try { recognitionRef.current?.abort(); } catch {}
          }, 0);
          return; // done with this event
        }
      };

      rec.onerror = (event) => {
        if (myGen !== gen) return;
        // no-speech is normal (silence), aborted is intentional — ignore both
        if (event.error !== "no-speech" && event.error !== "aborted") {
          console.warn("[Voice] error:", event.error);
        }
      };

      rec.onend = () => {
        if (myGen !== gen) return;
        if (!active) return;
        // If we are mid-feedback (processingRef=true), the 200ms timer hasn't
        // cleared yet. Starting a new session immediately would let the user
        // speak the next letter, produce a final result, and have it silently
        // dropped because processingRef blocks handleAnswer. Instead, wait until
        // the processing window is guaranteed to be over (220ms > 200ms timer).
        const restartDelay = processingRef.current ? 220 : 0;
        setTimeout(() => {
          if (!active) return;
          rafRestartRef.current = requestAnimationFrame(() => {
            rafRestartRef.current = null;
            if (active) startListening();
          });
        }, restartDelay);
      };

      recognitionRef.current = rec;
      try {
        rec.start();
        setMicActive(true);
      } catch {
        // If start() throws (e.g. permission race), retry after one frame
        rafRestartRef.current = requestAnimationFrame(() => {
          rafRestartRef.current = null;
          if (active && myGen === gen) startListening();
        });
      }
    }

    startListening();

    return () => {
      active = false;
      if (rafRestartRef.current) {
        cancelAnimationFrame(rafRestartRef.current);
        rafRestartRef.current = null;
      }
      try { recognitionRef.current?.abort(); } catch {}
      recognitionRef.current = null;
      setMicActive(false);
      setInterimLetter(null);
    };
  }, []);

  // Sync visionOk into ref (used inside voice callbacks via closure)
  useEffect(() => {
    visionOkRef.current = visionOk;
    if (!visionOk) setInterimLetter(null);
  }, [visionOk]);

  // ─── Paused state ────────────────────────────────────
  if (!visionOk) {
    return (
      <div className="flex flex-col items-center justify-center p-8 h-full">
        <div className={`flex items-center gap-3 mb-4 ${isDarkMode ? "text-amber-400" : "text-amber-600"}`}>
          <AlertTriangle className="w-8 h-8" />
          <h2 className="text-2xl font-bold">Test Paused</h2>
        </div>
        <p className={`text-center max-w-sm text-lg ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
          Look at the camera and maintain 50-60 cm distance.
        </p>
      </div>
    );
  }

  const currentLetter = rowLetters[currentIndex];

  // Choose which letter to display in the mic badge
  const micBadgeLetter = voiceHeard || interimLetter;
  const micBadgeIsInterim = !voiceHeard && !!interimLetter;

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 select-none overflow-y-auto">
      {/* Acuity level badge */}
      <div className={`mb-2 px-4 py-1.5 rounded-full text-sm font-bold tracking-wider ${
        isDarkMode ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30" : "bg-cyan-50 text-cyan-700 border border-cyan-200"
      }`}>
        {acuityLevel} — Letter {currentIndex + 1}/{LETTERS_PER_ROW}
      </div>

      {/* Eye cover reminder */}
      <div className={`mb-3 px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 ${
        isDarkMode ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-amber-50 text-amber-700 border border-amber-200"
      }`}>
        👁️ Keep your {coveredEyeLabel} eye covered
      </div>

      {/* The optotype */}
      <div
        className={`font-sans font-black flex items-center justify-center transition-colors duration-150 my-2 ${
          feedback === "correct" ? "text-green-500"
          : feedback === "wrong"   ? "text-red-500"
          : isDarkMode ? "text-white" : "text-black"
        }`}
        style={{ fontSize: `${Math.min(pixelHeight, 400)}px`, lineHeight: 1 }}
      >
        {currentLetter}
      </div>

      {/* Progress dots */}
      <div className="flex gap-2 mt-4 mb-2">
        {rowLetters.map((_, i) => {
          let dotClass;
          if (i < currentIndex) {
            dotClass = letterHistory[i] === "correct" ? "bg-green-500"
              : letterHistory[i] === "wrong" ? "bg-red-500"
              : isDarkMode ? "bg-slate-600" : "bg-slate-400";
          } else if (i === currentIndex) {
            dotClass = isDarkMode ? "bg-white ring-2 ring-white/30" : "bg-slate-900 ring-2 ring-slate-900/20";
          } else {
            dotClass = isDarkMode ? "bg-slate-700" : "bg-slate-300";
          }
          return <div key={i} className={`w-3 h-3 rounded-full transition-all duration-200 ${dotClass}`} />;
        })}
      </div>

      {/* Score */}
      <div className={`text-sm font-medium mb-3 ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
        {correctCount} correct · {wrongCount} wrong · Need {PASS_THRESHOLD}/{LETTERS_PER_ROW}
      </div>

      {/* ── Mic feedback badge ── */}
      {micBadgeLetter ? (
        // Heard a letter (interim or confirmed)
        <div className={`mb-3 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
          micBadgeIsInterim
            ? isDarkMode
              ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 animate-pulse"
              : "bg-yellow-50 text-yellow-600 border border-yellow-300 animate-pulse"
            : feedback === "correct"
            ? "bg-green-500/10 text-green-500 border border-green-500/30"
            : "bg-red-500/10 text-red-500 border border-red-500/30"
        }`}>
          🎤 {micBadgeIsInterim ? "Hearing" : "Heard"}: "{micBadgeLetter}"
          {micBadgeIsInterim && <span className="text-xs opacity-70 ml-1">…</span>}
        </div>
      ) : micActive ? (
        // Listening, nothing heard yet
        <div className={`mb-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 ${
          isDarkMode ? "text-cyan-400" : "text-cyan-600"
        }`}>
          <Mic className="w-3.5 h-3.5 animate-pulse" /> Listening…
        </div>
      ) : null}

      {/* Phonetic hint */}
      <div className={`mb-3 text-[11px] text-center leading-relaxed max-w-xs ${isDarkMode ? "text-slate-600" : "text-slate-400"}`}>
        Say the letter, or a word — <span className="font-semibold">Charlie · Sea · Delta · Echo · Foxtrot · Lima · November · Oscar · Tango · Zulu</span>
      </div>

      {/* ─── Clickable letter buttons ─── */}
      <div className="w-full max-w-md">
        <div className="grid grid-cols-5 gap-2">
          {OPTOTYPES.map((opt) => (
            <button
              key={opt}
              onClick={() => handleAnswer(opt)}
              disabled={!!feedback}
              className={`h-11 rounded-xl text-base font-bold transition-all active:scale-95 disabled:opacity-50 ${
                isDarkMode
                  ? "bg-slate-800 hover:bg-cyan-500/30 text-white border border-slate-700 hover:border-cyan-500/50"
                  : "bg-white hover:bg-cyan-50 text-slate-900 border-2 border-slate-200 hover:border-cyan-400 shadow-sm"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
