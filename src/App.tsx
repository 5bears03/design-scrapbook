import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { format, parseISO } from "date-fns";
import { Upload, X, Copy, Check, Paperclip, Pin, Moon, Sun, LayoutList, Columns as ColumnsIcon, LayoutGrid, Plus, PenLine } from "lucide-react";
import { extractColors as runColorExtraction } from "extract-colors";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";
import { GoogleGenAI, Type } from "@google/genai";

// Types
interface Tag {
  id: number;
  imageId: number;
  term: string;
}

interface ImageItem {
  id: number;
  url: string;
  date: string;
  tags: Tag[];
}

export default function App() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [columnCount, setColumnCount] = useState<1 | 2 | 4>(2);

  const cycleColumns = () => {
    if (columnCount === 1) setColumnCount(2);
    else if (columnCount === 2) setColumnCount(4);
    else setColumnCount(1);
  };

  // Theme effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Fetch images
  useEffect(() => {
    fetchImages();
  }, []);

  const fetchImages = async () => {
    try {
      const res = await fetch("/api/images");
      if (res.ok) {
        const data = await res.json();
        setImages(data);
      }
    } catch (error) {
      console.error("Failed to fetch images:", error);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    
    setIsUploading(true);
    const date = new Date();
    
    let generatedTags: string[] = [];
    
    try {
      // 1. Convert file to base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Extract just the base64 part
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 2. Call Gemini API
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: file.type,
              },
            },
            {
              text: "Analyze this design screenshot and generate 5 to 10 professional design terminology keywords that describe its style, layout, typography, color palette, or UI patterns. Return ONLY a JSON array of strings.",
            }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
          },
        },
      });

      let text = response.text;
      if (text) {
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        generatedTags = JSON.parse(text);
      }
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      generatedTags = ["UI Design", "Layout", "Typography", `Error: ${error?.message?.substring(0, 20) || 'Unknown'}`];
    }

    // 3. Upload to backend
    const formData = new FormData();
    formData.append("image", file);
    formData.append("date", date.toISOString());
    formData.append("tags", JSON.stringify(generatedTags));

    try {
      const res = await fetch("/api/images", {
        method: "POST",
        body: formData,
      });
      
      if (res.ok) {
        const newImage = await res.json();
        setImages(prev => [...prev, newImage]);
      }
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteImage = async (id: number) => {
    try {
      const res = await fetch(`/api/images/${id}`, { method: "DELETE" });
      if (res.ok) {
        setImages(prev => prev.filter(img => img.id !== id));
      }
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const handleDeleteTag = async (id: number, imageId: number) => {
    try {
      const res = await fetch(`/api/tags/${id}`, { method: "DELETE" });
      if (res.ok) {
        setImages(prev => prev.map(img => {
          if (img.id === imageId) {
            return { ...img, tags: img.tags.filter(t => t.id !== id) };
          }
          return img;
        }));
      }
    } catch (error) {
      console.error("Delete tag failed:", error);
    }
  };

  const gridItems: React.ReactNode[] = [];
  
  if (images.length === 0) {
    gridItems.push(
      <div key="example" className="mb-12 flex flex-col items-center gap-5 w-full relative animate-in fade-in duration-700">
        <div className="absolute -top-8 -left-4 z-30 transform -rotate-12">
          <span className="font-handwriting text-2xl font-bold text-destructive/80 bg-background/80 px-2 rounded hidden sm:block">
            Example
          </span>
        </div>
        <div className={`text-center z-10 -mb-2 ${columnCount === 4 ? 'max-sm:hidden' : ''}`}>
          <span className="font-handwriting text-xl font-bold masking-tape inline-block whitespace-nowrap">
            {format(new Date(), "MMM d, yyyy")}
          </span>
        </div>
        <div className="opacity-80 sepia-[.2] w-full">
          <ImageCard 
            image={{
              id: -1,
              url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop",
              date: new Date().toISOString(),
              tags: [
                { id: -1, imageId: -1, term: "Typography" },
                { id: -2, imageId: -1, term: "Retro Colors" },
                { id: -3, imageId: -1, term: "Layout" }
              ]
            }} 
            onDeleteImage={() => {}}
            onDeleteTag={() => {}}
            isExample={true}
            columnCount={columnCount}
          />
        </div>
      </div>
    );
  } else {
    images.forEach(img => {
      gridItems.push(
        <div key={img.id} className="mb-12 flex flex-col items-center gap-5 w-full">
          <div className={`text-center z-10 -mb-2 ${columnCount === 4 ? 'max-sm:hidden' : ''}`}>
            <span className="font-handwriting text-xl font-bold masking-tape inline-block whitespace-nowrap">
              {format(parseISO(img.date), "MMM d, yyyy")}
            </span>
          </div>
          <ImageCard 
            image={img} 
            onDeleteImage={() => handleDeleteImage(img.id)}
            onDeleteTag={(tagId) => handleDeleteTag(tagId, img.id)}
            columnCount={columnCount}
          />
        </div>
      );
    });
  }

  gridItems.push(
    <div key="upload-zone" className="flex flex-col items-center gap-5 w-full mb-12">
      <div className={`text-center opacity-0 select-none -mb-2 ${columnCount === 4 ? 'max-sm:hidden' : ''}`}>
        <span className="font-handwriting text-xl masking-tape inline-block px-4 py-1">Spacing</span>
      </div>
      <UploadZone onUpload={handleFileUpload} isFirst={images.length === 0} columnCount={columnCount} />
    </div>
  );

  const columns: React.ReactNode[][] = Array.from({ length: columnCount }, () => []);
  gridItems.forEach((item, index) => {
    columns[index % columnCount].push(item);
  });

  return (
    <TooltipProvider>
      <div className="min-h-screen vintage-paper font-sans p-6 md:p-12 flex flex-col items-center relative overflow-hidden">
        {/* Artistic Paper Marks */}
        <div className="torn-edge" />
        <div className="paper-crease" />
        <div className="absolute top-10 left-10 w-32 h-32 border border-black/5 rounded-full pointer-events-none scale-150 opacity-20 rotate-12" />
        
        {/* Header */}
        <header className="flex flex-col items-center justify-center mb-16 pt-12 max-w-7xl mx-auto w-full relative">
          <div className="flex flex-col items-center relative">
            <div className="flex items-center gap-4">
              <h1 className="text-5xl font-handwriting tracking-tight text-primary font-bold -rotate-2 drop-shadow-md">
                Design Scrapbook
              </h1>
              <PenLine className="w-8 h-8 text-primary opacity-60 -rotate-12 mt-2" />
            </div>
            <p className="font-handwriting text-xl text-primary/70 mt-2">collection of inspiration & ideas</p>
          </div>
          
          <div className="absolute right-0 top-0 flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={cycleColumns} className="rounded-full hover:bg-primary/10" title="Toggle Layout Columns">
              {columnCount === 1 && <LayoutList className="w-5 h-5 text-primary" />}
              {columnCount === 2 && <ColumnsIcon className="w-5 h-5 text-primary" />}
              {columnCount === 4 && <LayoutGrid className="w-5 h-5 text-primary" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setIsDarkMode(!isDarkMode)} className="rounded-full hover:bg-primary/10" title="Toggle Dark Mode">
              {isDarkMode ? <Sun className="w-6 h-6 text-primary" /> : <Moon className="w-6 h-6 text-primary" />}
            </Button>
          </div>
        </header>

        {/* Main Grid */}
        <main className={`flex-1 w-full mx-auto ${columnCount === 1 ? 'max-w-xl' : columnCount === 2 ? 'max-w-5xl' : 'max-w-7xl'}`}>
          <div className="flex w-full gap-6 md:gap-10 pb-20 items-start justify-center">
            {columns.map((col, colIndex) => (
              <div key={colIndex} className="flex flex-col flex-1 gap-0 w-full min-w-0">
                {col}
              </div>
            ))}
          </div>
        </main>

        {/* Loading Overlay */}
        <AnimatePresence>
          {isUploading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center"
            >
              <div className="bg-card p-6 rounded-2xl shadow-xl border border-primary/20 flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="font-handwriting text-xl font-bold text-primary">Generating Design Terms...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
}

// Subcomponents
const UploadZone: React.FC<{ onUpload: (file: File) => void, isFirst?: boolean, columnCount?: number }> = ({ onUpload, isFirst, columnCount }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) onUpload(file);
        break;
      }
    }
  };

  return (
    <div 
      className={`border-[3px] border-dashed border-primary/30 rounded-lg flex flex-col items-center justify-center text-center cursor-pointer hover:bg-primary/5 hover:border-primary/60 transition-colors group w-full aspect-[4/5] shadow-inner bg-[#ece4d8]/40 dark:bg-[#1f1917]/40 relative overflow-hidden p-4 ${isFirst ? 'scale-105' : ''}`}
      onClick={() => fileInputRef.current?.click()}
      onPaste={handlePaste}
      tabIndex={0}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/*" 
        className="hidden" 
      />
      {columnCount === 4 ? (
        <>
          {/* Mobile 4-col view (minimalist plus only) */}
          <div className="sm:hidden flex flex-col items-center justify-center w-full h-full text-primary/40 group-hover:text-primary transition-colors">
            <Plus className="w-8 h-8 group-hover:scale-110 transition-transform duration-300" />
          </div>
          {/* Desktop 4-col view or other sizes (normal full view hidden on mobile sizes) */}
          <div className="hidden sm:flex flex-col items-center w-full">
            <Upload className="w-10 h-10 sm:w-12 sm:h-12 text-primary/40 group-hover:text-primary mb-2 sm:mb-4 transition-colors group-hover:scale-110 duration-300" />
            <p className="text-xl sm:text-3xl font-handwriting font-bold text-primary/60 group-hover:text-primary select-none -rotate-2 leading-tight">
              click or paste
            </p>
            <p className="text-sm sm:text-xl font-handwriting text-primary/50 group-hover:text-primary/80 select-none mt-2 leading-tight">
              a shiny new screenshot
            </p>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center w-full">
          <Upload className="w-10 h-10 sm:w-12 sm:h-12 text-primary/40 group-hover:text-primary mb-2 sm:mb-4 transition-colors group-hover:scale-110 duration-300" />
          <p className="text-xl sm:text-3xl font-handwriting font-bold text-primary/60 group-hover:text-primary select-none -rotate-2 leading-tight">
            click or paste
          </p>
          <p className="text-sm sm:text-xl font-handwriting text-primary/50 group-hover:text-primary/80 select-none mt-2 leading-tight">
            a shiny new screenshot
          </p>
        </div>
      )}
    </div>
  );
}

