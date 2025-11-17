import React from 'react';
import { Question, QuestionType, PGQuestion, PGKompleksQuestion, JodohkanQuestion, UraianQuestion } from '../types';

interface BaseProps {
  question: Question;
  answer: any;
  onAnswerChange: (val: any) => void;
}

// --- Multiple Choice (PG) ---
export const PGRenderer: React.FC<BaseProps> = ({ question, answer, onAnswerChange }) => {
  const q = question as PGQuestion;
  return (
    <div className="space-y-3">
      {q.options.map((option) => (
        <label
          key={option.id}
          className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
            answer === option.id
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-blue-300'
          }`}
        >
          <input
            type="radio"
            name={q.id}
            value={option.id}
            checked={answer === option.id}
            onChange={() => onAnswerChange(option.id)}
            className="h-5 w-5 text-blue-600 focus:ring-blue-500"
          />
          <span className="ml-3 text-gray-800">{option.text}</span>
        </label>
      ))}
    </div>
  );
};

// --- Complex Multiple Choice (PG Kompleks) ---
export const PGKompleksRenderer: React.FC<BaseProps> = ({ question, answer, onAnswerChange }) => {
  const q = question as PGKompleksQuestion;
  const currentAnswers: string[] = answer || [];

  const toggleOption = (optionId: string) => {
    if (currentAnswers.includes(optionId)) {
      onAnswerChange(currentAnswers.filter(id => id !== optionId));
    } else {
      onAnswerChange([...currentAnswers, optionId]);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 italic mb-2">Pilih lebih dari satu jawaban</p>
      {q.options.map((option) => (
        <label
          key={option.id}
          className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
            currentAnswers.includes(option.id)
              ? 'border-indigo-500 bg-indigo-50'
              : 'border-gray-200 hover:border-indigo-300'
          }`}
        >
          <input
            type="checkbox"
            checked={currentAnswers.includes(option.id)}
            onChange={() => toggleOption(option.id)}
            className="h-5 w-5 text-indigo-600 rounded focus:ring-indigo-500"
          />
          <span className="ml-3 text-gray-800">{option.text}</span>
        </label>
      ))}
    </div>
  );
};

// --- Essay (Uraian) ---
export const UraianRenderer: React.FC<BaseProps> = ({ answer, onAnswerChange }) => {
  return (
    <div className="space-y-2">
      <textarea
        className="w-full h-48 p-4 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none bg-gray-50 text-gray-800 placeholder-gray-500"
        placeholder="Ketik jawaban anda disini..."
        value={answer || ''}
        onChange={(e) => onAnswerChange(e.target.value)}
      ></textarea>
      <p className="text-sm text-gray-500 text-right">
        {(answer || '').length} karakter
      </p>
    </div>
  );
};

// --- Matching (Jodohkan) - Mobile Friendly Click-to-Pair ---
export const JodohkanRenderer: React.FC<BaseProps> = ({ question, answer, onAnswerChange }) => {
  const q = question as JodohkanQuestion;
  // Answer format: [{ leftId: 'l1', rightId: 'r2' }, ...]
  const pairs: { leftId: string; rightId: string }[] = answer || [];
  const [selectedLeft, setSelectedLeft] = React.useState<string | null>(null);

  const isLeftPaired = (id: string) => pairs.some(p => p.leftId === id);
  const isRightPaired = (id: string) => pairs.some(p => p.rightId === id);

  const getPairColor = (id: string, side: 'left' | 'right') => {
    const pairIndex = pairs.findIndex(p => side === 'left' ? p.leftId === id : p.rightId === id);
    if (pairIndex === -1) return '';
    // Generate consistent pastel colors based on pair index
    const colors = ['bg-red-100 border-red-300', 'bg-green-100 border-green-300', 'bg-yellow-100 border-yellow-300', 'bg-purple-100 border-purple-300'];
    return colors[pairIndex % colors.length];
  };

  const handleLeftClick = (id: string) => {
    // If already paired, remove pair first
    if (isLeftPaired(id)) {
      onAnswerChange(pairs.filter(p => p.leftId !== id));
    }
    setSelectedLeft(id);
  };

  const handleRightClick = (id: string) => {
    if (selectedLeft) {
        // Remove any existing pair for this right item if it exists
        const newPairs = pairs.filter(p => p.rightId !== id && p.leftId !== selectedLeft);
        onAnswerChange([...newPairs, { leftId: selectedLeft, rightId: id }]);
        setSelectedLeft(null);
    } else if (isRightPaired(id)) {
        // Just unpair if clicked without selection
         onAnswerChange(pairs.filter(p => p.rightId !== id));
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 italic">Ketuk item di kiri, lalu ketuk pasangannya di kanan.</p>
      <div className="grid grid-cols-2 gap-4 md:gap-8">
        {/* Left Column */}
        <div className="space-y-3">
          <h4 className="font-semibold text-center text-gray-700 mb-2">Pernyataan</h4>
          {q.leftItems.map(item => (
            <button
              key={item.id}
              onClick={() => handleLeftClick(item.id)}
              className={`w-full p-3 text-sm md:text-base text-left rounded-lg border-2 transition-all
                ${selectedLeft === item.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'}
                ${getPairColor(item.id, 'left')}
              `}
            >
              {item.text}
            </button>
          ))}
        </div>

        {/* Right Column */}
        <div className="space-y-3">
          <h4 className="font-semibold text-center text-gray-700 mb-2">Jawaban</h4>
           {q.rightItems.map(item => (
            <button
              key={item.id}
              onClick={() => handleRightClick(item.id)}
              disabled={!selectedLeft && !isRightPaired(item.id)}
              className={`w-full p-3 text-sm md:text-base text-left rounded-lg border-2 transition-all
                 ${!selectedLeft && !isRightPaired(item.id) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-blue-300'}
                 ${getPairColor(item.id, 'right')}
              `}
            >
               {item.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export const QuestionRenderer: React.FC<BaseProps> = (props) => {
  switch (props.question.type) {
    case QuestionType.PG:
      return <PGRenderer {...props} />;
    case QuestionType.PG_KOMPLEKS:
      return <PGKompleksRenderer {...props} />;
    case QuestionType.JODOHKAN:
      return <JodohkanRenderer {...props} />;
    case QuestionType.URAIAN:
      return <UraianRenderer {...props} />;
    default:
      return <p className="text-red-500">Tipe soal tidak didukung.</p>;
  }
};