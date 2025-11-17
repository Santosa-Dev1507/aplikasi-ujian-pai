import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini AI
// WARNING: In a production environment, never expose your API key directly in the frontend code.
// You should proxy this request through your own backend (e.g., Google Apps Script or a serverless function).
// For this demo, we use the env variable directly as requested by the instructions standard.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface GradingResult {
  score: number; // 0 to 100 scale relative to the question points
  feedback: string;
}

export async function gradeEssay(
  questionText: string,
  studentAnswer: string,
  rubric: string
): Promise<GradingResult> {
  if (!studentAnswer || studentAnswer.trim().length < 5) {
    return { score: 0, feedback: "Jawaban terlalu pendek atau kosong." };
  }

  try {
    const model = "gemini-2.5-flash";
    const prompt = `
      Anda adalah guru PAI (Pendidikan Agama Islam) kelas 9.
      Tugas anda adalah menilai jawaban siswa berdasarkan soal dan rubrik/kunci jawaban yang diberikan.

      Soal: "${questionText}"
      Rubrik/Kunci Jawaban: "${rubric}"
      Jawaban Siswa: "${studentAnswer}"

      Berikan penilaian objektif.
      Berikan skor antara 0 sampai 100 (dimana 0 salah total, 100 sempurna sesuai rubrik).
      Berikan feedback singkat dan membangun dalam Bahasa Indonesia (maksimal 2 kalimat).
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER, description: "Score from 0 to 100" },
            feedback: { type: Type.STRING, description: "Short constructive feedback" },
          },
          required: ["score", "feedback"],
        },
      },
    });

    const result = JSON.parse(response.text);
    return {
        score: result.score,
        feedback: result.feedback
    };

  } catch (error) {
    console.error("AI Grading Error:", error);
    // Fallback if AI fails
    return {
      score: 0,
      feedback: "Maaf, terjadi kesalahan saat penilaian otomatis. Guru akan menilai manual.",
    };
  }
}