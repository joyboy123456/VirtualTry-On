
import { GoogleGenAI, Type } from "@google/genai";
import { ModelAnalysis, ClothingAnalysis, ClothingItem, AspectRatio } from "../types";

// API Key 轮询机制
const getApiKeys = (): string[] => {
  const keys = process.env.API_KEYS?.split(',').map(k => k.trim()).filter(k => k && !k.includes('你的')) || [];
  if (keys.length === 0 && process.env.API_KEY) {
    keys.push(process.env.API_KEY);
  }
  return keys;
};

let currentKeyIndex = 0;
const getNextApiKey = (): string => {
  const keys = getApiKeys();
  if (keys.length === 0) throw new Error("No API keys configured");
  const key = keys[currentKeyIndex % keys.length];
  currentKeyIndex++;
  return key;
};

// 创建 AI 实例（每次调用使用下一个 Key）
const createAI = () => new GoogleGenAI({ apiKey: getNextApiKey() });

// Helpers
const fileToGenerativePart = (base64Data: string, mimeType: string) => {
  return {
    inlineData: {
      data: base64Data,
      mimeType,
    },
  };
};

const getImageDimensions = (base64: string): Promise<{width: number, height: number}> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`; // Robust check
  });
};

const getSupportedAspectRatio = (ratio: AspectRatio, width: number, height: number): string => {
  const supported = [
      { str: "1:1", val: 1 },
      { str: "3:4", val: 3/4 },
      { str: "4:3", val: 4/3 },
      { str: "9:16", val: 9/16 },
      { str: "16:9", val: 16/9 }
  ];

  let targetRatioValue = 1;

  if (ratio === 'Auto') {
      targetRatioValue = width / height;
  } else if (ratio === '2:3') {
      targetRatioValue = 2/3;
  } else if (ratio === '3:2') {
      targetRatioValue = 3/2;
  } else {
      // If it is already a supported string, return it directly
      return ratio;
  }

  // Find closest supported
  return supported.reduce((prev, curr) => {
      return (Math.abs(curr.val - targetRatioValue) < Math.abs(prev.val - targetRatioValue) ? curr : prev);
  }).str;
};

// 1. Model Analysis
export const analyzeModelImage = async (base64Image: string, mimeType: string): Promise<ModelAnalysis> => {
  const ai = createAI();
  const model = "gemini-3-flash-preview"; 
  
  const prompt = `
  你是一个专业的虚拟试衣助手。请分析上传的模特照片，并以 JSON 格式提取以下详细信息。
  请使用中文返回所有描述性字段。
  
  仅返回 JSON 对象。
  `;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        fileToGenerativePart(base64Image, mimeType),
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          bodyType: { type: Type.STRING, description: "体型描述，如：偏瘦、适中、健壮、大码" },
          skinTone: { type: Type.STRING, description: "肤色描述" },
          hairStyle: { type: Type.STRING, description: "发型描述" },
          hairColor: { type: Type.STRING, description: "发色描述" },
          pose: { type: Type.STRING, description: "姿势描述" },
          currentClothing: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                bodyPartId: { type: Type.STRING, description: "部位ID: head, face, torso_inner, torso_outer, hands, waist, legs, feet, accessory" },
                description: { type: Type.STRING, description: "服装描述" },
                isPresent: { type: Type.BOOLEAN }
              }
            }
          },
          distinctiveFeatures: { type: Type.ARRAY, items: { type: Type.STRING } },
          background: { type: Type.STRING, description: "背景描述" }
        }
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

// 2. Clothing Analysis
export const analyzeClothingImage = async (base64Image: string, mimeType: string, suggestedBodyPart?: string): Promise<ClothingAnalysis> => {
  const ai = createAI();
  const model = "gemini-3-flash-preview";

  const prompt = `
  你是一位专业的时尚分析师。请分析上传的服装照片，并以 JSON 格式提取以下详细信息。
  请使用中文返回所有描述性字段。
  
  用户将此物品放置在 "${suggestedBodyPart || '未知'}" 区域。请优先参考此信息来确定 bodyPartId，但如果明显不符（例如把鞋子放在头部区域），请以图片实际内容为准。

  特别注意准确识别服装对应的身体部位(bodyPartId)，规则如下：
  - head: 头部（帽子、发饰）
  - face: 面部（眼镜、口罩）
  - torso_inner: 上身内层（T恤、衬衫、连衣裙）
  - torso_outer: 上身外层（外套、夹克、大衣）
  - hands: 手部（手套、手表）
  - waist: 腰部（腰带、腰包）
  - legs: 腿部（裤子、半身裙）
  - feet: 脚部（鞋子、袜子）
  - accessory: 其他配饰（包、首饰）
  
  仅返回 JSON 对象。
  `;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        fileToGenerativePart(base64Image, mimeType),
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, description: "服装类型" },
          category: { type: Type.STRING, description: "分类" },
          bodyPartId: { 
            type: Type.STRING, 
            description: "身体部位ID，必须是以下之一: head, face, torso_inner, torso_outer, hands, waist, legs, feet, accessory" 
          },
          color: { type: Type.STRING, description: "颜色" },
          material: { type: Type.STRING, description: "材质" },
          pattern: { type: Type.STRING, description: "图案" },
          style: { type: Type.STRING, description: "风格" },
          fit: { type: Type.STRING, description: "版型" },
          details: { type: Type.ARRAY, items: { type: Type.STRING }, description: "细节特征" }
        }
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

// 3. Generate Editing Prompt (Supports Multiple Items AND Custom Modifiers)
export const generateFittingPrompt = async (
  modelAnalysis: ModelAnalysis, 
  clothingItems: ClothingItem[]
): Promise<string> => {
  const ai = createAI();
  const model = "gemini-3-flash-preview";

  // Prepare simple structure for the LLM to understand both analysis AND user modifiers
  const clothingDataForPrompt = clothingItems.map(item => ({
    bodyPartId: item.analysis?.bodyPartId || item.slotId,
    analysis: item.analysis,
    userCustomModifier: item.customModifier // The crucial new field
  }));

  const systemInstruction = `
  You are a professional virtual fitting assistant. Your task is to generate a high-quality image generation prompt based on the analysis of a model and MULTIPLE pieces of clothing.
  
  IMPORTANT: The input analysis JSON data provided by the user is in CHINESE. You MUST translate the relevant attributes into ENGLISH for the final prompt output. The final prompt must be strictly in English.
  
  Follow this strict structure for the prompt:
  1. Subject Description: professional fashion photography, [gender/age description based on analysis]
  2. Retention Instructions: keep face, body shape, skin tone, hair, pose, background.
  3. Clothing Change Instructions: 
     - Iterate through ALL provided clothing items.
     - For EACH item, identify its 'bodyPartId'.
     - Generate an instruction: "replace the [current clothing on bodyPartId] with [new clothing details]".
     - CRITICAL: If the item has a 'userCustomModifier' (e.g. "baggy", "floor length", "open jacket"), you MUST incorporate this modifier into the description of the new clothing. Prioritize the user's modifier over the AI analysis if they conflict.
        Example: If analysis says "jeans" but modifier says "floor length", the prompt should say "floor length jeans dragging on the ground".
     - Combine these instructions smoothly.
     - IMPORTANT: If bodyPartId is 'torso_inner' and 'torso_outer', describe the layering clearly (e.g., "wearing [inner] under [outer]").
  4. Style Modifiers: studio lighting, clean background, high-end fashion catalog, 8k uhd, sharp focus.
  
  Output ONLY the final prompt string in English. Do not include markdown code blocks.
  `;

  const userContent = `
  Model Analysis (Chinese): ${JSON.stringify(modelAnalysis)}
  Clothing Items List (Chinese + User Modifiers): ${JSON.stringify(clothingDataForPrompt)}
  
  Generate the English prompt now, incorporating ALL clothing items and paying special attention to 'userCustomModifier' fields.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: userContent,
    config: {
      systemInstruction,
    }
  });

  return response.text || "";
};

