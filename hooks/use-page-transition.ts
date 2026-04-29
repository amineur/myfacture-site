"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function usePageTransition() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const navigateWithTransition = (href: string, elementId?: string) => {
        // Check if View Transitions API is supported
        if (typeof document !== 'undefined' && 'startViewTransition' in document) {
            // @ts-ignore - View Transitions API
            document.startViewTransition(() => {
                startTransition(() => {
                    router.push(href);
                });
            });
        } else {
            // Fallback for browsers without View Transitions
            startTransition(() => {
                router.push(href);
            });
        }
    };

    return { navigateWithTransition, isPending };
}
