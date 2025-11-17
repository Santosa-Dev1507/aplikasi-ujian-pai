import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Question, ExamState, StudentData, QuestionType, JodohkanQuestion, PGQuestion, PGKompleksQuestion, UraianQuestion } from './types';
import { useExamSecurity } from './hooks/useExamSecurity';
import { QuestionRenderer } from './components/QuestionRenderers';
import { gradeEssay, GradingResult } from './services/geminiService';

// --- Constants moved here ---
const EXAM_DURATION_SECONDS = 60 * 45; // 45 minutes
const MAX_VIOLATIONS = 3;
// ===================================================================================
// PENTING: Ganti placeholder di bawah ini dengan URL Web App dari Google Apps Script Anda!
// ===================================================================================
const APPS_SCRIPT_BACKEND_URL = 'https://script.google.com/macros/s/AKfycbxeQ2ns_Zi0FZOi7A5GBVu-DjdVsQzgFRRVEmnbMMQuNOogg-LhySkN58_ZqDOxe_-poQ/exec';


function App() {
  // --- State ---
  const [questions, setQuestions] = useState<Question[]>([]);
  const [student, setStudent] = useState<StudentData>({ name: '', class: '', nisn: '' });
  const [examState, setExamState] = useState<ExamState>({
    status: 'idle',
    currentQuestionIndex: 0,
    answers: {},
    timeLeftSeconds: EXAM_DURATION_SECONDS,
    violationCount: 0,
    score: 0,
    aiFeedback: {},
  });

  const [dataFetchState, setDataFetchState] = useState<'loading' | 'success' | 'error'>('loading');
  const [violationMessage, setViolationMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Data Fetching ---
  useEffect(() => {
    if (APPS_SCRIPT_BACKEND_URL.includes('MASUKKAN_URL_WEB_APP_ANDA_DISINI')) {
        console.error("Backend URL is not configured. Cannot fetch questions.");
        setDataFetchState('error');
        return;
    }
    
    const fetchQuestions = async () => {
      try {
        const response = await fetch(APPS_SCRIPT_BACKEND_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data: Question[] = await response.json();
        
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error("No questions found or data is not in correct format.");
        }

        setQuestions(data);
        setDataFetchState('success');
      } catch (error) {
        console.error("Failed to fetch questions:", error);
        setDataFetchState('error');
      }
    };
    fetchQuestions();
  }, []);
  

  // --- Security Hook ---
  const handleViolation = useCallback((reason: string) => {
    setExamState(prev => {
      const newCount = prev.violationCount + 1;
      setViolationMessage(`${reason}. Peringatan ${newCount}/${MAX_VIOLATIONS}`);

      if (newCount >= MAX_VIOLATIONS) {
        return { ...prev, status: 'pending_violation' };
      }
      return { ...prev, violationCount: newCount };
    });
  }, []);

  const { enterFullscreen } = useExamSecurity({
    isActive: examState.status === 'active',
    onViolation: handleViolation
  });

  // --- Timer Logic ---
  useEffect(() => {
    if (examState.status === 'active') {
      timerRef.current = setInterval(() => {
        setExamState(prev => {
          if (prev.timeLeftSeconds <= 1) {
             if (timerRef.current) clearInterval(timerRef.current);
             return { ...prev, status: 'pending_finish', timeLeftSeconds: 0 };
          }
          return { ...prev, timeLeftSeconds: prev.timeLeftSeconds - 1 };
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [examState.status]);

  // --- Backend Service ---
  const saveExamResult = useCallback(async (finalScore: number, aiResults: Record<string, GradingResult>, currentAnswers: Record<string, any>) => {
    if (APPS_SCRIPT_BACKEND_URL.includes('MASUKKAN_URL_WEB_APP_ANDA_DISINI')) {
        console.warn("Backend URL not configured. Skipping data save.");
        return;
    }

    try {
      const payload = {
        student: student,
        score: finalScore,
        answers: currentAnswers,
        aiFeedback: aiResults
      };
      await fetch(APPS_SCRIPT_BACKEND_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("Failed to save exam result to backend:", error);
    }
  }, [student]);

  // --- Grading Logic ---
  useEffect(() => {
    const calculateScoreAndFinalize = async (targetStatus: 'finished' | 'violation') => {
      if (timerRef.current) clearInterval(timerRef.current);
      setExamState(prev => ({ ...prev, status: 'grading' }));
      
      try {
          let totalScore = 0;
          let maxPossibleScore = 0;
          const aiResults: Record<string, GradingResult> = {};
          const currentAnswers = examState.answers;

          for (const q of questions) {
            maxPossibleScore += q.points;
            const studentAns = currentAnswers[q.id];

            if (!studentAns) continue;

            switch (q.type) {
              case QuestionType.PG: {
                if (studentAns === (q as PGQuestion).correctOptionId) {
                  totalScore += q.points;
                }
                break;
              }
              case QuestionType.PG_KOMPLEKS: {
                const qPgk = q as PGKompleksQuestion;
                const isCorrect =
                  Array.isArray(studentAns) &&
                  studentAns.length === qPgk.correctOptionIds.length &&
                  studentAns.every((id: string) => qPgk.correctOptionIds.includes(id));
                if (isCorrect) totalScore += q.points;
                break;
              }
              case QuestionType.JODOHKAN: {
                  const qJod = q as JodohkanQuestion;
                  const studentPairs = studentAns as {leftId: string, rightId: string}[];
                  let correctPairsCount = 0;
                  if (Array.isArray(studentPairs)) {
                    studentPairs.forEach(sp => {
                        if (qJod.correctPairs.some(cp => cp.leftId === sp.leftId && cp.rightId === sp.rightId)) {
                            correctPairsCount++;
                        }
                    });
                  }
                  const pairScore = (correctPairsCount / qJod.correctPairs.length) * q.points;
                  totalScore += pairScore;
                  break;
              }
              case QuestionType.URAIAN: {
                const grading = await gradeEssay(q.text, studentAns, (q as UraianQuestion).rubric);
                const actualPoints = (grading.score / 100) * q.points;
                totalScore += actualPoints;
                aiResults[q.id] = grading;
                break;
              }
            }
          }

          const normalizedScore = Math.round((totalScore / maxPossibleScore) * 100) || 0;
          await saveExamResult(normalizedScore, aiResults, currentAnswers);

          setExamState(prev => ({
            ...prev,
            status: targetStatus,
            score: normalizedScore,
            aiFeedback: aiResults
          }));
      } catch (error) {
          console.error("Critical error during grading:", error);
          setExamState(prev => ({
              ...prev,
              status: targetStatus,
              score: 0,
              aiFeedback: {} 
          }));
      }
    };

    if (examState.status === 'pending_finish') {
        calculateScoreAndFinalize('finished');
    } else if (examState.status === 'pending_violation') {
        calculateScoreAndFinalize('violation');
    }
  }, [examState.status, examState.answers, questions, saveExamResult]);

  const startExam = () => {
    if (!student.name || !student.class || !student.nisn) {
      alert("Mohon lengkapi semua data diri.");
      return;
    }
    enterFullscreen();
    setExamState(prev => ({ ...prev, status: 'active' }));
  };

  const finishExam = () => {
    if (window.confirm("Apakah anda yakin ingin menyelesaikan ujian?")) {
      setExamState(prev => ({ ...prev, status: 'pending_finish' }));
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // --- Renders ---

  // 0. LOADING / ERROR SCREEN for fetching questions
  if (dataFetchState === 'loading') {
     return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600"></div><p className="ml-4 text-gray-700">Memuat Soal...</p></div>;
  }
   if (dataFetchState === 'error') {
     return <div className="min-h-screen flex items-center justify-center p-4 text-center"><div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg"><h2 className="font-bold">Gagal Memuat Soal</h2><p>Tidak dapat terhubung ke server soal. Pastikan URL Backend di `App.tsx` sudah benar dan coba muat ulang halaman.</p></div></div>;
  }

  // 1. INTRO SCREEN
  if (examState.status === 'idle') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-blue-50">
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-xl max-w-md w-full">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-blue-900">Ujian PAI Kelas 9</h1>
            <p className="text-gray-600 mt-2">Penilaian Akhir Semester</p>
          </div>
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nama Lengkap</label>
              <input type="text" className="mt-1 block w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" value={student.name} onChange={e => setStudent({ ...student, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Kelas</label>
              <select className="mt-1 block w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" value={student.class} onChange={e => setStudent({ ...student, class: e.target.value })} >
                <option value="">Pilih Kelas</option>
                <option value="9A">9A</option>
                <option value="9B">9B</option>
                <option value="9C">9C</option>
                <option value="9D">9D</option>
                <option value="9E">9E</option>
                <option value="9F">9F</option>
                <option value="9G">9G</option>
                <option value="9H">9H</option>
              </select>
            </div>
             <div>
              <label className="block text-sm font-medium text-gray-700">NISN</label>
              <input type="text" inputMode="numeric" className="mt-1 block w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" value={student.nisn} onChange={e => setStudent({ ...student, nisn: e.target.value })} />
            </div>
          </div>
          <div className="flex rounded-lg mb-6 overflow-hidden bg-amber-50 text-amber-800">
            <div className="w-2.5 bg-amber-400 flex-shrink-0"></div>
            <div className="p-4 text-sm">
                <h3 className="font-bold mb-1 text-amber-900">Peraturan Ujian:</h3>
                <ul className="list-disc list-inside space-y-1">
                <li>Waktu pengerjaan: {EXAM_DURATION_SECONDS / 60} Menit.</li>
                <li>Jumlah Soal: 15 butir.</li>
                <li>Dilarang pindah tab atau keluar aplikasi.</li>
                <li>Pelanggaran {MAX_VIOLATIONS}x akan otomatis menghentikan ujian.</li>
                </ul>
            </div>
          </div>
          <button onClick={startExam} className="w-full bg-blue-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-lg"> Mulai Ujian </button>
        </div>
      </div>
    );
  }

  // 2. GRADING / LOADING SCREEN
  if (examState.status === 'grading' || examState.status === 'pending_finish' || examState.status === 'pending_violation') {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
              <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600 mb-4"></div>
              <h2 className="text-xl font-semibold text-gray-700">Memproses Jawaban...</h2>
              <p className="text-gray-500 mt-2 text-center">
                  {questions.some(q => q.type === QuestionType.URAIAN) 
                    ? "AI sedang memeriksa jawaban uraian anda. Mohon tunggu." 
                    : "Menghitung nilai akhir."}
                  <br/>
                  <span className="text-sm opacity-75">(Menyimpan data ke server...)</span>
              </p>
          </div>
      );
  }

  // 3. FINISHED / VIOLATION SCREEN
  if (examState.status === 'finished' || examState.status === 'violation') {
    return (
      <div className="min-h-screen bg-gray-100 p-4 md:p-8">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className={`p-6 text-white text-center ${examState.status === 'violation' ? 'bg-red-600' : 'bg-green-600'}`}>
            <h1 className="text-3xl font-bold mb-2">{examState.status === 'violation' ? 'Ujian Dihentikan!' : 'Ujian Selesai'}</h1>
            <p className="opacity-90">{examState.status === 'violation' ? 'Anda melebihi batas pelanggaran keamanan.' : 'Data ujian anda telah berhasil disimpan.'}</p>
          </div>
          <div className="p-6 md:p-8 space-y-6">
            <div className="text-center">
               <p className="text-gray-600 mb-1">Nilai Akhir Anda</p>
               <div className="text-6xl font-extrabold text-blue-900">{examState.score}</div>
               <p className="text-sm text-gray-500 mt-2">Dari skala 100</p>
            </div>
            <div className="border-t pt-6">
              <h3 className="font-bold text-lg mb-4 text-gray-800">Detail Umpan Balik AI (Soal Uraian)</h3>
              {Object.entries(examState.aiFeedback).length === 0 ? (<p className="text-gray-500 italic">Tidak ada soal uraian atau AI belum menilai.</p>) : (
                <div className="space-y-4">
                  {Object.entries(examState.aiFeedback).map(([qId, result]) => {
                    const question = questions.find(q => q.id === qId);
                    // FIX: Cast `result` to `GradingResult` to safely access its properties, as `Object.entries` infers the value as type `unknown`.
                    const typedResult = result as GradingResult;
                    return (
                      <div key={qId} className="bg-gray-50 p-4 rounded-lg border">
                        <p className="font-medium text-gray-900 mb-2">{question?.text}</p>
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">Jawaban Anda:</span>
                            <span className="font-semibold text-blue-700">Skor AI: {typedResult.score}/100</span>
                        </div>
                        <p className="text-gray-800 italic bg-white p-2 rounded border mb-2 break-words">"{examState.answers[qId] || '-'}"</p>
                         <p className="text-sm text-green-700"><strong>Feedback Guru (AI):</strong> {typedResult.feedback}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <button onClick={() => window.location.reload()} className="w-full bg-gray-800 text-white py-3 rounded-xl font-semibold hover:bg-gray-900"> Kembali ke Halaman Utama </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. ACTIVE EXAM SCREEN
  const currentQuestion = questions[examState.currentQuestionIndex];
  const isLastQuestion = examState.currentQuestionIndex === questions.length - 1;

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {violationMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full text-center animate-bounce-in">
             <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
             </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Pelanggaran Terdeteksi!</h3>
            <p className="text-gray-600 mb-4">{violationMessage}</p>
            <button onClick={() => { setViolationMessage(null); enterFullscreen(); }} className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 w-full"> Saya Mengerti </button>
          </div>
        </div>
      )}
      <header className="bg-white shadow-sm p-4 sticky top-0 z-10 flex justify-between items-center">
        <div>
           <h2 className="font-bold text-gray-800 truncate max-w-[150px] md:max-w-none">{student.name}</h2>
           <p className="text-xs text-gray-500">{student.class} - {student.nisn}</p>
        </div>
        <div className={`font-mono text-xl font-bold ${examState.timeLeftSeconds < 300 ? 'text-red-600 animate-pulse' : 'text-blue-600'}`}>{formatTime(examState.timeLeftSeconds)}</div>
      </header>
      <main className="flex-1 container mx-auto p-4 md:p-6 max-w-4xl">
        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-6">
          <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${((examState.currentQuestionIndex + 1) / questions.length) * 100}%` }}></div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 mb-20">
          <div className="mb-6">
            <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full mb-2 font-semibold">
               Soal {examState.currentQuestionIndex + 1} / {questions.length} &bull; {currentQuestion.type.replace('_', ' ')}
            </span>
            <h3 className="text-lg md:text-xl font-medium text-gray-900 leading-relaxed">{currentQuestion.text}</h3>
          </div>
          <QuestionRenderer question={currentQuestion} answer={examState.answers[currentQuestion.id]} onAnswerChange={(newAnswer) => { setExamState(prev => ({...prev, answers: { ...prev.answers, [currentQuestion.id]: newAnswer }})); }}/>
        </div>
      </main>
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 z-20">
         <div className="container mx-auto max-w-4xl flex justify-between gap-4">
            <button onClick={() => setExamState(prev => ({ ...prev, currentQuestionIndex: Math.max(0, prev.currentQuestionIndex - 1) }))} disabled={examState.currentQuestionIndex === 0} className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium disabled:opacity-50 flex-1 md:flex-none md:w-32">&larr; Sebelumnya</button>
            {isLastQuestion ? (
              <button onClick={finishExam} className="px-6 py-2.5 rounded-lg bg-green-600 text-white font-bold hover:bg-green-700 transition-colors shadow-md flex-1 md:flex-none md:w-48">Selesaikan & Kumpulkan</button>
            ) : (
               <button onClick={() => setExamState(prev => ({ ...prev, currentQuestionIndex: Math.min(questions.length - 1, prev.currentQuestionIndex + 1) }))} className="px-4 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 flex-1 md:flex-none md:w-32">Selanjutnya &rarr;</button>
            )}
         </div>
      </footer>
    </div>
  );
}

export default App;