// 4. Generate/Edit Image (Supports Multiple Reference Images)
export const generateTryOnImage = async (
  modelImageBase64: string, 
  modelMimeType: string, 
  clothingItems: { base64: string, mimeType: string, analysis?: ClothingAnalysis, customModifier?: string }[],
  prompt: string,
  targetRatio: AspectRatio = 'Auto'
): Promise<string> => {
  const ai = createAI();
  // Updated model to Gemini 3 Pro Image Preview
  const model = "gemini-3-pro-image-preview";

  // Calculate correct aspect ratio
  // We need dimensions of the model image to handle 'Auto' and 'Match Input' logic best
  // NOTE: getCleanBase64 usually strips the prefix, so we might need to be careful if passing to new Image()
  // But caller passes clean base64. new Image src needs prefix.
  const fullDataUrl = `data:${modelMimeType};base64,${modelImageBase64}`;
  const dimensions = await getImageDimensions(fullDataUrl);
  const aspectRatio = getSupportedAspectRatio(targetRatio, dimensions.width, dimensions.height);

  console.log(`Generating with Aspect Ratio: ${aspectRatio} (Requested: ${targetRatio})`);

  // Build the textual description of references - 使用图一图二的清晰描述
  let referenceDescription = "【图片说明】\n图一：模特原图（必须严格保持此图中的姿势、表情、角度）\n";
  clothingItems.forEach((item, index) => {
    const part = item.analysis?.bodyPartId || "指定部位";
    referenceDescription += `图${index + 2}：服装素材 - 用于[${part}]`;
    if (item.customModifier) {
      referenceDescription += `（备注：${item.customModifier}）`;
    }
    referenceDescription += "\n";
  });

  const multimodalPrompt = `
  ${referenceDescription}

  【核心任务】
  让图一的模特穿上图二${clothingItems.length > 1 ? '、图三等' : ''}的服装，生成一张高质量换装图。

  【最高优先级 - 姿势保持】
  ⚠️ 必须100%复制图一模特的：
  - 完全相同的站姿/坐姿/动作
  - 完全相同的手臂位置和手势
  - 完全相同的腿部姿态和重心
  - 完全相同的头部角度和面部朝向
  - 完全相同的身体倾斜角度
  
  【服装要求】
  - 精确复制每件服装的颜色、材质、纹理、图案
  - 服装细节说明：${prompt}
  - 正确处理服装层次（内搭在外套里面）

  【身份保持】
  - 保持模特的面部特征、肤色、发型发色完全不变
  - 保持原图的背景环境
  
  【输出质量】
  专业时尚摄影，8K超高清，锐利对焦
  `;

  // Construct parts: Model Image + All Clothing Images + Prompt Text
  const parts = [
    fileToGenerativePart(modelImageBase64, modelMimeType),
    ...clothingItems.map(item => fileToGenerativePart(item.base64, item.mimeType)),
    { text: multimodalPrompt }
  ];

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio,
        imageSize: "1K" // Defaulting to 1K for speed/cost, could expose this too if needed
      }
    }
  });

  // Extract image from response
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData && part.inlineData.data) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new Error("No image generated.");
};

