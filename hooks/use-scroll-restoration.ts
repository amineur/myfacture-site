"use client";

import { useLayoutEffect, useState } from "react";

/**
 * Hook to handle scroll position saving and restoration
 * @param key The unique key for localStorage (e.g., 'suppliers_scroll')
 * @param isLoading Whether the data is currently loading
 * @param data dependency array to trigger restoration (e.g. the list of items)
 */
export function useScrollRestoration(key: string, isLoading: boolean, data: any[]) {
    // Restore scroll position
    useLayoutEffect(() => {
        // Only attempt restore if not loading and we have data
        if (!isLoading && data.length > 0) {
            const savedScroll = localStorage.getItem(key);

            if (savedScroll) {
                // Synchronous scroll before paint to avoid jump
                window.scrollTo({
                    top: parseInt(savedScroll),
                    behavior: 'instant' as any
                });

                // Clear immediately
                localStorage.removeItem(key);
            }
        }
    }, [isLoading, data, key]);

    // Return a function to save scroll position
    const saveScrollPosition = () => {
        localStorage.setItem(key, window.scrollY.toString());
    };

    return { saveScrollPosition };
}
