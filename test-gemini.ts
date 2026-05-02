import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";

async function test() {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // Create a dummy 1x1 pixel PNG base64
    const dummyBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              data: dummyBase64,
              mimeType: "image/png",
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

    console.log("Success:", response.text);
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}

test();
