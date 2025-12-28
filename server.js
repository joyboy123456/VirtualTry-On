require('dotenv').config(); // 加载 .env 文件

const express = require('express');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');
const geminiService = require('./services/geminiService.server.js');

const app = express();
const port = process.env.PORT || 8080;

// 解析 JSON 请求体，增大限制以支持 base64 图片
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============ API 路由 ============

// 分析模特图片
app.post('/api/analyze-model', async (req, res) => {
  try {
    const { base64Image, mimeType } = req.body;
    if (!base64Image || !mimeType) {
      return res.status(400).json({ error: 'Missing base64Image or mimeType' });
    }
    const result = await geminiService.analyzeModelImage(base64Image, mimeType);
    res.json(result);
  } catch (error) {
    console.error('Error analyzing model:', error);
    res.status(500).json({ error: error.message });
  }
});

// 分析服装图片
app.post('/api/analyze-clothing', async (req, res) => {
  try {
    const { base64Image, mimeType, suggestedBodyPart } = req.body;
    if (!base64Image || !mimeType) {
      return res.status(400).json({ error: 'Missing base64Image or mimeType' });
    }
    const result = await geminiService.analyzeClothingImage(base64Image, mimeType, suggestedBodyPart);
    res.json(result);
  } catch (error) {
    console.error('Error analyzing clothing:', error);
    res.status(500).json({ error: error.message });
  }
});

// 生成试穿提示词
app.post('/api/generate-prompt', async (req, res) => {
  try {
    const { modelAnalysis, clothingItems } = req.body;
    if (!modelAnalysis || !clothingItems) {
      return res.status(400).json({ error: 'Missing modelAnalysis or clothingItems' });
    }
    const result = await geminiService.generateFittingPrompt(modelAnalysis, clothingItems);
    res.json({ prompt: result });
  } catch (error) {
    console.error('Error generating prompt:', error);
    res.status(500).json({ error: error.message });
  }
});

// 生成试穿图片
app.post('/api/generate-tryon', async (req, res) => {
  try {
    const { modelImageBase64, modelMimeType, clothingItems, prompt, targetRatio, imageWidth, imageHeight, imageSize, password } = req.body;
    if (!modelImageBase64 || !modelMimeType || !clothingItems || !prompt) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // 4K 需要密码验证
    let finalImageSize = imageSize || '1K';
    if (finalImageSize === '4K') {
      if (password !== '546750103') {
        return res.status(403).json({ error: '4K 分辨率需要输入正确的密码' });
      }
    }

    const result = await geminiService.generateTryOnImage(
      modelImageBase64,
      modelMimeType,
      clothingItems,
      prompt,
      targetRatio || 'Auto',
      imageWidth || 512,
      imageHeight || 512,
      finalImageSize
    );
    res.json({ image: result });
  } catch (error) {
    console.error('Error generating try-on image:', error);
    res.status(500).json({ error: error.message });
  }
});

// 生成电商姿势图片
app.post('/api/generate-poses', async (req, res) => {
  try {
    const { modelImageBase64, modelMimeType, clothingItems, basePrompt } = req.body;
    if (!modelImageBase64 || !modelMimeType || !clothingItems || !basePrompt) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    const result = await geminiService.generateEcommercePoses(
      modelImageBase64,
      modelMimeType,
      clothingItems,
      basePrompt
    );
    res.json({ images: result });
  } catch (error) {
    console.error('Error generating poses:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ 静态文件服务 ============

// Middleware to transform TSX/TS/JSX files on the fly
app.use(async (req, res, next) => {
  // 跳过 API 路由
  if (req.path.startsWith('/api/')) {
    return next();
  }

  let requestPath = req.path;
  const filePath = path.join(__dirname, requestPath);

  // Resolve extension if missing
  let fileToServe = null;

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts') || filePath.endsWith('.jsx')) {
      fileToServe = filePath;
    }
  } else {
    const extensions = ['.tsx', '.ts', '.jsx', '.js'];
    for (const ext of extensions) {
      if (fs.existsSync(filePath + ext)) {
        fileToServe = filePath + ext;
        break;
      }
    }
  }

  if (fileToServe) {
    try {
      const content = fs.readFileSync(fileToServe, 'utf8');
      const result = await esbuild.transform(content, {
        loader: 'tsx',
        format: 'esm',
        target: 'es2020',
        jsx: 'automatic'
        // 不再注入 API Key 到前端
      });

      res.setHeader('Content-Type', 'application/javascript');
      return res.send(result.code);
    } catch (e) {
      console.error('Compilation error for:', fileToServe, e);
      return res.status(500).send(e.message);
    }
  }

  next();
});

// Serve static files
app.use(express.static(__dirname));

// Fallback for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Listen on 0.0.0.0 is crucial for containerized environments like Cloud Run
app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});
