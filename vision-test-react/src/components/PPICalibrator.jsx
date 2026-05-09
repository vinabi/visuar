import React, { useState } from "react";
import { CreditCard, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function PPICalibrator({ onCalibrate, isDarkMode }) {
  const [boxWidth, setBoxWidth] = useState(300);

  const handleConfirm = () => {
    const ppi = boxWidth / 3.37;
    onCalibrate(ppi);
  };

  return (
    <div className="flex flex-col items-center max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-3">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${isDarkMode ? "bg-cyan-500/20 text-cyan-400" : "bg-cyan-100 text-cyan-600"}`}>
          <CreditCard className="w-8 h-8" />
        </div>
        <h2 className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>Screen Calibration</h2>
        <p className={`${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
          Hold a standard credit card or ID against your screen. <br/>
          Use the slider to shrink or expand the box below until it exactly matches the physical width of your card.
        </p>
      </div>

      <div className={`w-full flex flex-col items-center py-12 px-4 rounded-2xl border shadow-inner ${isDarkMode ? 'bg-black/20 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
        <div 
          className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg shadow-xl flex items-center justify-center text-white relative transition-all duration-75"
          style={{ width: `${boxWidth}px`, height: `${boxWidth * 0.63}px` }}
        >
          <CreditCard className="w-1/3 h-1/3 opacity-30" />
          <div className="absolute font-mono text-xs bottom-2 opacity-70">8.56 cm</div>
        </div>
      </div>

      <div className="w-full max-w-md space-y-2">
        <label className={`text-sm font-semibold flex justify-between ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
          <span>Adjust Box Size</span>
          <span className="font-mono">{boxWidth} px</span>
        </label>
        <input 
          type="range" 
          min="100" 
          max="1000"
          value={boxWidth}
          onChange={(e) => setBoxWidth(parseInt(e.target.value))}
          className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-cyan-500"
        />
      </div>

      <Button size="lg" className="px-10 h-14 rounded-full mt-4" onClick={handleConfirm}>
        <CheckCircle2 className="w-5 h-5 mr-2" /> Setup Complete
      </Button>
    </div>
  );
}
