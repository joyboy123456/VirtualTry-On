import React, { useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

interface ImageUploaderProps {
  label: string;
  onImageSelect: (file: File, base64: string) => void;
  selectedImage: string | null;
  onClear: () => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ 
  label, 
  onImageSelect, 
  selectedImage,
  onClear
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onImageSelect(file, reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-2">
        <label className="text-cyan-400 font-mono text-sm uppercase tracking-wider">{label}</label>
        {selectedImage && (
          <button 
            onClick={onClear}
            className="text-gray-400 hover:text-red-400 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div
        className={`relative h-64 w-full border-2 border-dashed rounded-lg transition-all duration-300 overflow-hidden group
          ${isDragging ? 'border-cyan-400 bg-cyan-900/20' : 'border-gray-700 bg-gray-900/50 hover:border-cyan-700'}
          ${selectedImage ? 'border-solid border-cyan-500/50' : ''}
        `}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !selectedImage && inputRef.current?.click()}
      >
        <input
          type="file"
          ref={inputRef}
          onChange={handleChange}
          accept="image/*"
          className="hidden"
        />

        {selectedImage ? (
          <img 
            src={selectedImage} 
            alt="Preview" 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 group-hover:text-cyan-400 transition-colors cursor-pointer">
            <Upload size={48} className="mb-4 opacity-50" />
            <p className="font-mono text-sm">拖拽图片或点击上传</p>
          </div>
        )}
        
        {/* Tech overlay effect */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute top-2 left-2 pointer-events-none">
          <ImageIcon size={16} className="text-cyan-500/50" />
        </div>
      </div>
    </div>
  );
};