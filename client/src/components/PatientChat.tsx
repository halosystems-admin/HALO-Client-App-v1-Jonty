import React, { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../../shared/types';
import { Bot, Send, Sparkles } from 'lucide-react';
import { renderInlineMarkdown } from '../utils/formatting';

interface PatientChatProps {
  patientName: string;
  chatMessages: ChatMessage[];
  chatInput: string;
  onChatInputChange: (value: string) => void;
  chatLoading: boolean;
  chatLongWait?: boolean;
  onSendChat: () => void;
}

const AGENT_STATUS_STEPS = [
  'Reviewing patient context…',
  'Scanning folder documents…',
  'Analysing clinical data…',
  'Cross-referencing history…',
  'Composing response…',
];

const STARTER_QUESTIONS = [
  'Summarise recent clinical notes',
  'Any abnormal lab results?',
  'What medications are listed?',
  'Summarise the patient history',
];

export const PatientChat: React.FC<PatientChatProps> = ({
  patientName,
  chatMessages,
  chatInput,
  onChatInputChange,
  chatLoading,
  chatLongWait,
  onSendChat,
}) => {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [statusStep, setStatusStep] = useState(0);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // Cycle through status messages while loading
  useEffect(() => {
    if (chatLoading) {
      setStatusStep(0);
      statusIntervalRef.current = setInterval(() => {
        setStatusStep(prev => (prev + 1) % AGENT_STATUS_STEPS.length);
      }, 1800);
    } else {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
    }
    return () => {
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, [chatLoading]);

  const isStreamingAssistant =
    chatLoading &&
    chatMessages.length > 0 &&
    chatMessages[chatMessages.length - 1]?.role === 'assistant' &&
    !!chatMessages[chatMessages.length - 1]?.content;

  const isWaitingForFirstChunk =
    chatLoading && !isStreamingAssistant;

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3 bg-white">
        <div className="w-8 h-8 rounded-xl bg-cyan-600 flex items-center justify-center shadow-sm">
          <Bot size={16} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-800 leading-tight">Agent</p>
          <p className="text-[11px] text-slate-400">
            AI-powered assistant for{' '}
            <span className="font-medium text-slate-600">{patientName}</span>
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] text-slate-400 font-medium">Live</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-slate-50/40">
        {chatMessages.length === 0 && !chatLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center pt-8">
            <div className="w-14 h-14 bg-cyan-50 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
              <Sparkles size={24} className="text-cyan-500" />
            </div>
            <h3 className="text-base font-bold text-slate-700 mb-1">Ask the Agent</h3>
            <p className="text-sm text-slate-400 max-w-xs leading-relaxed mb-6">
              Ask anything about{' '}
              <span className="font-semibold text-slate-600">{patientName}</span>
              's files, clinical data, and history.
            </p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              {STARTER_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => {
                    onChatInputChange(q);
                    inputRef.current?.focus();
                  }}
                  className="text-xs px-3 py-2.5 bg-white hover:bg-cyan-50 text-slate-600 hover:text-cyan-700 rounded-xl transition-colors border border-slate-200 hover:border-cyan-200 text-left leading-snug"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatMessages.map((msg, idx) => {
          const isLastAssistantStreaming =
            chatLoading &&
            idx === chatMessages.length - 1 &&
            msg.role === 'assistant';
          return (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-xl bg-cyan-600 flex items-center justify-center shrink-0 mr-2.5 mt-0.5 shadow-sm">
                  <Bot size={13} className="text-white" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-cyan-600 text-white rounded-br-sm'
                    : 'bg-white text-slate-800 rounded-bl-sm border border-slate-200'
                }`}
              >
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {msg.content.split('\n').map((line, li) => (
                    <span key={li}>
                      {li > 0 && <br />}
                      {renderInlineMarkdown(line)}
                    </span>
                  ))}
                  {isLastAssistantStreaming && (
                    <span className="inline-block w-1.5 h-4 ml-0.5 bg-cyan-500 rounded-sm animate-pulse" />
                  )}
                </div>
                {!isLastAssistantStreaming && (
                  <span
                    className={`text-[10px] mt-1.5 block ${
                      msg.role === 'user' ? 'text-cyan-200' : 'text-slate-400'
                    }`}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Live status while waiting for first chunk */}
        {isWaitingForFirstChunk && (
          <div className="flex justify-start items-start gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-cyan-600 flex items-center justify-center shrink-0 shadow-sm">
              <Bot size={13} className="text-white" />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm max-w-[80%]">
              <div className="flex items-center gap-2.5">
                <div className="flex gap-1">
                  <span
                    className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce"
                    style={{ animationDelay: '160ms' }}
                  />
                  <span
                    className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce"
                    style={{ animationDelay: '320ms' }}
                  />
                </div>
                <span className="text-sm text-slate-500 italic">
                  {AGENT_STATUS_STEPS[statusStep]}
                </span>
              </div>
              {chatLongWait && (
                <p className="text-xs text-slate-400 mt-1.5">
                  Complex queries may take 15–60 seconds.
                </p>
              )}
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-100 p-3 bg-white">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={chatInput}
            onChange={e => onChatInputChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSendChat();
              }
            }}
            placeholder={`Ask about ${patientName}…`}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 outline-none transition-all placeholder:text-slate-400"
            disabled={chatLoading}
          />
          <button
            onClick={onSendChat}
            disabled={!chatInput.trim() || chatLoading}
            className="p-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl disabled:opacity-40 transition-all shadow-sm active:scale-95"
          >
            <Send size={17} />
          </button>
        </div>
      </div>
    </div>
  );
};
