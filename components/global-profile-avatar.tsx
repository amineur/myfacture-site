"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandMenu } from "@/components/ui/command-menu";

export function GlobalProfileAvatar() {
    const pathname = usePathname();
    const [openSearch, setOpenSearch] = useState(false);

    // Hide on Settings page and Login
    if (pathname.includes("/settings") || pathname === "/login") return null;

    return (
        <>
            <div className="absolute top-0 left-0 right-0 z-40 pointer-events-none">
                <div className="max-w-md mx-auto relative w-full">
                    <div className="absolute right-6 top-6 pointer-events-auto">
                        <button
                            onClick={() => setOpenSearch(true)}
                            className="flex flex-col items-center justify-center gap-0.5 transition-all text-gray-400 hover:text-blue-600 active:scale-95"
                        >
                            <div className="p-1 rounded-xl bg-transparent transition-all hover:bg-blue-50">
                                <Search className="h-6 w-6" strokeWidth={2} />
                            </div>
                        </button>
                    </div>
                </div>
            </div>
            <CommandMenu open={openSearch} setOpen={setOpenSearch} />
        </>
    );
}
