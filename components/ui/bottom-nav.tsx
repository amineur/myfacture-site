"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CreditCard, Landmark, ClipboardList, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
    const pathname = usePathname();

    const links = [
        {
            href: "/dashboard",
            label: "Home",
            icon: Home,
        },
        {
            href: "/payments",
            label: "Règlements",
            icon: CreditCard,
        },
        {
            href: "/transactions",
            label: "Transactions",
            icon: Landmark,
        },
        {
            href: "/situations",
            label: "Situations",
            icon: ClipboardList,
        },
        {
            href: "/settings",
            label: "Menu",
            icon: Menu,
        },
    ];

    return (
        <nav className="fixed bottom-6 left-4 right-4 z-[100] max-w-md mx-auto">
            <div className="bg-white/80 dark:bg-black/80 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-3xl px-2 py-3">
                <ul className="flex justify-between items-center w-full px-2">
                    {links.map((link, index) => {
                        const isActive = pathname === link.href ||
                            (link.href === '/dashboard' && pathname === '/') ||
                            (link.href === '/situations' && pathname.startsWith('/situations'));

                        const Icon = link.icon;

                        return (
                            <li key={index} className="flex-1 flex justify-center">
                                <Link
                                    href={link.href}
                                    prefetch={true}
                                    className="flex flex-col items-center justify-center w-full h-full active:scale-95 transition-transform"
                                >
                                    <div className={cn(
                                        "p-2 rounded-2xl transition-all duration-300",
                                        isActive ? "bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm scale-110" : "bg-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                                    )}>
                                        <Icon className={cn("h-6 w-6", isActive && "fill-current")} strokeWidth={2} />
                                    </div>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </nav>
    );
}
