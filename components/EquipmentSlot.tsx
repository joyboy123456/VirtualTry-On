import React, { useRef, useState } from 'react';
import { Upload, X, Loader2, CheckCircle2, Sparkles, Save } from 'lucide-react';

interface EquipmentSlotProps {
  id: string;
  label: string;
  subLabel?: string;
  image: string | null;
  loading?: boolean;
  analyzed?: boolean;
  customModifier?: string;
  onSelect: (file: File, base64: string) => void;
  onRemove: () => void;
  onUpdateModifier?: (modifier: string) => void;
  className?: string;
}

export const EquipmentSlot: React.FC<EquipmentSlotProps> = ({
  id, label, subLabel, image, loading, analyzed, customModifier, onSelect, onRemove, onUpdateModifier, className
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [tempModifier, setTempModifier] = useState("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        onSelect(file, reader.result as string);
        if (inputRef.current) inputRef.current.value = '';
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveModifier = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onUpdateModifier) {
      onUpdateModifier(tempModifier);
    }
    setIsEditing(false);
  };

  const startEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempModifier(customModifier || "");
    setIsEditing(true);
  };

  return (
    <div className={`relative group ${className}`}>
      <div 
        className={`
          relative w-full h-full min-h-[100px] bg-gray-900/40 border transition-all duration-300 backdrop-blur-sm flex flex-col items-center justify-center
          ${image ? 'border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.15)]' : 'border-gray-800 hover:border-gray-600 hover:bg-gray-800/50'}
          rounded-xl overflow-hidden cursor-pointer
        `}
        onClick={() => !image && !isEditing && inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        
        {image ? (
          <>
            <img src={image} alt={label} className={`w-full h-full object-cover transition-opacity ${isEditing ? 'opacity-20 blur-sm' : 'opacity-80 group-hover:opacity-100'}`} />
            
            {/* Top Controls */}
            <div className={`absolute top-1 left-1 right-1 flex justify-between z-10 ${isEditing ? 'hidden' : 'opacity-0 group-hover:opacity-100 transition-opacity'}`}>
              {/* Modifier Button */}
              <button 
                onClick={startEditing}
                className={`p-1.5 rounded-full backdrop-blur-md border transition-colors ${customModifier ? 'bg-purple-600 text-white border-purple-400' : 'bg-black/60 text-cyan-400 hover:bg-cyan-900 border-transparent'}`}
                title="添加穿搭细节（如：宽松、拖地、塞进裤腰）"
              >
                <Sparkles size={12} />
              </button>

              {/* Remove Button */}
              <button 
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="p-1.5 bg-black/60 rounded-full text-red-400 hover:bg-red-500 hover:text-white transition-colors backdrop-blur-md"
              >
                <X size={12} />
              </button>
            </div>

            {/* Modifier Indicator (When not hovering) */}
            {customModifier && !isEditing && (
              <div className="absolute top-1 left-1 z-0 group-hover:opacity-0 transition-opacity">
                 <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>
              </div>
            )}

            {/* Editing Overlay */}
            {isEditing && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-2 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                <span className="text-[10px] text-cyan-400 font-mono mb-1 uppercase">穿搭细节微调</span>
                <textarea
                  value={tempModifier}
                  onChange={(e) => setTempModifier(e.target.value)}
                  className="w-full h-16 bg-black/50 border border-cyan-500/50 rounded text-xs text-white p-2 mb-2 focus:outline-none focus:bg-black/80 resize-none font-mono"
                  placeholder="例如：裤腿拖地、宽松版型..."
                  autoFocus
                />
                <div className="flex gap-2 w-full">
                   <button 
                    onClick={() => setIsEditing(false)}
                    className="flex-1 py-1 bg-gray-800 text-gray-300 text-[10px] rounded hover:bg-gray-700"
                   >
                     取消
                   </button>
                   <button 
                    onClick={handleSaveModifier}
                    className="flex-1 py-1 bg-cyan-700 text-white text-[10px] rounded hover:bg-cyan-600 flex items-center justify-center gap-1"
                   >
                     <Save size={10} /> 确认
                   </button>
                </div>
              </div>
            )}

            {/* Status Indicators */}
            {!isEditing && (
              <div className="absolute bottom-1 right-1 flex gap-1 z-10 pointer-events-none">
                 {loading && <Loader2 size={14} className="text-cyan-400 animate-spin" />}
                 {analyzed && !loading && <CheckCircle2 size={14} className="text-green-400" />}
              </div>
            )}
            
            {/* Label Overlay */}
            {!isEditing && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 py-1 px-2 text-[10px] text-gray-300 font-mono pointer-events-none flex justify-between items-center">
                <span>{label}</span>
                {customModifier && <span className="text-[8px] text-purple-400 px-1 border border-purple-500/30 rounded">已微调</span>}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center p-2 text-center space-y-2">
            <span className="text-xs text-gray-400 font-mono font-bold uppercase tracking-wider">{label}</span>
            <span className="text-[10px] text-gray-600">{subLabel || '未装备'}</span>
            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center group-hover:bg-cyan-900/30 group-hover:text-cyan-400 transition-colors">
               <Upload size={14} />
            </div>
          </div>
        )}
      </div>
      
      {/* Decorative Corner Markers */}
      <div className="absolute top-0 left-0 w-2 h-2 border-l border-t border-gray-600/30 group-hover:border-cyan-500/30 transition-colors rounded-tl-sm pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-2 h-2 border-r border-b border-gray-600/30 group-hover:border-cyan-500/30 transition-colors rounded-br-sm pointer-events-none"></div>
    </div>
  );
};