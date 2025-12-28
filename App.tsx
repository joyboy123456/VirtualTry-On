
import React, { useState, useEffect } from 'react';
import { AnalysisResult } from './components/AnalysisResult';
import { EquipmentSlot } from './components/EquipmentSlot';
import {
  analyzeModelImage,
  analyzeClothingImage,
  generateFittingPrompt,
  generateTryOnImage,
  generateEcommercePoses,
  ImageSize
} from './services/geminiService';
import { ModelAnalysis, ClothingAnalysis, ClothingItem, AppStep, AspectRatio } from './types';
import { Wand2, RefreshCw, Cpu, Layers, Shirt, User, Upload, Key, LayoutGrid, Maximize2, Crop } from 'lucide-react';

const App: React.FC = () => {
  // Key State
  const [hasApiKey, setHasApiKey] = useState(false);

  // Check for API Key on mount
  useEffect(() => {
    const checkKey = async () => {
      // @ts-ignore
      if (window.aistudio && window.aistudio.hasSelectedApiKey) {
        // @ts-ignore
        const has = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(has);
      } else {
        // Fallback or assume pre-configured in strict environments
        setHasApiKey(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    // @ts-ignore
    if (window.aistudio && window.aistudio.openSelectKey) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      // Assume success to mitigate race condition
      setHasApiKey(true);
    }
  };

  // App Logic State
  const [modelImage, setModelImage] = useState<{ file: File, base64: string } | null>(null);
  
  // Clothing Items stored by slotId
  const [clothingItems, setClothingItems] = useState<ClothingItem[]>([]);
  
  const [modelAnalysis, setModelAnalysis] = useState<ModelAnalysis | null>(null);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingPoses, setIsGeneratingPoses] = useState(false);
  
  const [prompt, setPrompt] = useState<string>("");
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [poseImages, setPoseImages] = useState<string[]>([]);
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);

  // New State for Aspect Ratio
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('Auto');

  // New State for Image Size (Resolution)
  const [imageSize, setImageSize] = useState<ImageSize>('1K');
  const [password4K, setPassword4K] = useState<string>('');
  const [show4KPasswordInput, setShow4KPasswordInput] = useState(false);

  // Helper to extract clean base64
  const getCleanBase64 = (dataUrl: string) => dataUrl.split(',')[1];

  // Helper to generate unique ID
  const generateId = () => Math.random().toString(36).substr(2, 9);

  // Add clothing item to specific slot
  const handleAddClothing = (slotId: string, file: File, base64: string) => {
    // Remove existing item in this slot if any
    const filteredItems = clothingItems.filter(i => i.slotId !== slotId);
    
    const newItem: ClothingItem = {
      id: generateId(),
      slotId,
      file,
      base64,
      analysis: null
    };
    
    setClothingItems([...filteredItems, newItem]);
    
    // Reset process if needed
    if (step === AppStep.PROMPT || step === AppStep.RESULT) {
      setStep(AppStep.UPLOAD);
      setPrompt("");
      setResultImage(null);
      setPoseImages([]);
    }
  };

  // Remove clothing item
  const handleRemoveClothing = (slotId: string) => {
    setClothingItems(prev => prev.filter(item => item.slotId !== slotId));
    if (clothingItems.length <= 1) {
      setPrompt("");
      setResultImage(null);
      setPoseImages([]);
      if (step !== AppStep.UPLOAD) setStep(AppStep.UPLOAD);
    }
  };

  // Update Item Modifier
  const handleUpdateModifier = (slotId: string, modifier: string) => {
    setClothingItems(prev => prev.map(item => {
      if (item.slotId === slotId) {
        return { ...item, customModifier: modifier };
      }
      return item;
    }));
  };

  // Analysis Action
  const handleAnalysis = async () => {
    if (!modelImage || clothingItems.length === 0) return;
    
    setStep(AppStep.ANALYSIS);
    setIsAnalyzing(true);
    
    try {
      // 1. Analyze Model (if not already done)
      let currentModelAnalysis = modelAnalysis;
      if (!currentModelAnalysis) {
        currentModelAnalysis = await analyzeModelImage(getCleanBase64(modelImage.base64), modelImage.file.type);
        setModelAnalysis(currentModelAnalysis);
      }

      // 2. Analyze Clothing Items (only those without analysis)
      const updatedClothingItems = [...clothingItems];
      const analysisPromises = updatedClothingItems.map(async (item, index) => {
        if (item.analysis) return item.analysis; // Skip if already analyzed
        
        // Pass slotId as hint
        const analysis = await analyzeClothingImage(getCleanBase64(item.base64), item.file.type, item.slotId);
        updatedClothingItems[index].analysis = analysis;
        return analysis;
      });

      await Promise.all(analysisPromises);
      setClothingItems(updatedClothingItems);
      
      // Auto-move to prompt generation
      generatePrompt(currentModelAnalysis, updatedClothingItems);

    } catch (error) {
      console.error("Analysis failed", error);
      alert("分析失败，请检查网络或更换图片。");
      setIsAnalyzing(false);
      setStep(AppStep.UPLOAD); 
    }
  };

  // Updated to accept ClothingItem[] to include customModifiers
  const generatePrompt = async (mData: ModelAnalysis, items: ClothingItem[]) => {
    setIsAnalyzing(false);
    setStep(AppStep.PROMPT);
    setIsGeneratingPrompt(true);
    
    try {
      // Now passing the full items, not just analysis, so modifiers are included
      const generatedPrompt = await generateFittingPrompt(mData, items);
      setPrompt(generatedPrompt);
    } catch (error) {
      console.error("Prompt generation failed", error);
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  // Manual Trigger to re-generate prompt (useful if user updated modifiers after initial analysis)
  const handleRegeneratePrompt = () => {
    if (modelAnalysis && clothingItems.length > 0) {
      generatePrompt(modelAnalysis, clothingItems);
    }
  };

  const handleTryOn = async () => {
    if (!modelImage || clothingItems.length === 0 || !prompt) return;
    
    setStep(AppStep.RESULT);
    setIsGeneratingImage(true);
    setPoseImages([]); // Reset previous poses
    
    try {
      // Prepare payload for clothing items
      const clothingPayload = clothingItems.map(item => ({
        base64: getCleanBase64(item.base64),
        mimeType: item.file.type,
        analysis: item.analysis || undefined,
        customModifier: item.customModifier // Pass modifier to image generation service too
      }));

      const img = await generateTryOnImage(
        getCleanBase64(modelImage.base64),
        modelImage.file.type,
        clothingPayload,
        prompt,
        aspectRatio, // Pass selected aspect ratio
        imageSize,   // Pass selected image size
        imageSize === '4K' ? password4K : undefined // Pass password only for 4K
      );
      setResultImage(img);
    } catch (error: any) {
      console.error("Generation failed", error);
      alert(error.message || "图像生成失败。");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGeneratePoses = async () => {
    if (!modelImage || clothingItems.length === 0 || !prompt) return;

    setIsGeneratingPoses(true);
    try {
      const clothingPayload = clothingItems.map(item => ({
        base64: getCleanBase64(item.base64),
        mimeType: item.file.type,
        analysis: item.analysis || undefined,
        customModifier: item.customModifier
      }));

      const poses = await generateEcommercePoses(
        getCleanBase64(modelImage.base64), 
        modelImage.file.type,
        clothingPayload,
        prompt
      );
      setPoseImages(poses);
    } catch (error) {
      console.error("Pose generation failed", error);
      alert("生成展示图失败");
    } finally {
      setIsGeneratingPoses(false);
    }
  };

  // Full Reset
  const resetAll = () => {
    setStep(AppStep.UPLOAD);
    setModelImage(null);
    setClothingItems([]);
    setModelAnalysis(null);
    setPrompt("");
    setResultImage(null);
    setPoseImages([]);
    setAspectRatio('Auto'); // Reset Aspect Ratio
    setImageSize('1K'); // Reset Image Size
    setPassword4K('');
    setShow4KPasswordInput(false);
  };

  // Keep Model, Clear All Clothing
  const resetClothingOnly = () => {
    setStep(AppStep.UPLOAD);
    setClothingItems([]);
    setPrompt("");
    setResultImage(null);
    setPoseImages([]);
  };

  const getItem = (slotId: string) => clothingItems.find(i => i.slotId === slotId);

  // --- Render Landing Screen if no API Key ---
  if (!hasApiKey) {
    return (
      <div className="min-h-screen bg-[#030712] text-gray-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-900/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-cyan-900/10 rounded-full blur-[120px]"></div>
        <div className="absolute w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5"></div>

        <div className="text-center space-y-8 max-w-lg z-10 border border-gray-800 p-8 rounded-2xl bg-black/40 backdrop-blur-xl shadow-2xl">
           <div>
             <div className="inline-block p-3 bg-cyan-900/20 rounded-xl border border-cyan-500/50 mb-4 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                <Layers className="text-cyan-400" size={32} />
             </div>
             <h1 className="text-4xl font-bold font-mono text-white neon-text mb-2">CYBER<span className="text-cyan-400">FIT</span></h1>
             <p className="text-xs text-gray-500 font-mono tracking-[0.3em] uppercase">Pro Image Generation</p>
           </div>
           
           <div className="space-y-4">
             <p className="text-gray-300 leading-relaxed">
               您正在使用 <span className="text-cyan-400 font-mono font-bold">Gemini 3 Pro</span> 图像生成模型。
               <br/>
               此模型提供 4K 级的高清细节和更精准的服装还原能力，需要使用您自己的付费 API 密钥。
             </p>
             
             <button 
               onClick={handleSelectKey}
               className="w-full py-4 bg-gradient-to-r from-cyan-700 to-blue-700 rounded-lg font-bold tracking-wider uppercase text-white hover:from-cyan-600 hover:to-blue-600 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all flex items-center justify-center gap-2 group"
             >
               <Key size={18} className="group-hover:rotate-45 transition-transform" />
               配置 API 密钥
             </button>
           </div>

           <div className="text-xs text-gray-600 pt-4 border-t border-gray-800/50">
             <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline hover:text-cyan-400 transition-colors">
               了解 Gemini API 计费说明
             </a>
           </div>
        </div>
      </div>
    );
  }

  // --- Render Main App ---
  return (
    <div className="min-h-screen bg-[#030712] text-gray-100 flex flex-col items-center py-4 px-4 sm:px-8">
      
      {/* Header */}
      <header className="w-full max-w-7xl mb-6 flex justify-between items-center border-b border-gray-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-900/20 rounded-lg border border-cyan-500/50 neon-border">
            <Layers className="text-cyan-400" size={24} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white neon-text">CYBER<span className="text-cyan-400">FIT</span></h1>
            <p className="text-[10px] sm:text-xs text-gray-500 font-mono tracking-widest uppercase">虚拟装备库 v3.0 Pro</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 text-xs font-mono text-gray-500">
           <span className="hidden sm:inline">GEMINI 3 PRO ENABLED</span>
           <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.8)]"></div>
        </div>
      </header>

      <main className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Interactive Fitting Map */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-cyan-500 font-mono font-bold">01</span>
              <h2 className="text-lg font-medium text-white">装备矩阵</h2>
            </div>
            
            <div className="flex gap-2">
              {/* Button to regenerate prompt specifically if user added modifiers after analysis */}
              {step !== AppStep.UPLOAD && (
                 <button
                  onClick={handleRegeneratePrompt}
                  disabled={isGeneratingPrompt}
                  className="px-3 py-1.5 font-mono text-xs font-bold tracking-wider uppercase rounded border border-purple-500/50 text-purple-400 hover:bg-purple-900/30 transition-all flex items-center gap-1"
                  title="根据微调内容更新提示词"
                 >
                   <RefreshCw size={12} className={isGeneratingPrompt ? "animate-spin" : ""} />
                   更新指令
                 </button>
              )}

              <button
                disabled={!modelImage || clothingItems.length === 0 || isAnalyzing || (step !== AppStep.UPLOAD && !clothingItems.some(i => !i.analysis))}
                onClick={handleAnalysis}
                className={`px-4 py-1.5 font-mono text-xs font-bold tracking-wider uppercase rounded border transition-all duration-300
                  ${(!modelImage || clothingItems.length === 0 || isAnalyzing) 
                    ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed' 
                    : 'bg-cyan-950/50 border-cyan-500 text-cyan-400 hover:bg-cyan-900 hover:neon-border hover:shadow-[0_0_10px_rgba(6,182,212,0.3)]'}
                `}
              >
                {isAnalyzing ? "扫描中..." : step === AppStep.UPLOAD ? "启动分析" : "重新扫描"}
              </button>
            </div>
          </div>

          {/* The Fitting Room Grid Map */}
          <div className="relative w-full aspect-[4/5] sm:aspect-square bg-gray-900/20 border border-dashed border-gray-800 rounded-2xl p-4">
             {/* Background decorative lines */}
             <div className="absolute inset-0 pointer-events-none opacity-20">
                <div className="absolute top-1/2 left-0 right-0 h-px bg-cyan-900"></div>
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-cyan-900"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2/3 h-2/3 border border-cyan-900 rounded-full"></div>
             </div>

             <div className="grid grid-cols-3 grid-rows-4 gap-2 sm:gap-4 h-full relative z-10">
                
                {/* Row 1: Empty, Head, Face */}
                <div className="col-start-2 row-start-1">
                  <EquipmentSlot 
                    id="head" label="头部" subLabel="Head" 
                    image={getItem('head')?.base64 || null}
                    loading={isAnalyzing && !!getItem('head')}
                    analyzed={!!getItem('head')?.analysis}
                    customModifier={getItem('head')?.customModifier}
                    onSelect={(f, b) => handleAddClothing('head', f, b)}
                    onRemove={() => handleRemoveClothing('head')}
                    onUpdateModifier={(mod) => handleUpdateModifier('head', mod)}
                    className="h-full"
                  />
                </div>
                <div className="col-start-3 row-start-1">
                  <EquipmentSlot 
                    id="face" label="面部" subLabel="Face" 
                    image={getItem('face')?.base64 || null}
                    loading={isAnalyzing && !!getItem('face')}
                    analyzed={!!getItem('face')?.analysis}
                    customModifier={getItem('face')?.customModifier}
                    onSelect={(f, b) => handleAddClothing('face', f, b)}
                    onRemove={() => handleRemoveClothing('face')}
                    onUpdateModifier={(mod) => handleUpdateModifier('face', mod)}
                    className="h-full scale-90 origin-bottom-left"
                  />
                </div>

                {/* Row 2: Inner, Model, Outer */}
                <div className="col-start-1 row-start-2">
                  <EquipmentSlot 
                    id="torso_inner" label="内搭" subLabel="Inner" 
                    image={getItem('torso_inner')?.base64 || null}
                    loading={isAnalyzing && !!getItem('torso_inner')}
                    analyzed={!!getItem('torso_inner')?.analysis}
                    customModifier={getItem('torso_inner')?.customModifier}
                    onSelect={(f, b) => handleAddClothing('torso_inner', f, b)}
                    onRemove={() => handleRemoveClothing('torso_inner')}
                    onUpdateModifier={(mod) => handleUpdateModifier('torso_inner', mod)}
                    className="h-full"
                  />
                </div>
                
                {/* CENTER MODEL - Spans Row 2 and 3 */}
                <div className="col-start-2 row-start-2 row-span-2 relative group">
                   <div 
                    className={`
                      w-full h-full border-2 rounded-xl overflow-hidden transition-all duration-300 relative bg-gray-900
                      ${modelImage ? 'border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.2)]' : 'border-dashed border-gray-700 hover:border-cyan-500/50'}
                    `}
                    onClick={() => !modelImage && document.getElementById('model-upload')?.click()}
                   >
                      <input 
                        id="model-upload" 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            const f = e.target.files[0];
                            const r = new FileReader();
                            r.onload = () => {
                              setModelImage({ file: f, base64: r.result as string });
                              setModelAnalysis(null);
                              setStep(AppStep.UPLOAD);
                            };
                            r.readAsDataURL(f);
                          }
                        }} 
                      />
                      {modelImage ? (
                        <>
                          <img src={modelImage.base64} alt="Model" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                             <button onClick={() => { setModelImage(null); setModelAnalysis(null); }} className="px-3 py-1 bg-red-500/80 rounded text-xs text-white">移除</button>
                             <button onClick={() => document.getElementById('model-upload')?.click()} className="px-3 py-1 bg-cyan-600/80 rounded text-xs text-white">更换</button>
                          </div>
                        </>
                      ) : (
                         <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                            <User size={48} className="mb-2 opacity-50" />
                            <span className="text-sm font-mono font-bold">导入模特</span>
                            <span className="text-[10px] mt-1">点击上传</span>
                         </div>
                      )}
                   </div>
                   {/* Model Analysis Overlay */}
                   {modelAnalysis && (
                     <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/70 border border-pink-500/50 rounded text-[10px] text-pink-400 font-mono backdrop-blur-md">
                       已分析
                     </div>
                   )}
                </div>

                <div className="col-start-3 row-start-2">
                  <EquipmentSlot 
                    id="torso_outer" label="外套" subLabel="Outer" 
                    image={getItem('torso_outer')?.base64 || null}
                    loading={isAnalyzing && !!getItem('torso_outer')}
                    analyzed={!!getItem('torso_outer')?.analysis}
                    customModifier={getItem('torso_outer')?.customModifier}
                    onSelect={(f, b) => handleAddClothing('torso_outer', f, b)}
                    onRemove={() => handleRemoveClothing('torso_outer')}
                    onUpdateModifier={(mod) => handleUpdateModifier('torso_outer', mod)}
                    className="h-full"
                  />
                </div>

                {/* Row 3: Waist, Model(span), Hands */}
                <div className="col-start-1 row-start-3">
                  <EquipmentSlot 
                    id="waist" label="腰部" subLabel="Waist" 
                    image={getItem('waist')?.base64 || null}
                    loading={isAnalyzing && !!getItem('waist')}
                    analyzed={!!getItem('waist')?.analysis}
                    customModifier={getItem('waist')?.customModifier}
                    onSelect={(f, b) => handleAddClothing('waist', f, b)}
                    onRemove={() => handleRemoveClothing('waist')}
                    onUpdateModifier={(mod) => handleUpdateModifier('waist', mod)}
                    className="h-full"
                  />
                </div>
                <div className="col-start-3 row-start-3">
                  <EquipmentSlot 
                    id="hands" label="手部" subLabel="Hands" 
                    image={getItem('hands')?.base64 || null}
                    loading={isAnalyzing && !!getItem('hands')}
                    analyzed={!!getItem('hands')?.analysis}
                    customModifier={getItem('hands')?.customModifier}
                    onSelect={(f, b) => handleAddClothing('hands', f, b)}
                    onRemove={() => handleRemoveClothing('hands')}
                    onUpdateModifier={(mod) => handleUpdateModifier('hands', mod)}
                    className="h-full"
                  />
                </div>

                {/* Row 4: Accessory, Feet, Legs */}
                <div className="col-start-1 row-start-4">
                  <EquipmentSlot 
                    id="accessory" label="配饰" subLabel="Acc" 
                    image={getItem('accessory')?.base64 || null}
                    loading={isAnalyzing && !!getItem('accessory')}
                    analyzed={!!getItem('accessory')?.analysis}
                    customModifier={getItem('accessory')?.customModifier}
                    onSelect={(f, b) => handleAddClothing('accessory', f, b)}
                    onRemove={() => handleRemoveClothing('accessory')}
                    onUpdateModifier={(mod) => handleUpdateModifier('accessory', mod)}
                    className="h-full"
                  />
                </div>
                <div className="col-start-2 row-start-4">
                   <EquipmentSlot 
                    id="feet" label="鞋子" subLabel="Feet" 
                    image={getItem('feet')?.base64 || null}
                    loading={isAnalyzing && !!getItem('feet')}
                    analyzed={!!getItem('feet')?.analysis}
                    customModifier={getItem('feet')?.customModifier}
                    onSelect={(f, b) => handleAddClothing('feet', f, b)}
                    onRemove={() => handleRemoveClothing('feet')}
                    onUpdateModifier={(mod) => handleUpdateModifier('feet', mod)}
                    className="h-full"
                  />
                </div>
                <div className="col-start-3 row-start-4">
                   <EquipmentSlot 
                    id="legs" label="下装" subLabel="Legs" 
                    image={getItem('legs')?.base64 || null}
                    loading={isAnalyzing && !!getItem('legs')}
                    analyzed={!!getItem('legs')?.analysis}
                    customModifier={getItem('legs')?.customModifier}
                    onSelect={(f, b) => handleAddClothing('legs', f, b)}
                    onRemove={() => handleRemoveClothing('legs')}
                    onUpdateModifier={(mod) => handleUpdateModifier('legs', mod)}
                    className="h-full"
                  />
                </div>

             </div>
          </div>
          
          {/* Analysis View (Collapsible or below) */}
          {(step !== AppStep.UPLOAD) && (
             <div className="animate-fade-in-up mt-4 max-h-[300px] overflow-y-auto custom-scrollbar border border-gray-800 rounded-lg p-2 bg-black/20">
               <AnalysisResult 
                 modelData={modelAnalysis} 
                 clothingData={clothingItems.map(i => i.analysis!).filter(Boolean)} 
                 loading={isAnalyzing} 
               />
             </div>
          )}
        </div>

        {/* Right Column: Prompt & Result */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          
          {/* Prompt Editor */}
          <div className={`transition-all duration-500 ${step === AppStep.UPLOAD || step === AppStep.ANALYSIS ? 'opacity-50 pointer-events-none blur-sm' : 'opacity-100'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-yellow-500 font-mono font-bold">02</span>
                <h2 className="text-lg font-medium text-white">生成指令</h2>
              </div>
              {isGeneratingPrompt && <span className="text-xs font-mono text-yellow-500 animate-pulse">生成中...</span>}
            </div>

            <div className="bg-gray-900/80 border border-gray-700 rounded-lg p-1 shadow-inner relative">
               <textarea 
                 value={prompt}
                 onChange={(e) => setPrompt(e.target.value)}
                 disabled={isGeneratingPrompt}
                 className="w-full h-28 bg-transparent text-gray-300 font-mono text-xs sm:text-sm p-4 focus:outline-none resize-none"
                 placeholder="等待分析结果..."
               />
               {/* Aspect Ratio Selector Overlay or Bottom Bar */}
            </div>

            {/* Controls Bar: Ratio + Resolution + Button */}
            <div className="mt-4 flex flex-col gap-4">

              <div className="flex flex-col sm:flex-row gap-4">
                {/* Aspect Ratio Selector */}
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-[10px] uppercase text-gray-500 font-mono tracking-wider flex items-center gap-1">
                    <Crop size={10} /> 画幅比例 (Aspect Ratio)
                  </label>
                  <div className="flex bg-gray-900 rounded-md border border-gray-700 p-1 gap-1 overflow-x-auto max-w-full custom-scrollbar">
                    {(['Auto', '9:16', '3:4', '1:1', '4:3', '16:9', '2:3', '3:2'] as AspectRatio[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => setAspectRatio(r)}
                        className={`
                          px-2 py-1 text-[10px] font-mono rounded whitespace-nowrap transition-all
                          ${aspectRatio === r
                            ? 'bg-cyan-900 text-cyan-400 border border-cyan-500/50 shadow-sm'
                            : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}
                        `}
                      >
                        {r === 'Auto' ? '自动' : r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Image Size (Resolution) Selector */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase text-gray-500 font-mono tracking-wider flex items-center gap-1">
                    <Maximize2 size={10} /> 画质 (Resolution)
                  </label>
                  <div className="flex bg-gray-900 rounded-md border border-gray-700 p-1 gap-1">
                    {(['1K', '2K', '4K'] as ImageSize[]).map((size) => (
                      <button
                        key={size}
                        onClick={() => {
                          setImageSize(size);
                          if (size === '4K') {
                            setShow4KPasswordInput(true);
                          } else {
                            setShow4KPasswordInput(false);
                            setPassword4K('');
                          }
                        }}
                        className={`
                          px-3 py-1 text-[10px] font-mono rounded whitespace-nowrap transition-all
                          ${imageSize === size
                            ? size === '4K'
                              ? 'bg-yellow-900 text-yellow-400 border border-yellow-500/50 shadow-sm'
                              : 'bg-cyan-900 text-cyan-400 border border-cyan-500/50 shadow-sm'
                            : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}
                        `}
                      >
                        {size}
                        {size === '4K' && <Key size={8} className="inline ml-1" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 4K Password Input */}
              {show4KPasswordInput && imageSize === '4K' && (
                <div className="flex items-center gap-2 bg-yellow-900/20 border border-yellow-700/50 rounded-md p-2">
                  <Key size={14} className="text-yellow-500" />
                  <input
                    type="password"
                    placeholder="输入4K密码..."
                    value={password4K}
                    onChange={(e) => setPassword4K(e.target.value)}
                    className="flex-1 bg-transparent border-none outline-none text-yellow-400 font-mono text-sm placeholder-yellow-700"
                  />
                  <span className="text-[10px] text-yellow-600 font-mono">4K需要密码</span>
                </div>
              )}

              <button
                disabled={!prompt || isGeneratingImage || (imageSize === '4K' && !password4K)}
                onClick={handleTryOn}
                className={`w-full sm:w-auto px-8 py-3 rounded bg-gradient-to-r from-pink-600 to-purple-600 text-white font-mono font-bold tracking-wider uppercase transition-all
                  hover:shadow-[0_0_20px_rgba(219,39,119,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2
                `}
              >
                {isGeneratingImage ? <RefreshCw className="animate-spin" /> : <Wand2 size={18} />}
                {isGeneratingImage ? "处理中" : `生成${imageSize}高清图像`}
              </button>
            </div>
          </div>

          {/* Result Area */}
          <div className="flex-1 space-y-4">
             {/* Main Result */}
             <div className="bg-gray-950/50 border border-gray-800 rounded-xl relative overflow-hidden min-h-[400px] flex items-center justify-center group">
                
                {!resultImage && !isGeneratingImage && (
                  <div className="text-center space-y-4 opacity-30">
                    <Cpu size={64} className="mx-auto" />
                    <p className="font-mono text-lg">READY FOR SYNTHESIS</p>
                  </div>
                )}

                {isGeneratingImage && (
                  <div className="absolute inset-0 z-10 bg-black/80 flex flex-col items-center justify-center space-y-4 backdrop-blur-sm">
                    <div className="relative w-24 h-24">
                      <div className="absolute inset-0 border-4 border-t-cyan-500 border-r-transparent border-b-purple-500 border-l-transparent rounded-full animate-spin"></div>
                      <div className="absolute inset-2 border-4 border-t-transparent border-r-pink-500 border-b-transparent border-l-yellow-500 rounded-full animate-spin-reverse"></div>
                    </div>
                    <p className="text-cyan-400 font-mono animate-pulse tracking-widest">RENDERING 4K...</p>
                  </div>
                )}

                {resultImage && (
                  <div className="relative w-full h-full flex items-center justify-center p-4 animate-fade-in">
                    <img src={resultImage} alt="Result" className="max-w-full max-h-[600px] object-contain rounded-lg shadow-2xl shadow-cyan-900/20" />
                    
                    <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a 
                        href={resultImage} 
                        download="cyberfit-result.png"
                        className="bg-gray-900/80 hover:bg-cyan-600 text-white p-2 rounded-full backdrop-blur-md transition-colors border border-gray-700"
                        title="下载"
                      >
                        <Upload size={18} className="rotate-180" />
                      </a>
                      
                      <button 
                        onClick={resetClothingOnly}
                        className="bg-gray-900/80 hover:bg-yellow-600 text-white p-2 rounded-full backdrop-blur-md transition-colors border border-gray-700 flex items-center gap-1 px-3"
                        title="保留模特，清空服装"
                      >
                        <Shirt size={16} />
                        <span className="text-xs font-mono hidden sm:inline">新搭配</span>
                      </button>

                      <button 
                        onClick={resetAll}
                        className="bg-gray-900/80 hover:bg-red-600 text-white p-2 rounded-full backdrop-blur-md transition-colors border border-gray-700"
                        title="重置"
                      >
                        <RefreshCw size={18} />
                      </button>
                    </div>
                  </div>
                )}
             </div>

             {/* E-commerce Poses Section */}
             {resultImage && (
               <div className="animate-fade-in-up">
                 <div className="flex items-center justify-between mb-2">
                   <h3 className="text-sm font-mono text-gray-400 flex items-center gap-2">
                     <LayoutGrid size={14} /> 电商展示组图 (Taobao Style)
                   </h3>
                   <button
                     disabled={isGeneratingPoses}
                     onClick={handleGeneratePoses}
                     className="px-3 py-1 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white text-xs font-bold uppercase rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 shadow-lg"
                   >
                     {isGeneratingPoses ? <RefreshCw className="animate-spin" size={12} /> : <Wand2 size={12} />}
                     {isGeneratingPoses ? "生成中..." : "生成 4 张展示图"}
                   </button>
                 </div>

                 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {/* Placeholders or Results */}
                    {isGeneratingPoses && poseImages.length === 0 ? (
                      Array(4).fill(0).map((_, i) => (
                        <div key={i} className="aspect-[3/4] bg-gray-900/50 rounded-lg border border-gray-800 flex items-center justify-center animate-pulse">
                          <Shirt className="text-gray-700" />
                        </div>
                      ))
                    ) : poseImages.length > 0 ? (
                      poseImages.map((img, idx) => (
                        <div key={idx} className="group relative aspect-[3/4] bg-gray-900 rounded-lg overflow-hidden border border-gray-800 hover:border-orange-500 transition-colors cursor-pointer" onClick={() => setResultImage(img)}>
                           <img src={img} alt={`Pose ${idx}`} className="w-full h-full object-cover" />
                           <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Maximize2 className="text-white" size={20} />
                           </div>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-4 p-4 text-center border border-dashed border-gray-800 rounded-lg text-gray-600 text-xs font-mono">
                         点击按钮生成不同姿势的电商商品图
                      </div>
                    )}
                 </div>
               </div>
             )}
          </div>
        </div>
      </main>
      
      {/* Decorative background elements */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-900/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-cyan-900/10 rounded-full blur-[120px]"></div>
        <div className="absolute w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5"></div>
      </div>
    </div>
  );
};

export default App;
