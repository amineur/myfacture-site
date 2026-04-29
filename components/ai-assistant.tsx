'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, X, Bot, Loader2, Check, Lightbulb, MessageSquare, Plus, Trash2, Sidebar } from 'lucide-react';
import { useUI } from '@/components/providers/ui-provider';
import { createConversation, getConversations, getConversationMessages, deleteConversation } from '@/app/actions/ai-actions';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface Conversation {
    id: string;
    title: string;
    created_at: Date;
}

export default function AIAssistant({ companyHandle }: { companyHandle: string }) {
    const { isAIAssistantOpen, closeAIAssistant } = useUI();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    // Feedback mode removed (was dead code) — can be re-implemented when needed

    // History State
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Load history on open
    useEffect(() => {
        if (isAIAssistantOpen) {
            loadConversations();
        }
    }, [isAIAssistantOpen]);

    const loadConversations = async () => {
        try {
            const history = await getConversations();
            setConversations(history.map(c => ({
                ...c,
                created_at: c.created_at ? new Date(c.created_at) : new Date()
            })));
        } catch (error) {
            console.error("Failed to load history", error);
        }
    };

    const loadConversation = async (id: string) => {
        setIsLoading(true);
        setCurrentConversationId(id);
        try {
            const msgs = await getConversationMessages(id);
            setMessages(msgs.map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
                timestamp: m.created_at ? new Date(m.created_at) : new Date()
            })));
        } catch (error) {
            console.error("Failed to load messages", error);
        } finally {
            setIsLoading(false);
        }
    };

    const startNewChat = () => {
        setCurrentConversationId(null);
        setMessages([]);
        setInput('');
    };

    const handleDeleteConversation = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm("Supprimer cette conversation ?")) {
            await deleteConversation(id);
            await loadConversations();
            if (currentConversationId === id) {
                startNewChat();
            }
        }
    };

    const exampleQuestions = [
        "Combien j'ai dépensé chez TDF ce mois-ci ?",
        "Quelles factures sont en retard ?",
        "Quel est mon total à payer ?",
        "Qui est mon plus gros fournisseur ?"
    ];

    const sendMessage = async (question: string) => {
        if (!question.trim() || isLoading) return;

        const userMessage: Message = {
            role: 'user',
            content: question,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            // Include history (previous messages + current question)
            const currentHistory = [...messages, userMessage];

            const response = await fetch('/api/ai-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question,
                    companyHandle,
                    messages: currentHistory,
                    conversationId: currentConversationId
                })
            });

            const data = await response.json();

            // If a new conversation was created on the server, update our state
            if (data.conversationId && data.conversationId !== currentConversationId) {
                setCurrentConversationId(data.conversationId);
                await loadConversations(); // Refresh list to show new title
            }

            const assistantMessage: Message = {
                role: 'assistant',
                content: data.answer || data.error || 'Désolé, je n\'ai pas pu répondre.',
                timestamp: new Date()
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            const errorMessage: Message = {
                role: 'assistant',
                content: 'Une erreur est survenue. Réessayez.',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isAIAssistantOpen) return null;

    return (
        <>
            {/* Backdrop for mobile */}
            <div
                className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[90] lg:hidden"
                onClick={closeAIAssistant}
            />

            <div className="fixed bottom-[110px] left-4 right-4 md:left-auto md:right-6 md:w-[800px] h-[70vh] md:h-[650px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex z-[95] border border-gray-200 dark:border-gray-800 animate-in slide-in-from-bottom-10 fade-in duration-300 overflow-hidden">

                {/* Sidebar (History) */}
                <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} bg-gray-50 dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 transition-all duration-300 overflow-hidden flex flex-col`}>
                    <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase text-gray-500 tracking-wider">Historique</span>
                        <button onClick={() => setIsSidebarOpen(false)} className="md:hidden"><X className="w-4 h-4" /></button>
                    </div>

                    <div className="p-2 space-y-1 overflow-y-auto flex-1">
                        <button
                            onClick={startNewChat}
                            className={`w-full text-left text-sm p-3 rounded-lg flex items-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors ${!currentConversationId ? 'bg-white dark:bg-gray-800 shadow-sm ring-1 ring-gray-200 dark:ring-gray-700' : ''}`}
                        >
                            <Plus className="w-4 h-4" />
                            <span>Nouvelle discussion</span>
                        </button>

                        <div className="pt-4">
                            {conversations.map(conv => (
                                <div
                                    key={conv.id}
                                    onClick={() => loadConversation(conv.id)}
                                    className={`group relative w-full text-left text-sm p-3 rounded-lg flex items-center gap-2 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 transition-all ${currentConversationId === conv.id ? 'bg-gray-200 dark:bg-gray-800 font-medium' : 'text-gray-600 dark:text-gray-400'}`}
                                >
                                    <MessageSquare className="w-4 h-4 shrink-0" />
                                    <span className="truncate flex-1">{conv.title}</span>
                                    <button
                                        onClick={(e) => handleDeleteConversation(e, conv.id)}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-opacity"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main Chat Area */}
                <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-900">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                            >
                                <Sidebar className="w-5 h-5 text-gray-500" />
                            </button>
                            <div className="flex items-center gap-2">
                                <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Assistant</h3>
                            </div>
                        </div>
                        <button
                            onClick={closeAIAssistant}
                            className="text-gray-400 hover:text-gray-900 dark:hover:text-white p-2 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800 bg-gray-50/50 dark:bg-black/20">
                        {messages.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                                <div className="w-20 h-20 mb-6 rounded-3xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                                    <Bot className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                                </div>
                                <h4 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">Comment puis-je vous aider ?</h4>
                                <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm">
                                    Je peux analyser vos finances, vos factures et vos fournisseurs.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
                                    {exampleQuestions.map((q, i) => (
                                        <button
                                            key={i}
                                            onClick={() => sendMessage(q)}
                                            className="text-left text-sm p-4 rounded-xl bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all duration-200"
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                            >
                                <div
                                    className={`max-w-[85%] p-4 rounded-2xl ${msg.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-br-sm shadow-md'
                                        : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm shadow-sm border border-gray-100 dark:border-gray-700'
                                        }`}
                                >
                                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                </div>
                                <p className={`text-[10px] px-2 ${msg.role === 'user' ? 'text-gray-400' : 'text-gray-400'}`}>
                                    {msg.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />

                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl rounded-bl-sm shadow-sm border border-gray-100 dark:border-gray-700">
                                    <Loader2 className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                sendMessage(input);
                            }}
                            className="flex gap-2 relative"
                        >
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Posez votre question..."
                                className="flex-1 pl-4 pr-12 py-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm transition-all shadow-sm"
                                disabled={isLoading}
                            />
                            <button
                                type="submit"
                                disabled={!input.trim() || isLoading}
                                className="absolute right-2 top-2 p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:bg-gray-300"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
}
