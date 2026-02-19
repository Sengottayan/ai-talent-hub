import React from 'react';

const InterviewHeader: React.FC = () => {
    return (
        <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-blue-100/50 sticky top-0 z-50">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex items-center">
                <div className="flex-shrink-0 group">
                    <div className="relative">
                        <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        <div className="relative flex items-center gap-3">
                            <img
                                src="/hricon.png"
                                alt="Talent Hub"
                                className="h-9 w-9 rounded-full object-cover border border-blue-100 shadow-sm"
                            />
                            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                                Talent Hub
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default InterviewHeader;
