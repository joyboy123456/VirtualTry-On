import React from 'react';
import { ModelAnalysis, ClothingAnalysis } from '../types';
import { Activity, Shirt, User, Zap, ScanLine, Layers } from 'lucide-react';

interface AnalysisResultProps {
  modelData?: ModelAnalysis | null;
  clothingData?: ClothingAnalysis[] | null; // Changed to array
  loading: boolean;
}

export const AnalysisResult: React.FC<AnalysisResultProps> = ({ modelData, clothingData, loading }) => {
  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center space-y-4 p-8 border border-cyan-900/30 rounded-lg bg-black/20 animate-pulse">
        <Activity className="text-cyan-500 animate-spin" size={32} />
        <p className="text-cyan-400 font-mono text-sm">正在进行神经元数据分析...</p>
      </div>
    );
  }

  if (!modelData && (!clothingData || clothingData.length === 0)) return null;

  return (
    <div className="space-y-6">
      {modelData && (
        <div className="bg-gray-900/50 border border-cyan-900/50 rounded-lg p-4 backdrop-blur-sm">
          <div className="flex items-center space-x-2 mb-4 border-b border-gray-800 pb-2">
            <User size={18} className="text-pink-500" />
            <h3 className="text-pink-400 font-mono text-sm uppercase">模特分析</h3>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm font-mono text-gray-300">
            <div className="text-gray-500">体型</div>
            <div className="text-right text-white">{modelData.bodyType || '-'}</div>
            
            <div className="text-gray-500">肤色</div>
            <div className="text-right text-white">{modelData.skinTone || '-'}</div>
            
            <div className="text-gray-500">发型/发色</div>
            <div className="text-right text-white truncate">
              {modelData.hairColor} {modelData.hairStyle}
            </div>
            
            <div className="col-span-2 mt-2 pt-2 border-t border-gray-800">
              <div className="text-gray-500 mb-1">当前穿着</div>
              <div className="flex flex-wrap gap-2">
                {modelData.currentClothing?.length > 0 ? (
                  modelData.currentClothing.map((c, i) => (
                    <span key={i} className="px-2 py-0.5 bg-gray-800 text-xs rounded text-gray-300 border border-gray-700">
                      {c.description}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-600 italic text-xs">无识别数据</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {clothingData && clothingData.length > 0 && (
        <div className="bg-gray-900/50 border border-cyan-900/50 rounded-lg p-4 backdrop-blur-sm">
           <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-2">
            <div className="flex items-center space-x-2">
              <Layers size={18} className="text-yellow-500" />
              <h3 className="text-yellow-400 font-mono text-sm uppercase">服装组合 ({clothingData.length})</h3>
            </div>
          </div>
          
          <div className="space-y-6">
            {clothingData.map((item, index) => (
              <div key={index} className="relative">
                {index > 0 && <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-[1px] bg-gray-700"></div>}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm font-mono text-gray-300">
                  <div className="col-span-2 flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-500 uppercase">Item {index + 1}</span>
                    <span className="text-xs text-cyan-400 px-2 py-0.5 bg-cyan-900/20 rounded border border-cyan-900/50">{item.bodyPartId || '未知部位'}</span>
                  </div>

                  <div className="text-gray-500">类型</div>
                  <div className="text-right text-white">{item.type || '-'}</div>
                  
                  <div className="text-gray-500">材质/风格</div>
                  <div className="text-right text-white truncate">{item.material} / {item.style}</div>
                  
                  <div className="col-span-2 mt-1">
                    <div className="flex flex-wrap gap-1 justify-end">
                      {item.details?.length > 0 ? (
                        item.details.slice(0, 3).map((d, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-gray-800 text-[10px] rounded text-gray-400 border border-gray-700">
                            {d}
                          </span>
                        ))
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};