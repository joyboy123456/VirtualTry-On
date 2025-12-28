import { ModelAnalysis, ClothingAnalysis, ClothingItem, AspectRatio } from "../types";

// 获取图片尺寸（用于计算宽高比）
const getImageDimensions = (base64: string): Promise<{width: number, height: number}> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
  });
};

// 1. 分析模特图片
export const analyzeModelImage = async (base64Image: string, mimeType: string): Promise<ModelAnalysis> => {
  const response = await fetch('/api/analyze-model', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Image, mimeType })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '分析失败');
  }

  return response.json();
};

// 2. 分析服装图片
export const analyzeClothingImage = async (base64Image: string, mimeType: string, suggestedBodyPart?: string): Promise<ClothingAnalysis> => {
  const response = await fetch('/api/analyze-clothing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Image, mimeType, suggestedBodyPart })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '分析失败');
  }

  return response.json();
};

// 3. 生成试穿提示词
export const generateFittingPrompt = async (
  modelAnalysis: ModelAnalysis,
  clothingItems: ClothingItem[]
): Promise<string> => {
  const response = await fetch('/api/generate-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelAnalysis, clothingItems })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '生成提示词失败');
  }

  const data = await response.json();
  return data.prompt;
};

// 图片分辨率类型
export type ImageSize = '1K' | '2K' | '4K';

// 4. 生成试穿图片
export const generateTryOnImage = async (
  modelImageBase64: string,
  modelMimeType: string,
  clothingItems: { base64: string, mimeType: string, analysis?: ClothingAnalysis, customModifier?: string }[],
  prompt: string,
  targetRatio: AspectRatio = 'Auto',
  imageSize: ImageSize = '1K',
  password?: string
): Promise<string> => {
  // 获取图片尺寸用于宽高比计算
  const fullDataUrl = `data:${modelMimeType};base64,${modelImageBase64}`;
  const dimensions = await getImageDimensions(fullDataUrl);

  const response = await fetch('/api/generate-tryon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelImageBase64,
      modelMimeType,
      clothingItems,
      prompt,
      targetRatio,
      imageWidth: dimensions.width,
      imageHeight: dimensions.height,
      imageSize,
      password
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '生成图片失败');
  }

  const data = await response.json();
  return data.image;
};

// 5. 生成电商姿势图片
export const generateEcommercePoses = async (
  modelImageBase64: string,
  modelMimeType: string,
  clothingItems: { base64: string, mimeType: string, analysis?: ClothingAnalysis, customModifier?: string }[],
  basePrompt: string
): Promise<string[]> => {
  const response = await fetch('/api/generate-poses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelImageBase64,
      modelMimeType,
      clothingItems,
      basePrompt
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '生成姿势图片失败');
  }

  const data = await response.json();
  return data.images;
};
