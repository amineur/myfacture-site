"use client";

import { useState } from "react";
import { ArrowLeft, Plus, MoreVertical, Mail, Shield, User, Trash2, Edit2, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Mock Data
const initialMembers = [
    { id: 1, name: "Amine Benabla", role: "admin", email: "amine@example.com", status: "active", avatar: "AB" },
    { id: 2, name: "Sarah Connor", role: "editor", email: "sarah@example.com", status: "active", avatar: "SC" },
    { id: 3, name: "Marc Spector", role: "viewer", email: "marc@example.com", status: "pending", avatar: "MS" },
];

export default function TeamPage() {
    const [members, setMembers] = useState(initialMembers);

    const getRoleBadge = (role: string) => {
        switch (role) {
            case "admin": return "bg-purple-100 text-purple-700 border-purple-200";
            case "editor": return "bg-blue-100 text-blue-700 border-blue-200";
            default: return "bg-gray-100 text-gray-700 border-gray-200";
        }
    };

    const getStatusIndicator = (status: string) => {
        if (status === "active") return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
        return <div className="h-2 w-2 rounded-full bg-orange-400 animate-pulse" />;
    };

    return (
        <main className="min-h-screen bg-gray-50 pb-32">
            {/* Sticky Header */}
            <header className="sticky top-0 z-10 bg-gray-50/90 backdrop-blur-md border-b border-gray-100/50 px-6 pt-6 pb-4">
                <div className="flex items-center justify-between max-w-md mx-auto">
                    <div className="flex items-center gap-4">
                        <Link href="/settings">
                            <Button variant="ghost" size="icon" className="-ml-3 h-10 w-10 text-gray-500 hover:text-gray-900 rounded-full hover:bg-gray-100/50">
                                <ArrowLeft className="h-6 w-6" />
                            </Button>
                        </Link>
                        <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">Membres et Équipe</h1>
                    </div>
                </div>
            </header>

            <div className="max-w-md mx-auto px-6 py-6 space-y-6">

                {/* Stats / Invite Card */}
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-6 text-white shadow-xl shadow-gray-200 group relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-32 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                    <div className="relative z-10">
                        <div className="flex items-start justify-between mb-6">
                            <div>
                                <h2 className="text-2xl font-bold mb-1">Inviter</h2>
                                <p className="text-gray-400 text-sm font-medium">Gérez votre équipe</p>
                            </div>
                            <div className="bg-white/10 p-2 rounded-xl backdrop-blur-md border border-white/5">
                                <Shield className="h-6 w-6 text-blue-400" />
                            </div>
                        </div>

                        <Button className="w-full bg-white text-gray-900 font-bold hover:bg-blue-50 border-0 h-12 rounded-xl shadow-none">
                            Ajouter un membre
                        </Button>
                    </div>
                </div>

                {/* Members List */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-1">Équipe ({members.length})</h3>

                    <div className="bg-white rounded-3xl p-2 shadow-sm border border-gray-100">
                        {members.map((member, i) => (
                            <div key={member.id} className={cn(
                                "p-4 flex items-center justify-between group rounded-2xl transition-all duration-200 hover:bg-gray-50",
                                i !== members.length - 1 && "border-b border-gray-50"
                            )}>
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <div className="h-12 w-12 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-lg shadow-inner">
                                            {member.avatar}
                                        </div>
                                        <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                                            {getStatusIndicator(member.status)}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <p className="font-bold text-gray-900">{member.name}</p>
                                            <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border", getRoleBadge(member.role))}>
                                                {member.role}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-gray-400 text-xs font-medium">
                                            <Mail className="h-3 w-3" />
                                            {member.email}
                                        </div>
                                    </div>
                                </div>

                                <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-300 group-hover:text-gray-600 hover:bg-white hover:shadow-sm rounded-full transition-all">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    );
}
