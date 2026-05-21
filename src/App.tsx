import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { format, parseISO } from "date-fns";
import { Upload, X, Copy, Check, Paperclip, Pin, Moon, Sun, LayoutList, Columns as ColumnsIcon, LayoutGrid, Plus, PenLine, ChevronLeft, ChevronRight, Wand2, Download, FileText, Image as ImageIcon, ArrowUpDown } from "lucide-react";
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
  category: string;
  description?: string;
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
  const [isDetailedMode, setIsDetailedMode] = useState(false);
  const [authErrorMsg, setAuthErrorMsg] = useState<string | null>(null);
  const [columnCount, setColumnCount] = useState<1 | 2 | 4>(2);
  const [[currentPage, direction], setCurrentPage] = useState([1, 0]);
  const [isAscending, setIsAscending] = useState<boolean>(true);

  const globalFileInputRef = useRef<HTMLInputElement>(null);

  const handleGlobalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  // Global drag-and-drop & paste event listeners
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            handleFileUpload(file);
            break;
          }
        }
      }
    };

    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleGlobalDrop = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith("image/")) {
          handleFileUpload(file);
        }
      }
    };

    window.addEventListener("paste", handleGlobalPaste);
    window.addEventListener("dragover", handleGlobalDragOver);
    window.addEventListener("drop", handleGlobalDrop);

    return () => {
      window.removeEventListener("paste", handleGlobalPaste);
      window.removeEventListener("dragover", handleGlobalDragOver);
      window.removeEventListener("drop", handleGlobalDrop);
    };
  }, [images]);

  const getItemsPerPage = () => {
    if (columnCount === 1) return 6;
    if (columnCount === 2) return 12;
    return 24;
  };

  const itemsPerPage = getItemsPerPage();
  const totalPages = Math.ceil(images.length / itemsPerPage) || 1;

  // Reset to first page when layout changes to avoid being out of bounds
  useEffect(() => {
    setCurrentPage([1, 0]);
  }, [columnCount]);

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
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          setImages(data.sort((a: ImageItem, b: ImageItem) => new Date(a.date).getTime() - new Date(b.date).getTime()));
        } else {
          const text = await res.text();
          if (text.includes("Cookie check") || text.includes("Action required to load your app")) {
            setAuthErrorMsg("您的登录会话已过期，或浏览器阻止了安全 Cookie（常见于 Safari / iOS 或旧版浏览器）。建议在新窗口打开应用重新登录。");
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch images:", error);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    
    setIsUploading(true);
    const date = new Date();
    
    let tagsToSave: Record<string, string[]> = {};
    
    try {
      // Check if API key is available
      if (!process.env.GEMINI_API_KEY) {
        console.warn("GEMINI_API_KEY is not defined. Tags will be generic.");
        tagsToSave = { "Design": ["UI Design", "Layout", "Typography"] };
      } else {
        // 1. Convert file to base64
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // 2. Call Gemini
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const result = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    data: base64Data,
                    mimeType: file.type,
                  },
                },
                {
                  text: `作为资深 UI 专家与前端工程师，请深度分析这张截图。你的目标是提取真正能定义“设计灵魂”的关键词。

-- 分类维度（按重要程度排序）：
1. Style & Aesthetic: 宏观风格关键词 (例如: y2k, minimalism, neo-brutalism, glassmorphism, bauhaus, cyberpunk, material-design)。
2. Layout: 关键布局特征 (例如: bento-grid, flex-col, sticky-nav, sidebar-layout)。
3. Typography & Color: 具有辨识度的字体和色调 (例如: font-serif, tracking-tighter, bg-gradient-to-br, transition-colors)。
4. Details: 提升质感的细节 (例如: shadow-2xl, backdrop-blur-md, rounded-full, animated-gradient)。

-- 严禁输出：
- 无设计意义的默认值 (如 border, w-full, p-4, bg-white)。
- 极其普通的色号 (如 bg-gray-100, text-black)。

-- 约束：
- 关键词必须是英文，总数在 6-12 个。
- 优先选择有“味道”的词汇，而不是枯燥的代码。
- 严禁包含 Markdown 代码块或任何多余文字。
- 对于每一个关键词，必须提供一个 10 字以内的中文简要解释 (description)。

直接返回如下格式的 JSON 对象：
{
  "Style & Aesthetic": [
    { "term": "y2k", "description": "千禧复古未来感" },
    { "term": "cyberpunk", "description": "赛博朋克霓虹美学" }
  ],
  "Layout": [
    { "term": "bento-grid", "description": "模块化通栏格子布局" }
  ],
  "Typography & Color": [
    { "term": "font-mono", "description": "极客感等宽字体" },
    { "term": "bg-gradient-to-tr", "description": "对角线性渐变背景" }
  ],
  "Details": [
    { "term": "shadow-drop", "description": "柔和悬浮投影" }
  ]
}`,
                },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
          },
        });

        const aiResponseText = (result && typeof result.text === 'string')
          ? result.text
          : "";

        if (aiResponseText) {
          try {
            const rawOutput = JSON.parse(aiResponseText);
            tagsToSave = rawOutput;
          } catch (e) {
            console.error("Tags JSON parsing failed:", e);
            tagsToSave = { 
              "Layout": ["flex", "relative"], 
              "Typography": ["font-sans"],
              "Colors & Backgrounds": ["bg-white"] 
            };
          }
        }
      }
    } catch (aiError) {
      console.error("Gemini analysis error:", aiError);
      tagsToSave = { 
        "Layout": ["flex", "items-center"], 
        "Typography": ["font-medium"],
        "Colors & Backgrounds": ["bg-zinc-50"] 
      };
    }

    const formData = new FormData();
    formData.append("image", file);
    formData.append("date", date.toISOString());
    formData.append("tags", JSON.stringify(tagsToSave));

    try {
      const res = await fetch("/api/images", {
        method: "POST",
        body: formData,
      });
      
      const contentType = res.headers.get("content-type");
      let data;
      
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error("Server returned non-JSON response:", text);
        // Special diagnostic for Cookie Check page
        if (text.includes("Cookie check")) {
          throw new Error("您的认证已过期（Authentication session expired）。请刷新页面重新登录后再尝试上传。");
        }
        throw new Error(`服务器返回了非预期响应 (${res.status}): ${text.substring(0, 100)}`);
      }
      
      if (res.ok) {
        setImages(prev => [...prev, data]);
        if (isAscending) {
          const nextImagesCount = images.length + 1;
          const targetPage = Math.ceil(nextImagesCount / itemsPerPage) || 1;
          setCurrentPage([targetPage, 1]);
        } else {
          setCurrentPage([1, -1]);
        }
      } else {
        console.error("Upload failed server-side:", data.error);
        alert(`上传失败: ${data.error || '服务器错误'}`);
      }
    } catch (error: any) {
      console.error("Upload error details:", error);
      if (error.message.includes("您的认证已过期") || error.message.includes("Authentication session expired")) {
        setAuthErrorMsg("您的登录会话已过期，或浏览器阻止了安全 Cookie（常见于 Safari / iOS 或旧版浏览器）。建议在新窗口打开应用重新登录。");
      } else {
        alert(`上传出错: ${error.message}`);
      }
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

  // Sort images dynamically based on isAscending state
  const sortedImages = [...images].sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    return isAscending ? timeA - timeB : timeB - timeA;
  });

  // Pagination logic
  const paginatedImages = sortedImages.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const gridItems: React.ReactNode[] = [];
  
  if (images.length === 0) {
    gridItems.push(
      <div key="example" className="mb-12 flex flex-col items-center gap-5 w-full relative">
        <div className="absolute -top-8 -left-4 z-30 transform -rotate-12">
          <span className="font-handwriting text-2xl font-bold text-destructive/80 bg-background/80 px-2 rounded hidden sm:block">
            Example
          </span>
        </div>
          <div className={`text-center z-10 -mb-2 ${columnCount === 4 ? 'max-sm:hidden' : ''}`}>
            <span 
              className="font-handwriting text-xl font-bold inline-block whitespace-nowrap opacity-60"
              style={{ '--random-rotate': Math.random() } as React.CSSProperties}
            >
              example
            </span>
          </div>
        <div className="opacity-80 sepia-[.2] w-full">
          <ImageCard 
            image={{
              id: -1,
              url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop",
              date: new Date().toISOString(),
              tags: [
                { id: -1, imageId: -1, term: "Glassmorphism", category: "Style & Aesthetic", description: "磨砂玻璃拟态风格" },
                { id: -2, imageId: -1, term: "font-serif", category: "Typography & Color", description: "古典衬线字体特征" },
                { id: -3, imageId: -1, term: "bento-grid", category: "Layout", description: "日式便当格子布局" }
              ]
            }} 
            onDeleteImage={() => {}}
            onDeleteTag={() => {}}
            isExample={true}
            columnCount={columnCount}
            isDetailedMode={isDetailedMode}
          />
        </div>
      </div>
    );
  } else {
    paginatedImages.forEach(img => {
      gridItems.push(
        <div key={img.id} className="mb-12 flex flex-col items-center gap-5 w-full">
          <div className={`text-center z-10 -mb-2 ${columnCount === 4 ? 'max-sm:hidden' : ''}`}>
            <span 
              className="font-handwriting text-xl font-bold inline-block whitespace-nowrap opacity-60"
              style={{ '--random-rotate': (img.id % 5) / 5 } as React.CSSProperties} // Use deterministic rotation for performance/consistency
            >
              {format(parseISO(img.date), "MMM d, yyyy")}
            </span>
          </div>
          <ImageCard 
            image={img} 
            onDeleteImage={() => handleDeleteImage(img.id)}
            onDeleteTag={(tagId) => handleDeleteTag(tagId, img.id)}
            columnCount={columnCount}
            isDetailedMode={isDetailedMode}
          />
        </div>
      );
    });
  }

  const columns: React.ReactNode[][] = Array.from({ length: columnCount }, () => []);
  gridItems.forEach((item, index) => {
    columns[index % columnCount].push(item);
  });

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 300 : -300,
      opacity: 0,
    })
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen vintage-paper font-sans p-6 md:p-12 flex flex-col items-center relative transition-colors duration-300">
        {/* Artistic Paper Marks */}
        <div className="torn-edge" />
        <div className="paper-crease" />
        <div className="absolute top-10 left-10 w-32 h-32 border border-black/5 rounded-full pointer-events-none scale-150 opacity-20 rotate-12" />
        
        {/* Header */}
        <header className="flex flex-col items-center justify-center mb-16 pt-12 max-w-7xl mx-auto w-full relative">
          <div className="flex flex-col items-center relative">
            <div className="flex items-center gap-4">
              <h1 className="text-5xl font-handwriting tracking-tight text-primary font-bold -rotate-2 drop-shadow-md">
                Visual Prompt Clipboard
              </h1>
              <PenLine className="w-8 h-8 text-primary opacity-60 -rotate-12 mt-2" />
            </div>
            <p className="font-handwriting text-xl text-primary/70 mt-2">collection of inspiration & ideas</p>
          </div>
          
          <div className="absolute right-0 top-0 flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const toggled = !isAscending;
                setIsAscending(toggled);
                setCurrentPage([1, toggled ? 1 : -1]);
              }}
              className="rounded-full hover:bg-primary/10"
              title={isAscending ? "正序排列" : "倒序排列"}
            >
              <ArrowUpDown className="w-5 h-5 text-primary/60 hover:text-primary transition-colors" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsDetailedMode(!isDetailedMode)} 
              className={`rounded-full hover:bg-primary/10 ${isDetailedMode ? 'bg-primary/10 border border-primary/20' : ''}`}
              title="显示详情"
            >
              <Wand2 className={`w-5 h-5 ${isDetailedMode ? 'text-primary' : 'text-primary/60'}`} />
            </Button>
            <Button variant="ghost" size="icon" onClick={cycleColumns} className="rounded-full hover:bg-primary/10" title="切换布局">
              {columnCount === 1 && <LayoutList className="w-5 h-5 text-primary" />}
              {columnCount === 2 && <ColumnsIcon className="w-5 h-5 text-primary" />}
              {columnCount === 4 && <LayoutGrid className="w-5 h-5 text-primary" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setIsDarkMode(!isDarkMode)} className="rounded-full hover:bg-primary/10" title="切换主题">
              {isDarkMode ? <Sun className="w-6 h-6 text-primary" /> : <Moon className="w-6 h-6 text-primary" />}
            </Button>
          </div>
        </header>

        {/* Main Grid */}
        <main className={`flex-1 w-full mx-auto ${columnCount === 1 ? 'max-w-xl' : columnCount === 2 ? 'max-w-5xl' : 'max-w-7xl'}`}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div 
              key={currentPage}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 }
              }}
              className="flex w-full gap-6 md:gap-10 pb-20 items-start justify-center"
            >
              {columns.map((col, colIndex) => (
                <div key={colIndex} className="flex flex-col flex-1 gap-0 w-full min-w-0">
                  {col}
                </div>
              ))}
            </motion.div>
          </AnimatePresence>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-8 py-8 relative">
              <Button 
                variant="ghost" 
                onClick={() => setCurrentPage([Math.max(1, currentPage - 1), -1])}
                disabled={currentPage === 1}
                className="text-primary hover:bg-primary/5 disabled:opacity-30"
              >
                <ChevronLeft className="w-8 h-8" />
              </Button>
              
              <div className="flex items-center gap-3">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      const newPage = i + 1;
                      if (newPage !== currentPage) {
                        setCurrentPage([newPage, newPage > currentPage ? 1 : -1]);
                      }
                    }}
                    className={`w-3 h-3 rounded-full transition-all duration-300 ${currentPage === i + 1 ? 'bg-primary scale-125' : 'bg-primary/20 hover:bg-primary/40'}`}
                  />
                ))}
              </div>

              <Button 
                variant="ghost" 
                onClick={() => setCurrentPage([Math.min(totalPages, currentPage + 1), 1])}
                disabled={currentPage === totalPages}
                className="text-primary hover:bg-primary/5 disabled:opacity-30"
              >
                <ChevronRight className="w-8 h-8" />
              </Button>

              <div className="absolute -bottom-2 text-primary/30 font-handwriting italic">
                Page {currentPage} of {totalPages}
              </div>
            </div>
          )}
        </main>

        {/* Footer - Finite feeling */}
        <footer className="w-full max-w-7xl mx-auto pt-8 pb-8 flex flex-col items-center justify-center relative">
          <div className="w-full h-px bg-primary/10 mb-8" />
          <p className="font-handwriting text-2xl text-primary/40 italic">End of current collection</p>
        </footer>

        {/* Floating Add Button */}
        <div className="fixed bottom-8 right-8 z-50 flex flex-col gap-4">
          <input 
            type="file" 
            ref={globalFileInputRef} 
            onChange={handleGlobalFileChange} 
            accept="image/*" 
            className="hidden" 
          />
          <Button 
            onClick={() => {
              globalFileInputRef.current?.click();
            }}
            className="w-16 h-16 rounded-full shadow-2xl bg-primary text-primary-foreground hover:scale-110 transition-transform flex items-center justify-center border-2 border-primary-foreground/20 cursor-pointer"
            title="添加图片"
          >
            <Plus className="w-8 h-8" />
          </Button>
        </div>



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

        {/* Auth Error Overlay */}
        <AnimatePresence>
          {authErrorMsg && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-stone-900/40 dark:bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            >
              <div className="bg-white dark:bg-zinc-900 w-full max-w-md p-6 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col gap-5 relative overflow-hidden text-left font-sans">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-red-500" />
                <div className="flex gap-4 items-start">
                  <div className="p-3 bg-red-100 dark:bg-red-950/40 rounded-full text-red-600 dark:text-red-450">
                    <X className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 leading-tight">
                      认证已过期 / Cookie 受限
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono">
                      Session expired or cookie blocked
                    </p>
                  </div>
                </div>

                <div className="text-sm text-zinc-750 dark:text-zinc-300 leading-relaxed space-y-3 font-sans">
                  <p>
                    由于浏览器的网络隐私保护限制，或长时间未操作导致会话失效，当前系统的安全 Cookie 无法在 iframe 页面内被正确保存或读取。
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 border-l-2 border-zinc-300 dark:border-zinc-700 pl-2 italic">
                    Because of developer container sandbox context or inactive token timeout, authorization cookies were blocked.
                  </p>
                  <p className="font-semibold text-zinc-850 dark:text-zinc-150">
                    请点击下方按钮在新窗口中单独打开该应用以快速完成重新激活登录，完成后刷新此页面即可恢复正常。
                  </p>
                </div>

                <div className="flex gap-3 justify-end mt-2">
                  <button
                    onClick={() => {
                      setAuthErrorMsg(null);
                    }}
                    className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-xl font-sans text-xs transition-colors cursor-pointer"
                  >
                    关闭窗口
                  </button>
                  <button
                    onClick={() => {
                      window.open(window.location.href, "_blank");
                    }}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-sans text-xs font-semibold shadow-md cursor-pointer transition-colors"
                  >
                    在新窗口打开并授权
                  </button>
                </div>
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
  columnCount?: number,
  isDetailedMode?: boolean
}> = ({ image, onDeleteImage, onDeleteTag, isExample, columnCount, isDetailedMode }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [palette, setPalette] = useState<string[]>([]);
  const randomRotate = useRef(Math.random()).current;
  const decorationType = useRef(Math.floor(Math.random() * 3)).current; // 0: tape, 1: pin, 2: paperclip
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!showExportMenu) return;
    const clickHandler = () => setShowExportMenu(false);
    window.addEventListener('click', clickHandler);
    return () => window.removeEventListener('click', clickHandler);
  }, [showExportMenu]);

  const getColors = async () => {
    try {
      if (imgRef.current && imgRef.current.src) {
        // Create an offscreen image to ensure it's loaded and we can read pixels from a canvas
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imgRef.current.src;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not create canvas context");

        // Scale down to 80x80 to speed up and average out micro-details
        canvas.width = 80;
        canvas.height = 80;
        ctx.drawImage(img, 0, 0, 80, 80);

        const imgData = ctx.getImageData(0, 0, 80, 80).data;
        const clusters: { r: number; g: number; b: number; count: number }[] = [];

        // Simple but highly effective color quantization using distance threshold
        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];

          // Ignore transparent pixels
          if (a < 128) continue;

          let merged = false;
          // Merge threshold (distance ~40 clusters colors that are visually identical or very close)
          const mergeThreshold = 40;

          for (const cluster of clusters) {
            const rDiff = r - cluster.r;
            const gDiff = g - cluster.g;
            const bDiff = b - cluster.b;
            const dist = Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);

            if (dist < mergeThreshold) {
              const newCount = cluster.count + 1;
              cluster.r = (cluster.r * cluster.count + r) / newCount;
              cluster.g = (cluster.g * cluster.count + g) / newCount;
              cluster.b = (cluster.b * cluster.count + b) / newCount;
              cluster.count = newCount;
              merged = true;
              break;
            }
          }

          if (!merged) {
            clusters.push({ r, g, b, count: 1 });
          }
        }

        // --- Option C: Balanced Dominant + Accent Selection + Dynamic Near-Black/White Filter (Scheme A) ---
        const isDullColor = (r: number, g: number, b: number) => {
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const s = max === 0 ? 0 : (max - min) / max;
          const v = max / 255;

          // Near pure black / extremely dark (RGB under ~20 is virtually solid black)
          if (v < 0.08) return true;
          // Extremely dark other colors with almost no saturation
          if (v < 0.12 && s < 0.05) return true;

          // Near pure white (flat paper white e.g., v > 0.96 and s < 0.02)
          if (v > 0.96 && s < 0.02) return true;

          return false;
        };

        // Separate clusters into meaningful and dull categories
        const meaningfulClusters: typeof clusters = [];
        const dullClusters: typeof clusters = [];

        for (const cluster of clusters) {
          if (isDullColor(cluster.r, cluster.g, cluster.b)) {
            dullClusters.push(cluster);
          } else {
            meaningfulClusters.push(cluster);
          }
        }

        // 1. Sort clusters by count descending to find dominant candidates
        meaningfulClusters.sort((a, b) => b.count - a.count);
        dullClusters.sort((a, b) => b.count - a.count);

        const selectedClusters: { r: number; g: number; b: number; count: number }[] = [];

        // Select the first 4 dominant colors from meaningful clusters that are visually distinct from each other
        for (const cluster of meaningfulClusters) {
          if (selectedClusters.length >= 4) break;
          const isDistinct = selectedClusters.every(sel => {
            const dist = Math.sqrt((sel.r - cluster.r) ** 2 + (sel.g - cluster.g) ** 2 + (sel.b - cluster.b) ** 2);
            return dist > 60; // Sufficient color difference threshold
          });
          if (selectedClusters.length === 0 || isDistinct) {
            selectedClusters.push(cluster);
          }
        }

        // If we didn't fill 4 slots from meaningful, fill them with top clusters regardless of distance
        for (const cluster of meaningfulClusters) {
          if (selectedClusters.length >= 4) break;
          if (!selectedClusters.includes(cluster)) {
            selectedClusters.push(cluster);
          }
        }

        // Helper to calculate saturation and value/brightness
        const getVibrancyScore = (r: number, g: number, b: number) => {
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const d = max - min;
          const s = max === 0 ? 0 : d / max;
          const v = max / 255;
          // Saturation multiplied by brightness forms a robust vibrancy / accent indicator
          return s * v;
        };

        // 2. Select up to 1 vibrant accent color from the remaining meaningful clusters
        const remainingClusters = meaningfulClusters.filter(c => !selectedClusters.includes(c));
        
        // Filter and sort remaining clusters specifically for high-vibrancy/accent qualities
        const accentCandidates = remainingClusters
          .map(c => ({
            cluster: c,
            score: getVibrancyScore(c.r, c.g, c.b),
            s: Math.max(c.r, c.g, c.b) === 0 ? 0 : (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) / Math.max(c.r, c.g, c.b)
          }))
          // Accent colors should ideally be reasonably saturated (s > 0.15) and distinct from already selected dominant colors
          .filter(cand => {
            if (cand.s < 0.15) return false;
            return selectedClusters.every(sel => {
              const dist = Math.sqrt((sel.r - cand.cluster.r) ** 2 + (sel.g - cand.cluster.g) ** 2 + (sel.b - cand.cluster.b) ** 2);
              return dist > 85; // Visually very distinct from main background
            });
          });

        // Sort by vibrancy score descending
        accentCandidates.sort((a, b) => b.score - a.score);

        // Take top 1 accent color
        for (let i = 0; i < Math.min(1, accentCandidates.length); i++) {
          selectedClusters.push(accentCandidates[i].cluster);
        }

        // 3. Fallbacks to reach 5 total colors:
        // A. Fill with remaining meaningful colors first
        for (const cluster of meaningfulClusters) {
          if (selectedClusters.length >= 5) break;
          if (!selectedClusters.includes(cluster)) {
            selectedClusters.push(cluster);
          }
        }

        // B. If still fewer than 5, fill with the remaining dominant dull colors (monochrome fallback)
        for (const cluster of dullClusters) {
          if (selectedClusters.length >= 5) break;
          if (!selectedClusters.includes(cluster)) {
            selectedClusters.push(cluster);
          }
        }

        const topHexColors = selectedClusters.slice(0, 5).map(cluster => {
          const rHex = Math.round(cluster.r).toString(16).padStart(2, "0");
          const gHex = Math.round(cluster.g).toString(16).padStart(2, "0");
          const bHex = Math.round(cluster.b).toString(16).padStart(2, "0");
          return `#${rHex}${gHex}${bHex}`.toUpperCase();
        });

        if (topHexColors.length > 0) {
          setPalette(topHexColors);
          return;
        }
      }
    } catch (e) {
      console.warn("Custom canvas color extraction with pixel counts failed, falling back to library:", e);
    }

    // Fallback library extraction with similar Option C + Filter logic
    try {
      if (imgRef.current && imgRef.current.src) {
        const colors = await runColorExtraction(imgRef.current.src, { crossOrigin: 'anonymous', distance: 0.1 });
        if (colors && colors.length > 0) {
          const isDullColor = (r: number, g: number, b: number) => {
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const s = max === 0 ? 0 : (max - min) / max;
            const v = max / 255;
            if (v < 0.08) return true;
            if (v < 0.12 && s < 0.05) return true;
            if (v > 0.96 && s < 0.02) return true;
            return false;
          };

          // Sort colors by area descending
          const sortedByArea = [...colors].sort((a, b) => (b.area || 0) - (a.area || 0));
          const meaningfulColors = sortedByArea.filter(c => !isDullColor(c.red, c.green, c.blue));
          const dullColors = sortedByArea.filter(c => isDullColor(c.red, c.green, c.blue));

          const selected: typeof colors = [];

          // 1. Pick top 4 dominant colors that are visually distinct
          for (const c of meaningfulColors) {
            if (selected.length >= 4) break;
            const isDistinct = selected.every(sel => {
              const dist = Math.sqrt((sel.red - c.red) ** 2 + (sel.green - c.green) ** 2 + (sel.blue - c.blue) ** 2);
              return dist > 60;
            });
            if (selected.length === 0 || isDistinct) {
              selected.push(c);
            }
          }

          for (const c of meaningfulColors) {
            if (selected.length >= 4) break;
            if (!selected.includes(c)) selected.push(c);
          }

          // 2. Find up to 1 accent color from remaining colors that are distinct and highly saturated
          const remaining = meaningfulColors.filter(c => !selected.includes(c));
          const accentCandidates = remaining
            .map(c => ({
              color: c,
              score: (c.saturation || 0) * (c.intensity || 0)
            }))
            .filter(cand => {
              if ((cand.color.saturation || 0) < 0.15) return false;
              return selected.every(sel => {
                const dist = Math.sqrt((sel.red - cand.color.red) ** 2 + (sel.green - cand.color.green) ** 2 + (sel.blue - cand.color.blue) ** 2);
                return dist > 85;
              });
            });

          accentCandidates.sort((a, b) => b.score - a.score);

          for (let i = 0; i < Math.min(1, accentCandidates.length); i++) {
            selected.push(accentCandidates[i].color);
          }

          // 3. Fill remaining
          // Fill from remaining meaningful colors
          for (const c of meaningfulColors) {
            if (selected.length >= 5) break;
            if (!selected.includes(c)) selected.push(c);
          }

          // Fill from dull colors (monochrome fallback)
          for (const c of dullColors) {
            if (selected.length >= 5) break;
            if (!selected.includes(c)) selected.push(c);
          }

          setPalette(selected.slice(0, 5).map(c => c.hex.toUpperCase()));
        }
      }
    } catch (fallbackError) {
      console.error("Color extraction fallback failed:", fallbackError);
    }
  };

  const handleExportMarkdown = () => {
    let mdContent = `# Design Clipboard - 提取属性\n\n`;
    
    // 1. 配色色卡
    mdContent += `## 配色色卡\n`;
    if (palette.length > 0) {
      palette.forEach(hex => {
        mdContent += `- \`${hex}\`\n`;
      });
    } else {
      mdContent += `*(暂无提取配色)*\n`;
    }
    mdContent += `\n`;

    // 2. 分类的关键词及中文释义
    mdContent += `## 提取设计特征\n\n`;
    
    const grouped: Record<string, Tag[]> = {};
    image.tags.forEach(tag => {
      let cat = tag.category || "General";
      if (cat.toLowerCase() === "other" || cat.toLowerCase() === "general") cat = "Miscellaneous";
      if (cat === "Style") cat = "Style & Aesthetic";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(tag);
    });

    const categories = Object.keys(grouped).sort((a, b) => {
      if (a === "Style & Aesthetic") return -1;
      if (b === "Style & Aesthetic") return 1;
      return a.localeCompare(b);
    });

    categories.forEach(category => {
      mdContent += `### ${category}\n`;
      grouped[category].forEach(tag => {
        if (tag.description) {
          mdContent += `- **${tag.term}**: ${tag.description}\n`;
        } else {
          mdContent += `- **${tag.term}**\n`;
        }
      });
      mdContent += `\n`;
    });

    mdContent += `---\n`;
    mdContent += `Generated by Visual Prompt Clipboard\n`;

    const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `design-prompt-${image.id || 'export'}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportCardImage = () => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = image.url;
    
    img.onload = () => {
      const cardWidth = 800;
      const maxImgW = 640;
      let imgW = img.width;
      let imgH = img.height;
      if (imgW > maxImgW) {
        const ratio = maxImgW / imgW;
        imgW = maxImgW;
        imgH = imgH * ratio;
      }
      
      const headerHeight = 120;
      const imgSectionHeight = imgH + 40;
      const paletteSectionHeight = 180;
      
      const grouped: Record<string, Tag[]> = {};
      image.tags.forEach(tag => {
        let cat = tag.category || "General";
        if (cat.toLowerCase() === "other" || cat.toLowerCase() === "general") cat = "Miscellaneous";
        if (cat === "Style") cat = "Style & Aesthetic";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(tag);
      });

      const categories = Object.keys(grouped).sort((a, b) => {
        if (a === "Style & Aesthetic") return -1;
        if (b === "Style & Aesthetic") return 1;
        return a.localeCompare(b);
      });

      const colLeftTags: [string, Tag[]][] = [];
      const colRightTags: [string, Tag[]][] = [];
      categories.forEach((cat, index) => {
        if (index % 2 === 0) {
          colLeftTags.push([cat, grouped[cat]]);
        } else {
          colRightTags.push([cat, grouped[cat]]);
        }
      });

      const getColHeight = (col: [string, Tag[]][]) => {
        let total = 0;
        col.forEach(([cat, items]) => {
          total += 40; 
          total += items.length * 45; 
          total += 20; 
        });
        return total;
      };

      const tagsHeight = Math.max(getColHeight(colLeftTags), getColHeight(colRightTags), 150) + 40;
      const totalHeight = headerHeight + imgSectionHeight + paletteSectionHeight + tagsHeight + 85;

      const canvas = document.createElement('canvas');
      canvas.width = cardWidth;
      canvas.height = totalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Draw Canvas Background (Elegant light warm theme)
      ctx.fillStyle = "#FAF9F6";
      ctx.fillRect(0, 0, cardWidth, totalHeight);

      // Draw inner border
      ctx.strokeStyle = "rgba(0, 0, 0, 0.05)";
      ctx.lineWidth = 1;
      ctx.strokeRect(15, 15, cardWidth - 30, totalHeight - 30);

      // 2. Draw Header
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      
      ctx.font = "bold 24px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#18181B";
      ctx.fillText("VISUAL PROMPT MEMO", cardWidth / 2, 50);

      const dateFormatted = format(parseISO(image.date), "yyyy.MM.dd");
      ctx.font = "13px 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";
      ctx.fillStyle = "#71717A";
      ctx.fillText(`SPECIFICATION SHEET • ${dateFormatted}`, cardWidth / 2, 85);

      ctx.strokeStyle = "rgba(24, 24, 27, 0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(80, 110);
      ctx.lineTo(cardWidth - 80, 110);
      ctx.stroke();

      // 3. Draw Original Image
      const imgX = (cardWidth - imgW) / 2;
      const imgY = headerHeight + 20;
      
      ctx.shadowColor = "rgba(0, 0, 0, 0.06)";
      ctx.shadowBlur = 15;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(imgX - 8, imgY - 8, imgW + 16, imgH + 16);
      
      ctx.strokeStyle = "rgba(0,0,0,0.03)";
      ctx.lineWidth = 1;
      ctx.strokeRect(imgX - 8, imgY - 8, imgW + 16, imgH + 16);
      
      ctx.shadowColor = "transparent"; 
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.drawImage(img, imgX, imgY, imgW, imgH);

      // 4. Draw Color Palette
      const paletteY = imgY + imgH + 40;
      
      ctx.textAlign = "left";
      ctx.font = "bold 13px 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";
      ctx.fillStyle = "#71717A";
      ctx.fillText("COLOR PALETTE / 配色色卡", 80, paletteY - 15);

      const blocksCount = palette.length;
      const blockW = 100;
      const blockH = 100;
      const gap = 16;
      const totalPaletteW = (blocksCount * blockW) + ((blocksCount - 1) * gap);
      const startX = (cardWidth - totalPaletteW) / 2;

      palette.forEach((hex, i) => {
        const bx = startX + i * (blockW + gap);
        const by = paletteY + 5;

        ctx.fillStyle = hex;
        ctx.fillRect(bx, by, blockW, blockH);
        
        ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, blockW, blockH);

        ctx.textAlign = "center";
        ctx.fillStyle = "#27272A";
        ctx.font = "13px 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";
        ctx.fillText(hex.toUpperCase(), bx + blockW / 2, by + blockH + 22);
      });

      const tagsY = paletteY + 160;
      ctx.strokeStyle = "rgba(24, 24, 27, 0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(80, tagsY - 10);
      ctx.lineTo(cardWidth - 80, tagsY - 10);
      ctx.stroke();

      // 5. Draw Tags
      ctx.textAlign = "left";
      ctx.font = "bold 13px 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";
      ctx.fillStyle = "#71717A";
      ctx.fillText("DESIGN PROPERTIES / 提取属性与释义", 80, tagsY + 15);

      const renderTagColumn = (colList: [string, Tag[]][], colX: number) => {
        let currentY = tagsY + 45;
        colList.forEach(([category, items]) => {
          ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
          ctx.fillStyle = "#8A5E38"; // 优雅复古棕色 (Elegant retro brown)
          ctx.fillText(category.toUpperCase(), colX, currentY);

          ctx.strokeStyle = "rgba(138, 94, 56, 0.2)"; // 对应复古棕的淡化下划线 (Semi-transparent brown underline)
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(colX, currentY + 6);
          ctx.lineTo(colX + 120, currentY + 6);
          ctx.stroke();

          currentY += 24;

          items.forEach(tag => {
            ctx.font = "bold 14px system-ui, -apple-system, sans-serif";
            ctx.fillStyle = "#18181B";
            ctx.fillText(tag.term, colX, currentY);
            
            if (tag.description) {
              ctx.font = "12px system-ui, -apple-system, sans-serif";
              ctx.fillStyle = "#71717A";
              ctx.fillText(tag.description, colX, currentY + 18);
              currentY += 38;
            } else {
              currentY += 26;
            }
          });

          currentY += 15; 
        });
      };

      renderTagColumn(colLeftTags, 80);
      renderTagColumn(colRightTags, cardWidth / 2 + 20);

      // 6. Draw Footer Statement
      const footerY = totalHeight - 50;
      ctx.strokeStyle = "rgba(24, 24, 27, 0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(100, footerY - 15);
      ctx.lineTo(cardWidth - 100, footerY - 15);
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.font = "12px 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";
      ctx.fillStyle = "#A1A1AA";
      ctx.fillText("Generated by Visual Prompt Clipboard", cardWidth / 2, footerY + 10);

      // Retrieve data URL and download image
      try {
        const dataUrl = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = dataUrl;
        link.setAttribute("download", `visual-card-${image.id || 'export'}.png`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.error("Canvas toDataURL failed:", err);
        alert("生成卡片图片失败。可能是由于浏览器的安全限制，请尝试刷新页面。");
      }
    };

    img.onerror = (e) => {
      console.error("Failed to load image for canvas export:", e);
      alert("无法加载原始图片用于生成卡片。");
    };
  };

  return (
    <div 
      className="relative group w-full p-2 -m-2"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowExportMenu(false);
      }}
    >
      {/* Export / Download Button */}
      <AnimatePresence>
        {isHovered && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={(e) => { 
              e.stopPropagation(); 
              setShowExportMenu(!showExportMenu); 
            }}
            className={`absolute top-0 z-50 text-blue-500 hover:text-blue-600 bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-900/40 rounded-full p-1.5 shadow-md hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-all cursor-pointer ${isExample ? 'right-0' : 'right-9'}`}
            title="导出数据"
          >
            <Download className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Export Dropdown Menu */}
      {showExportMenu && (
        <div 
          className={`absolute z-[50] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl p-1 flex flex-col gap-0.5 w-40 text-xs font-sans text-zinc-700 dark:text-zinc-300 ${isExample ? 'top-10 right-0' : 'top-10 right-9'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              handleExportMarkdown();
              setShowExportMenu(false);
            }}
            className="flex items-center gap-2 px-2.5 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded text-left transition-colors cursor-pointer w-full text-zinc-900 dark:text-zinc-100 font-medium"
          >
            <FileText className="w-3.5 h-3.5 text-blue-500" />
            <span>导出为 Markdown</span>
          </button>
          <button
            onClick={() => {
              handleExportCardImage();
              setShowExportMenu(false);
            }}
            className="flex items-center gap-2 px-2.5 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded text-left transition-colors cursor-pointer w-full text-zinc-900 dark:text-zinc-100 font-medium"
          >
            <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
            <span>导出设计卡片png</span>
          </button>
        </div>
      )}

      {/* Delete Image Button */}
      <AnimatePresence>
        {isHovered && !isExample && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={onDeleteImage}
            className="absolute top-0 right-0 z-50 bg-destructive text-destructive-foreground rounded-full p-1.5 shadow-md hover:bg-destructive/90"
          >
            <X className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>

      <div 
        className="polaroid relative w-full" 
        data-columns={columnCount}
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
        
        {/* Color Palette & Tags Area (slides down on hover except in 4-column layout, where it stays unexpanded and static) */}
        <div className={`grid transition-all duration-300 ease-out ${columnCount === 4 ? "grid-rows-[0fr]" : "grid-rows-[0fr] group-hover:grid-rows-[1fr]"}`}>
          <div className="overflow-hidden">
            {/* Color Palette below image */}
            {palette.length > 0 && (
              <div className={`pt-3 transition-opacity duration-300 ${columnCount === 4 ? "opacity-0 invisible" : "opacity-0 group-hover:opacity-100"}`}>
                <div className="flex w-full h-6 items-center bg-transparent rounded-lg overflow-hidden gap-0">
                  {palette.map((hex, i) => (
                    <PaletteColor key={i} hex={hex} columnCount={columnCount} />
                  ))}
                </div>
              </div>
            )}
            
            {/* Tags Display */}
            <div className={`pt-3 transition-opacity duration-300 ${columnCount === 4 ? "opacity-0 invisible" : "opacity-0 group-hover:opacity-100 delay-100"}`}>
              <TagsDisplay tags={image.tags} onDeleteTag={onDeleteTag} isExample={isExample} isDetailedMode={isDetailedMode} />
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
        className={`flex-1 ${columnCount === 2 ? "h-2" : "h-3"} hover:h-6 transition-all duration-200 cursor-pointer relative group/color flex items-center justify-center overflow-hidden`}
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

const TagsDisplay: React.FC<{ 
  tags: Tag[], 
  onDeleteTag: (id: number) => void, 
  isExample?: boolean,
  isDetailedMode?: boolean
}> = ({ tags, onDeleteTag, isExample, isDetailedMode }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  if (!tags || tags.length === 0) return null;

  const handleCopy = (e: React.MouseEvent, text: string, id: number) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Group tags by category
  const groupedTags: Record<string, Tag[]> = {};
  tags.forEach(tag => {
    let cat = tag.category || "General";
    // Sanitize category naming
    if (cat.toLowerCase() === "other" || cat.toLowerCase() === "general") cat = "Miscellaneous";
    if (cat === "Style") cat = "Style & Aesthetic";
    
    if (!groupedTags[cat]) groupedTags[cat] = [];
    groupedTags[cat].push(tag);
  });

  // Sort categories: Aesthetic first, then alphabetical
  const categories = Object.keys(groupedTags).sort((a, b) => {
    if (a === "Style & Aesthetic") return -1;
    if (b === "Style & Aesthetic") return 1;
    return a.localeCompare(b);
  });

  return (
    <div 
      className="flex flex-col gap-4"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {categories.map(category => (
        <div key={category} className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[9px] uppercase tracking-[0.15em] text-primary/50 font-black select-none pointer-events-none px-1.5 py-0.5 bg-primary/5 rounded border border-primary/10">
              {category}
            </span>
            <div className="h-[1px] flex-grow bg-primary/5" />
          </div>
            <div className="flex flex-wrap gap-2">
            {(isExpanded ? groupedTags[category] : groupedTags[category].slice(0, 2)).map(tag => (
              <div 
                key={tag.id} 
                className={`group/tag relative flex flex-col items-start bg-primary/10 text-primary-foreground text-xs font-semibold px-2.5 py-1.5 rounded-md border border-primary/20 cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors max-w-full ${isDetailedMode ? 'gap-0.5' : ''}`}
                onClick={(e) => handleCopy(e, tag.term, tag.id)}
              >
                <div className="flex items-center w-full justify-between">
                  <span className="text-primary group-hover/tag:text-primary-foreground transition-colors pr-3 break-words truncate">{tag.term}</span>
                  
                  <div className="pt-[1px]">
                    {copiedId === tag.id ? (
                      <Check className="w-3 h-3 flex-shrink-0" />
                    ) : (
                      <Copy className="w-3 h-3 opacity-0 group-hover/tag:opacity-100 transition-opacity flex-shrink-0" />
                    )}
                  </div>
                </div>

                {isDetailedMode && tag.description && (
                  <span className="text-[10px] text-zinc-500 group-hover/tag:text-primary-foreground/70 font-normal leading-tight">
                    {tag.description}
                  </span>
                )}

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
            {!isExpanded && groupedTags[category].length > 2 && (
              <div className="inline-flex items-center bg-secondary/50 text-secondary-foreground text-[10px] font-bold px-2 py-1.5 rounded-md border border-border">
                +{groupedTags[category].length - 2}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
