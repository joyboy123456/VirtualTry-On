require('dotenv').config(); // 加载 .env 文件

const express = require('express');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const app = express();
// Cloud Run requires listening on 0.0.0.0 or the specific port provided via env
const port = process.env.PORT || 8080;
// 支持多 Key 配置
const apiKeys = process.env.API_KEYS || process.env.API_KEY || '';

// Middleware to transform TSX/TS/JSX files on the fly
app.use(async (req, res, next) => {
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
        jsx: 'automatic', // Use React 17+ automatic runtime
        define: {
          // 注入多 Key 配置到浏览器端
          'process.env.API_KEYS': JSON.stringify(apiKeys),
          'process.env.API_KEY': JSON.stringify(process.env.API_KEY || '')
        }
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