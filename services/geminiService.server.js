const { GoogleGenAI } = require("@google/genai");

// API Key 轮询机制
const getApiKeys = () => {
  const keys = (process.env.API_KEYS || '').split(',').map(k => k.trim()).filter(k => k && !k.includes('你的'));
  if (keys.length === 0 && process.env.API_KEY) {
    keys.push(process.env.API_KEY);
  }
  return keys;
};

let currentKeyIndex = 0;
const getNextApiKey = () => {
  const keys = getApiKeys();
  if (keys.length === 0) throw new Error("No API keys configured");
  const key = keys[currentKeyIndex % keys.length];
  currentKeyIndex++;
  console.log(`Using API Key index: ${currentKeyIndex - 1}, total keys: ${keys.length}`);
  return key;
};

// 创建 AI 实例（每次调用使用下一个 Key）
const createAI = () => new GoogleGenAI({ apiKey: getNextApiKey() });

// Helpers
// 清理 base64 数据，去掉 data:image/xxx;base64, 前缀
const cleanBase64 = (base64Data) => {
  if (base64Data.includes(',')) {
    return base64Data.split(',')[1];
  }
  return base64Data;
};

const fileToGenerativePart = (base64Data, mimeType) => {
  return {
    inlineData: {
      data: cleanBase64(base64Data),
      mimeType,
    },
  };
};

const getSupportedAspectRatio = (ratio, width, height) => {
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
    return ratio;
  }

  return supported.reduce((prev, curr) => {
    return (Math.abs(curr.val - targetRatioValue) < Math.abs(prev.val - targetRatioValue) ? curr : prev);
  }).str;
};

// 1. Model Analysis
const analyzeModelImage = async (base64Image, mimeType) => {
  const ai = createAI();
  const model = "gemini-2.0-flash";

  const prompt = `
  你是一个专业的虚拟试衣助手。请分析上传的模特照片，并以 JSON 格式提取以下详细信息。
  请使用中文返回所有描述性字段。

  返回格式：
  {
    "bodyType": "体型描述",
    "skinTone": "肤色描述",
    "hairStyle": "发型描述",
    "hairColor": "发色描述",
    "pose": "姿势描述",
    "currentClothing": [{"bodyPartId": "部位ID", "description": "服装描述", "isPresent": true}],
    "distinctiveFeatures": ["特征1", "特征2"],
    "background": "背景描述"
  }

  bodyPartId 可选值: head, face, torso_inner, torso_outer, hands, waist, legs, feet, accessory

  仅返回 JSON 对象，不要有其他内容。
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
      responseMimeType: "application/json"
    }
  });

  return JSON.parse(response.text || "{}");
};

// 2. Clothing Analysis
const analyzeClothingImage = async (base64Image, mimeType, suggestedBodyPart) => {
  const ai = createAI();
  const model = "gemini-2.0-flash";

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

  返回格式：
  {
    "type": "服装类型",
    "category": "分类",
    "bodyPartId": "身体部位ID",
    "color": "颜色",
    "material": "材质",
    "pattern": "图案",
    "style": "风格",
    "fit": "版型",
    "details": ["细节1", "细节2"]
  }

  仅返回 JSON 对象，不要有其他内容。
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
      responseMimeType: "application/json"
    }
  });

  return JSON.parse(response.text || "{}");
};

// 3. Generate Fitting Prompt
const generateFittingPrompt = async (modelAnalysis, clothingItems) => {
  const ai = createAI();
  const model = "gemini-2.0-flash";

  const clothingDataForPrompt = clothingItems.map(item => ({
    bodyPartId: item.analysis?.bodyPartId || item.slotId,
    analysis: item.analysis,
    userCustomModifier: item.customModifier
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
     - CRITICAL: If the item has a 'userCustomModifier' (e.g. "baggy", "floor length", "open jacket"), you MUST incorporate this modifier into the description of the new clothing.
     - Combine these instructions smoothly.
     - IMPORTANT: If bodyPartId is 'torso_inner' and 'torso_outer', describe the layering clearly.
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

// 4. Generate Try-On Image
const generateTryOnImage = async (modelImageBase64, modelMimeType, clothingItems, prompt, targetRatio = 'Auto', imageWidth = 512, imageHeight = 512) => {
  const ai = createAI();
  const model = "gemini-2.0-flash-exp-image-generation";

  const aspectRatio = getSupportedAspectRatio(targetRatio, imageWidth, imageHeight);
  console.log(`Generating with Aspect Ratio: ${aspectRatio} (Requested: ${targetRatio})`);

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

  const parts = [
    fileToGenerativePart(modelImageBase64, modelMimeType),
    ...clothingItems.map(item => fileToGenerativePart(item.base64, item.mimeType)),
    { text: multimodalPrompt }
  ];

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      responseModalities: ["image", "text"],
      imageConfig: {
        aspectRatio: aspectRatio
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData && part.inlineData.data) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new Error("No image generated.");
};

// 5. Generate E-commerce Poses
const generateEcommercePoses = async (modelImageBase64, modelMimeType, clothingItems, basePrompt) => {
  const ai = createAI();
  const model = "gemini-2.0-flash-exp-image-generation";
  const aspectRatio = "3:4";

  const poses = [
    "Dynamic Walking: Full body shot, model walking towards camera, natural movement, fabric motion, high-end e-commerce style, studio white background.",
    "Side Profile: Standing side profile, highlighting the silhouette of the outfit, hand elegantly placed, fashion catalog style, soft lighting.",
    "Casual Standing: Relaxed standing pose, weight on one leg, hands in pockets or natural gesture, engaging eye contact, clean commercial look.",
    "Detail/Sitting: Model sitting on a minimal stool or posing to show lower body details/shoes, artistic fashion composition, sharp focus."
  ];

  const generateSinglePose = async (poseDescription) => {
    let referenceDescription = "Reference Images:\n1. The first image is the MODEL.\n";
    clothingItems.forEach((item, index) => {
      const part = item.analysis?.bodyPartId || "specified part";
      referenceDescription += `${index + 2}. The image #${index + 2} is a CLOTHING item for the [${part}].`;
      if (item.customModifier) {
        referenceDescription += ` Note for this item: ${item.customModifier}`;
      }
      referenceDescription += "\n";
    });

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
          responseModalities: ["image", "text"],
          imageConfig: {
            aspectRatio: aspectRatio
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

  const results = await Promise.all(poses.map(pose => generateSinglePose(pose)));
  return results.filter(res => res !== null);
};

module.exports = {
  analyzeModelImage,
  analyzeClothingImage,
  generateFittingPrompt,
  generateTryOnImage,
  generateEcommercePoses
};