// 5. Generate 4 E-commerce Poses
export const generateEcommercePoses = async (
  modelImageBase64: string, 
  modelMimeType: string, 
  clothingItems: { base64: string, mimeType: string, analysis?: ClothingAnalysis, customModifier?: string }[],
  basePrompt: string
): Promise<string[]> => {
  const ai = createAI();
  const model = "gemini-3-pro-image-preview";

  // For poses, we usually want a vertical aspect ratio for fashion (3:4 or 9:16)
  // But let's stick to 3:4 as a safe default for e-commerce, or we could pass the user selection too.
  // The user prompt didn't explicitly ask to change the pose generation ratio, but "generate images" implies general control.
  // Let's force 3:4 for poses as they are "poses" typically vertical.
  const aspectRatio = "3:4"; 

  // Define 4 distinct e-commerce poses
  const poses = [
    "Dynamic Walking: Full body shot, model walking towards camera, natural movement, fabric motion, high-end e-commerce style, studio white background.",
    "Side Profile: Standing side profile, highlighting the silhouette of the outfit, hand elegantly placed, fashion catalog style, soft lighting.",
    "Casual Standing: Relaxed standing pose, weight on one leg, hands in pockets or natural gesture, engaging eye contact, clean commercial look.",
    "Detail/Sitting: Model sitting on a minimal stool or posing to show lower body details/shoes, artistic fashion composition, sharp focus."
  ];

  // Helper function for single generation
  const generateSinglePose = async (poseDescription: string) => {
    // Build the textual description of references
    let referenceDescription = "Reference Images:\n1. The first image is the MODEL.\n";
    clothingItems.forEach((item, index) => {
      const part = item.analysis?.bodyPartId || "specified part";
      referenceDescription += `${index + 2}. The image #${index + 2} is a CLOTHING item for the [${part}].`;
      if (item.customModifier) {
        referenceDescription += ` Note for this item: ${item.customModifier}`;
      }
      referenceDescription += "\n";
    });

    // Modified Prompt for specific pose + Taobao/Ecommerce style
    const posePrompt = `
    ${referenceDescription}

    Task:
    Generate a professional E-COMMERCE / FASHION CATALOG image of the person from the MODEL image wearing the clothing items.
    
    Style: High-end Taobao/Tmall fashion photography, Commercial studio lighting, 8k resolution, ultra-realistic texture.
    
    Specific Pose Instruction: ${poseDescription}

    Clothing Requirements:
    - Copy visual details (color, pattern) from references exactly.
    - Base clothing combination: ${basePrompt}
    - Keep Model's Identity (face/hair) consistent with image #1.
    `;

    const parts = [
      fileToGenerativePart(modelImageBase64, modelMimeType),
      ...clothingItems.map(item => fileToGenerativePart(item.base64, item.mimeType)),
      { text: posePrompt }
    ];

    try {
      const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio, // Using fixed 3:4 for poses
            imageSize: "1K"
          }
        }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData && part.inlineData.data) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
      return null;
    } catch (e) {
      console.error("Failed to generate pose:", e);
      return null;
    }
  };

  // Run in parallel
  const results = await Promise.all(poses.map(pose => generateSinglePose(pose)));
  
  return results.filter((res): res is string => res !== null);
};
