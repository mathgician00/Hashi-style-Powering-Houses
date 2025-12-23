import React, { useEffect, useRef, useState } from 'react';
import { createGame, gameInstance } from './game/phaserGame';
import { GameScene } from './game/scenes/GameScene';
import { Difficulty, GameEvent } from './types';
import { RotateCcw, Flag, Play, HelpCircle, Trophy, Undo, SkipForward, AlertTriangle, Clock, Gauge, X } from 'lucide-react';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'VICTORY' | 'FINISHED'>('START');
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.EASY);
  
  // Session Settings
  const [sessionMinutes, setSessionMinutes] = useState<number>(5);
  const [timeLeft, setTimeLeft] = useState(0);
  
  // UI State
  const [showRules, setShowRules] = useState(true);
  const [showReportPopup, setShowReportPopup] = useState(false);
  const [showDiffSelector, setShowDiffSelector] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  
  // Session Stats
  const [stats, setStats] = useState({
    [Difficulty.EASY]: 0,
    [Difficulty.MEDIUM]: 0,
    [Difficulty.HARD]: 0,
  });

  const timerIntervalRef = useRef<number | null>(null);
  
  // Ref to hold latest state for the Phaser event callback (avoids stale closures)
  const stateRef = useRef({ difficulty, timeLeft, gameState });

  // Sync state to ref
  useEffect(() => {
    stateRef.current = { difficulty, timeLeft, gameState };
  }, [difficulty, timeLeft, gameState]);

  // Initialize Game
  useEffect(() => {
    const game = createGame('game-container');
    
    // Bridge Events
    game.events.on('ready', () => {
       const runningScene = game.scene.keys['GameScene'] as GameScene;
       runningScene.onEvent = handleGameEvent;
    });

    return () => {
      game.destroy(true);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // Timer Logic: Pause if any modal is open or game is not playing
  useEffect(() => {
    const isPaused = showRules || showReportPopup || showDiffSelector || gameState !== 'PLAYING';

    if (!isPaused && timeLeft > 0) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      
      timerIntervalRef.current = window.setInterval(() => {
        setTimeLeft(prev => Math.max(0, prev - 1));
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [gameState, showRules, showReportPopup, showDiffSelector]); 

  // Check for Session End
  useEffect(() => {
    if (timeLeft === 0 && gameState === 'PLAYING') {
      setGameState('FINISHED');
    }
  }, [timeLeft, gameState]);

  const handleGameEvent = (event: GameEvent) => {
    if (event.type === 'PUZZLE_SOLVED') {
      const { difficulty: currentDifficulty } = stateRef.current;
      
      setGameState('VICTORY');
      setStats(prev => ({
        ...prev,
        [currentDifficulty]: prev[currentDifficulty] + 1
      }));
    } else if (event.type === 'HISTORY_UPDATE') {
      setCanUndo(event.payload.canUndo);
    }
  };

  const handleStartSession = () => {
    setStats({ [Difficulty.EASY]: 0, [Difficulty.MEDIUM]: 0, [Difficulty.HARD]: 0 });
    setTimeLeft(sessionMinutes * 60);
    setGameState('PLAYING');
    setShowRules(false);
    
    // Start the first puzzle
    launchPuzzle(difficulty);
  };

  const launchPuzzle = (diff: Difficulty) => {
    const scene = gameInstance?.scene.getScene('GameScene') as GameScene;
    if (scene) {
      scene.events.emit('START_GAME', diff);
    }
  };

  const handleNextPuzzle = () => {
    setGameState('PLAYING');
    launchPuzzle(difficulty);
  };

  const handleRestart = () => {
    if (gameState !== 'PLAYING') return;
    const scene = gameInstance?.scene.getScene('GameScene') as GameScene;
    if (scene) {
      scene.events.emit('RESET_PUZZLE');
    }
  };

  const handleSkip = () => {
    if (gameState !== 'PLAYING') return;
    launchPuzzle(difficulty);
  };

  const handleUndo = () => {
    if (gameState !== 'PLAYING') return;
    const scene = gameInstance?.scene.getScene('GameScene') as GameScene;
    if (scene) {
      scene.events.emit('UNDO');
    }
  };

  const handleChangeDifficulty = (newDiff: Difficulty) => {
    setDifficulty(newDiff);
    setShowDiffSelector(false);
    launchPuzzle(newDiff);
  };

  const handleReportClick = () => {
    if (gameState === 'PLAYING') {
      setShowReportPopup(true);
    }
  };

  const confirmReport = () => {
    const scene = gameInstance?.scene.getScene('GameScene') as GameScene;
    if (scene) {
      scene.events.emit('REPORT_UNSOLVABLE');
    }
    handleSkip();
    setShowReportPopup(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getDiffButtonClass = (d: Difficulty) => {
    const isSelected = difficulty === d;
    const base = "py-2 rounded capitalize font-bold transition border-2";
    
    if (!isSelected) return `${base} bg-slate-700 border-transparent text-slate-400 hover:bg-slate-600`;
    
    switch (d) {
        case Difficulty.EASY: return `${base} bg-green-600 border-green-400 text-white`;
        case Difficulty.MEDIUM: return `${base} bg-yellow-600 border-yellow-400 text-white`;
        case Difficulty.HARD: return `${base} bg-red-600 border-red-400 text-white`;
        default: return base;
    }
  };

  const getStartButtonClass = () => {
    const base = "w-full py-4 mt-4 rounded font-bold text-lg shadow-lg border-b-4 active:border-b-0 active:translate-y-1 transition text-white";
    switch (difficulty) {
      case Difficulty.EASY: return `${base} bg-green-600 hover:bg-green-500 border-green-800`;
      case Difficulty.MEDIUM: return `${base} bg-yellow-600 hover:bg-yellow-500 border-yellow-800`;
      case Difficulty.HARD: return `${base} bg-red-600 hover:bg-red-500 border-red-800`;
      default: return `${base} bg-blue-600 hover:bg-blue-500 border-blue-800`;
    }
  };

  const totalSolved = stats[Difficulty.EASY] + stats[Difficulty.MEDIUM] + stats[Difficulty.HARD];

  return (
    <div className="relative w-full h-screen bg-slate-900 flex justify-center items-center overflow-hidden p-2">
      {/* Game Container - Scalable 4:3 Box */}
      <div 
        id="game-container" 
        className="relative w-full h-full max-w-[100vw] max-h-full aspect-[4/3] rounded-lg shadow-2xl border-4 border-slate-700 bg-slate-800"
      >
        {/* HUD Overlay - Positioned Inside Container */}
        <div className="absolute inset-0 p-4 pointer-events-none z-10 flex flex-col justify-between">
          
          {/* TOP BAR */}
          <div className="flex justify-between items-start w-full">
            {/* Top Left: Stats */}
            <div className="bg-slate-800/95 text-white p-3 rounded shadow-lg pointer-events-auto backdrop-blur-sm border border-slate-700 min-w-[140px]">
              <h3 className="font-bold text-yellow-400 mb-2 flex items-center gap-2 border-b border-slate-600 pb-1">
                <Trophy size={16} /> Solved: {totalSolved}
              </h3>
              <div className="text-sm font-mono space-y-1">
                <div className="flex justify-between text-green-400"><span>Easy:</span> <span>{stats[Difficulty.EASY]}</span></div>
                <div className="flex justify-between text-yellow-400"><span>Medium:</span> <span>{stats[Difficulty.MEDIUM]}</span></div>
                <div className="flex justify-between text-red-400"><span>Hard:</span> <span>{stats[Difficulty.HARD]}</span></div>
              </div>
            </div>

            {/* Top Center: Timer */}
            <div className={`bg-slate-800/90 text-white px-6 py-2 rounded-full shadow-lg font-mono text-xl font-bold border-2 backdrop-blur-sm transition-colors ${timeLeft < 30 ? 'border-red-500 text-red-400 animate-pulse' : 'border-slate-600'}`}>
              {formatTime(timeLeft)}
            </div>

            {/* Top Right: Controls */}
            <div className="bg-slate-800/90 p-2 rounded shadow-lg pointer-events-auto flex gap-2 backdrop-blur-sm items-start border border-slate-700">
              <button 
                onClick={() => setShowRules(true)}
                className="bg-blue-600 text-white rounded hover:bg-blue-500 transition w-[44px] flex items-center justify-center h-[96px]" 
                title="Rules"
              >
                <HelpCircle size={24} />
              </button>
              
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                    <button 
                      onClick={handleUndo}
                      disabled={!canUndo || gameState !== 'PLAYING'}
                      className="bg-slate-600 text-white rounded hover:bg-slate-500 transition disabled:opacity-50 disabled:cursor-not-allowed h-[44px] w-[44px] flex items-center justify-center" 
                      title="Undo">
                      <Undo size={20} />
                    </button>
                    <button 
                      onClick={() => setShowDiffSelector(true)}
                      disabled={gameState !== 'PLAYING'}
                      className="bg-purple-600 text-white rounded hover:bg-purple-500 transition disabled:opacity-50 disabled:cursor-not-allowed h-[44px] w-[44px] flex items-center justify-center" 
                      title="Change Difficulty">
                      <Gauge size={20} />
                    </button>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={handleRestart}
                        disabled={gameState !== 'PLAYING'}
                        className="bg-orange-600 text-white rounded hover:bg-orange-500 transition disabled:opacity-50 disabled:cursor-not-allowed h-[44px] w-[44px] flex items-center justify-center" 
                        title="Reset Connections">
                        <RotateCcw size={20} />
                      </button>
                    <button 
                      onClick={handleSkip}
                      disabled={gameState !== 'PLAYING'}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white rounded transition disabled:opacity-50 disabled:cursor-not-allowed h-[44px] w-[44px] flex items-center justify-center"
                      title="Skip Puzzle"
                    >
                      <SkipForward size={20} />
                    </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Right: Report */}
          <div className="flex justify-end w-full pointer-events-auto">
             <button 
               onClick={handleReportClick}
               disabled={gameState !== 'PLAYING'}
               className="bg-red-900/80 text-red-200 p-3 rounded-full hover:bg-red-700 transition flex items-center gap-2 border border-red-700 disabled:opacity-0"
               title="Report Unsolvable"
             >
               <Flag size={24} />
             </button>
          </div>
        </div>
      </div>

      {/* --- MODALS --- */}

      {/* Change Difficulty Modal */}
      {showDiffSelector && (
         <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-[60] backdrop-blur-sm">
           <div className="bg-slate-800 text-white p-6 rounded-lg shadow-2xl border border-purple-500">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-purple-400">Change Difficulty</h3>
                <button onClick={() => setShowDiffSelector(false)} className="hover:text-red-400"><X size={20}/></button>
              </div>
              <div className="grid grid-cols-1 gap-3 w-64">
                {[Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD].map(d => (
                  <button
                    key={d}
                    onClick={() => handleChangeDifficulty(d)}
                    className={getDiffButtonClass(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-4 text-center">Note: Current puzzle will be skipped.</p>
           </div>
         </div>
      )}
      
      {/* Report Popup */}
      {showReportPopup && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-[60] backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-800 text-white p-6 rounded-lg max-w-sm w-full shadow-2xl border-2 border-red-500 text-center">
            <AlertTriangle className="mx-auto text-red-500 mb-4" size={48} />
            <h2 className="text-xl font-bold mb-2">Report Puzzle</h2>
            <p className="text-slate-300 mb-6">
              This puzzle will be inspected for errors. You will be moved to a new puzzle.
            </p>
            <div className="flex gap-4 justify-center">
              <button 
                onClick={() => setShowReportPopup(false)}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded font-bold"
              >
                Cancel
              </button>
              <button 
                onClick={confirmReport}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded font-bold"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start / Rules Modal */}
      {(gameState === 'START' || showRules) && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-md">
          <div className="bg-slate-800 text-white p-8 rounded-lg max-w-lg w-full shadow-2xl border border-slate-600">
            <h1 className="text-4xl font-bold text-yellow-400 mb-2 text-center tracking-tight">POWER GRID</h1>
            <h2 className="text-xl text-slate-400 mb-6 text-center font-mono">HASHI PUZZLE</h2>
            
            {gameState === 'START' ? (
              <div className="space-y-6">
                
                {/* Time Selection */}
                <div>
                   <label className="block text-slate-300 text-sm font-bold mb-2 flex items-center gap-2">
                     <Clock size={16} /> Session Duration
                   </label>
                   <div className="grid grid-cols-4 gap-2">
                     {[3, 5, 10, 20].map(m => (
                       <button
                         key={m}
                         onClick={() => setSessionMinutes(m)}
                         className={`py-2 rounded font-mono font-bold transition border-2 ${sessionMinutes === m ? 'bg-yellow-500 border-yellow-600 text-slate-900' : 'bg-slate-700 border-transparent text-slate-400 hover:bg-slate-600'}`}
                       >
                         {m}m
                       </button>
                     ))}
                   </div>
                </div>

                {/* Difficulty Selection */}
                <div>
                   <label className="block text-slate-300 text-sm font-bold mb-2 flex items-center gap-2">
                     <Gauge size={16} /> Starting Difficulty
                   </label>
                   <div className="grid grid-cols-3 gap-2">
                     {[Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD].map(d => (
                       <button
                         key={d}
                         onClick={() => setDifficulty(d)}
                         className={getDiffButtonClass(d)}
                       >
                         {d}
                       </button>
                     ))}
                   </div>
                </div>

                <button 
                   onClick={handleStartSession}
                   className={getStartButtonClass()}
                >
                   START SESSION
                </button>
                
                <div className="text-xs text-center text-slate-500 mt-4">
                   Connect houses • No crossing lines • Fill the grid
                </div>
              </div>
            ) : (
              // Just Rules
              <div className="space-y-4">
                  <div className="bg-slate-700/50 p-4 rounded text-sm leading-relaxed text-slate-200">
                    <ul className="list-disc pl-5 space-y-2">
                        <li>Connect houses with cables.</li>
                        <li>Number on house = required cables.</li>
                        <li>Max 2 cables between houses.</li>
                        <li>Lines cannot cross.</li>
                    </ul>
                  </div>
                  <button 
                    onClick={() => setShowRules(false)}
                    className="w-full py-3 bg-slate-600 hover:bg-slate-500 rounded font-bold"
                  >
                    Resume Game
                  </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Victory Modal (Intermediate) */}
      {gameState === 'VICTORY' && (
        <div className="absolute inset-0 bg-yellow-500/10 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-slate-800 text-white p-8 rounded-lg text-center shadow-2xl border-2 border-yellow-400 animate-bounce-in min-w-[300px]">
             <h2 className="text-3xl font-bold text-yellow-400 mb-2">Grid Online!</h2>
             <div className="text-green-400 font-mono mb-6">System Stable</div>
             
             <button 
               onClick={handleNextPuzzle}
               className="w-full bg-green-600 hover:bg-green-500 text-white px-8 py-4 rounded-lg font-bold text-lg flex items-center justify-center gap-2 transition shadow-lg border-b-4 border-green-800 active:border-b-0 active:translate-y-1"
             >
               Next Puzzle <Play size={20} fill="currentColor" />
             </button>
          </div>
        </div>
      )}

      {/* Session Finished Modal */}
      {gameState === 'FINISHED' && (
        <div className="absolute inset-0 bg-slate-900/90 flex items-center justify-center z-50 backdrop-blur-md">
          <div className="bg-slate-800 text-white p-8 rounded-lg text-center shadow-2xl border-4 border-slate-600 max-w-md w-full animate-fade-in">
             <Clock className="mx-auto text-slate-400 mb-4" size={64} />
             <h2 className="text-4xl font-bold text-white mb-2">SESSION COMPLETE</h2>
             <p className="text-slate-400 mb-8">Time Limit Reached</p>

             <div className="bg-slate-900 rounded-lg p-6 mb-8 border border-slate-700">
                <div className="text-5xl font-bold text-yellow-400 mb-2">{totalSolved}</div>
                <div className="text-sm text-slate-500 uppercase tracking-widest mb-6">Total Puzzles Solved</div>
                
                <div className="grid grid-cols-3 gap-2 text-sm border-t border-slate-800 pt-4">
                   <div>
                      <div className="font-bold text-green-400">{stats[Difficulty.EASY]}</div>
                      <div className="text-slate-600">Easy</div>
                   </div>
                   <div>
                      <div className="font-bold text-yellow-400">{stats[Difficulty.MEDIUM]}</div>
                      <div className="text-slate-600">Medium</div>
                   </div>
                   <div>
                      <div className="font-bold text-red-400">{stats[Difficulty.HARD]}</div>
                      <div className="text-slate-600">Hard</div>
                   </div>
                </div>
             </div>
             
             <button 
               onClick={() => setGameState('START')}
               className="w-full bg-blue-600 hover:bg-blue-500 text-white px-6 py-4 rounded-lg font-bold text-lg transition shadow-lg"
             >
               New Session
             </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;