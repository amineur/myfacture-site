"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

interface UIContextType {
  isAIAssistantOpen: boolean;
  toggleAIAssistant: () => void;
  openAIAssistant: () => void;
  closeAIAssistant: () => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: ReactNode }) {
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);

  const toggleAIAssistant = () => setIsAIAssistantOpen((prev) => !prev);
  const openAIAssistant = () => setIsAIAssistantOpen(true);
  const closeAIAssistant = () => setIsAIAssistantOpen(false);

  return (
    <UIContext.Provider
      value={{
        isAIAssistantOpen,
        toggleAIAssistant,
        openAIAssistant,
        closeAIAssistant,
      }}
    >
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error("useUI must be used within a UIProvider");
  }
  return context;
}
