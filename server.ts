import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db } from "./src/db/index.js";
import { images, tags } from "./src/db/schema.js";
import { eq, desc, asc, and, gte, lte } from "drizzle-orm";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Setup multer for file uploads
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// Serve uploaded files
app.use("/uploads", express.static(uploadDir));

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Get images for a specific date range
app.get("/api/images", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = db.select().from(images).orderBy(asc(images.createdAt));
    
    // If we want to filter by date, we can add where clauses here
    // For simplicity, returning all images for now, or we can filter by date string
    const allImages = query.all();
    
    // Fetch tags for each image
    const imagesWithTags = allImages.map((img) => {
      const imageTags = db.select().from(tags).where(eq(tags.imageId, img.id)).all();
      return { ...img, tags: imageTags };
    });

    res.json(imagesWithTags);
  } catch (error) {
    console.error("Error fetching images:", error);
    res.status(500).json({ error: "Failed to fetch images" });
  }
});

// Upload image and save tags
app.post("/api/images", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    const { date, tags: tagsJson } = req.body; // ISO date string

    if (!file) {
      return res.status(400).json({ error: "No image provided" });
    }

    const imageUrl = `/uploads/${file.filename}`;
    
    let generatedTags: Record<string, string[]> = {};

    if (tagsJson) {
      try {
        const parsed = JSON.parse(tagsJson);
        // Handle both older array format and new categorized object format
        if (Array.isArray(parsed)) {
          generatedTags = { "General": parsed };
        } else {
          generatedTags = parsed;
        }
      } catch (e) {
        console.error("Failed to parse tags JSON:", e);
      }
    }

    // Save to DB
    const insertResult = db.insert(images).values({
      url: imageUrl,
      date: date || new Date().toISOString(),
    }).returning({ id: images.id }).get();

    const imageId = insertResult.id;

    // Save categorized tags
    console.log("Processing tags to save:", tagsJson);
    const tagEntries = Object.entries(generatedTags);
    if (tagEntries.length > 0) {
      const tagValues: any[] = [];
      tagEntries.forEach(([category, items]) => {
        if (Array.isArray(items)) {
          items.forEach(item => {
            if (typeof item === 'string') {
              tagValues.push({
                imageId,
                term: item,
                category,
              });
            } else if (item && typeof item === 'object') {
              // Handle items with term and description
              const tagItem = item as any;
              tagValues.push({
                imageId,
                term: tagItem.term || "",
                category,
                description: tagItem.description || null,
              });
            }
          });
        }
      });
      if (tagValues.length > 0) {
        db.insert(tags).values(tagValues).run();
      }
    }

    // Return the created image with tags
    const newImage = db.select().from(images).where(eq(images.id, imageId)).get();
    const newTags = db.select().from(tags).where(eq(tags.imageId, imageId)).all();

    res.json({ ...newImage, tags: newTags });
  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

// Delete a tag
app.delete("/api/tags/:id", async (req, res) => {
  try {
    const { id } = req.params;
    db.delete(tags).where(eq(tags.id, parseInt(id, 10))).run();
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting tag:", error);
    res.status(500).json({ error: "Failed to delete tag" });
  }
});

// Delete an image
app.delete("/api/images/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get image to delete file
    const image = db.select().from(images).where(eq(images.id, parseInt(id, 10))).get();
    if (image && image.url) {
      const filePath = path.join(__dirname, image.url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete tags first (foreign key constraint might handle this, but to be safe)
    db.delete(tags).where(eq(tags.imageId, parseInt(id, 10))).run();
    // Delete image
    db.delete(images).where(eq(images.id, parseInt(id, 10))).run();
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting image:", error);
    res.status(500).json({ error: "Failed to delete image" });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