const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map(x => {
  const hex = x.toString(16)
  return hex.length === 1 ? '0' + hex : hex
}).join('')

const ImageCard: React.FC<{
  image: ImageItem, 
  onDeleteImage: () => void,
  onDeleteTag: (id: number) => void,
  isExample?: boolean,
  columnCount?: number
}> = ({ image, onDeleteImage, onDeleteTag, isExample, columnCount }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [palette, setPalette] = useState<string[]>([]);
  const randomRotate = useRef(Math.random()).current;
  const decorationType = useRef(Math.floor(Math.random() * 3)).current; // 0: tape, 1: pin, 2: paperclip
  const imgRef = useRef<HTMLImageElement>(null);

  const getColors = async () => {
    try {
      if (imgRef.current && imgRef.current.src) {
        // extractColors handles fetching and canvas under the hood
        const colors = await runColorExtraction(imgRef.current.src, { crossOrigin: 'anonymous', distance: 0.1 });
        if (colors && colors.length > 0) {
          setPalette(colors.slice(0, 5).map(c => c.hex));
        }
      }
    } catch (e) {
      console.error("Color extraction failed:", e);
    }
  };

  return (
    <div 
      className="relative group w-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Delete Image Button */}
      <AnimatePresence>
        {isHovered && !isExample && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={onDeleteImage}
            className="absolute -top-2 -right-2 z-20 bg-destructive text-destructive-foreground rounded-full p-1.5 shadow-md hover:bg-destructive/90"
          >
            <X className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>

      <div 
        className="polaroid relative w-full" 
        style={{ '--random-rotate': randomRotate } as React.CSSProperties}
      >
        {/* Skeuomorphic Decoration */}
        {decorationType === 0 && <div className="tape" />}
        {decorationType === 1 && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 text-red-500 drop-shadow-md">
            <Pin className="w-6 h-6 fill-current" />
          </div>
        )}
        {decorationType === 2 && (
          <div className="absolute -top-4 -right-2 z-10 text-gray-400 drop-shadow-md transform rotate-45">
            <Paperclip className="w-8 h-8" />
          </div>
        )}

        <img 
          ref={imgRef}
          src={image.url} 
          alt="Design Inspiration" 
          className="w-full h-auto object-cover rounded-sm border border-black/5"
          crossOrigin="anonymous"
          onLoad={getColors}
          referrerPolicy="no-referrer"
        />
        
        {/* Color Palette Overlay */}
        <div className="absolute top-2 left-2 right-2 flex gap-1 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none group-hover:pointer-events-auto">
          {palette.map((hex, i) => (
            <PaletteColor key={i} hex={hex} columnCount={columnCount} />
          ))}
        </div>
        
        {/* Tags Area */}
        <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-all duration-300 ease-out">
          <div className="overflow-hidden">
            <div className="pt-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-100">
              <TagsDisplay tags={image.tags} onDeleteTag={onDeleteTag} isExample={isExample} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const PaletteColor: React.FC<{ hex: string; columnCount?: number }> = ({ hex, columnCount }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine if we should hide the hex text based on layout density to prevent overflow
  const isCramped = columnCount !== undefined ? 
    (columnCount >= 2 ? 'max-sm:hidden' : '') + ' ' + (columnCount >= 4 ? 'max-md:hidden' : '') 
    : '';

  return (
    <>
      <div 
        className="flex-1 h-2 hover:h-6 rounded-sm transition-all duration-200 cursor-pointer shadow-sm border border-black/10 relative group/color flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: hex }}
        onClick={handleCopy}
        title="Copy hex code"
      >
        <span className={`opacity-0 group-hover/color:opacity-100 text-[10px] font-mono tracking-tighter text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] absolute transition-opacity duration-200 ${isCramped}`}>
          {hex}
        </span>
      </div>
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {copied && (
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] pointer-events-none">
              <motion.div 
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: -20 }}
                className="bg-black/80 font-handwriting backdrop-blur-md text-white px-8 py-4 rounded-full text-3xl shadow-2xl flex items-center gap-3 border border-white/10"
              >
                <Check className="w-8 h-8 text-green-400" />
                copied!
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

const TagsDisplay: React.FC<{ tags: Tag[], onDeleteTag: (id: number) => void, isExample?: boolean }> = ({ tags, onDeleteTag, isExample }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  if (!tags || tags.length === 0) return null;

  const handleCopy = (e: React.MouseEvent, text: string, id: number) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const visibleTags = isExpanded ? tags : tags.slice(0, 1);
  const hiddenCount = tags.length - 1;

  return (
    <div 
      className="flex flex-wrap gap-2"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {visibleTags.map(tag => (
        <div 
          key={tag.id} 
          className="group/tag relative flex items-center bg-primary/10 text-primary-foreground text-xs font-semibold px-2.5 py-1.5 rounded-md border border-primary/20 cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors max-w-full"
          onClick={(e) => handleCopy(e, tag.term, tag.id)}
        >
          <span className="text-primary group-hover/tag:text-primary-foreground transition-colors pr-3 break-words truncate">{tag.term}</span>
          
          <div className="absolute right-1.5 pt-[1px]">
            {copiedId === tag.id ? (
              <Check className="w-3 h-3 flex-shrink-0" />
            ) : (
              <Copy className="w-3 h-3 opacity-0 group-hover/tag:opacity-100 transition-opacity flex-shrink-0" />
            )}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!isExample) onDeleteTag(tag.id);
            }}
            className={`absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 transition-opacity shadow-sm hover:scale-110 ${isExample ? 'hidden' : 'opacity-0 group-hover/tag:opacity-100'}`}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      ))}
      
      {!isExpanded && hiddenCount > 0 && (
        <div className="inline-flex items-center bg-secondary text-secondary-foreground text-xs font-semibold px-2 py-1.5 rounded-md border border-border">
          +{hiddenCount}
        </div>
      )}
    </div>
  );
}
