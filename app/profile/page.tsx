"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Mail, Lock, User, Briefcase, Save, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
    const router = useRouter();

    const [user, setUser] = useState({
        firstName: "",
        lastName: "",
        jobTitle: "",
        email: "",
        photoUrl: null as string | null,
    });

    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [newPassword, setNewPassword] = useState("");

    useEffect(() => {
        async function loadUserData() {
            try {
                const res = await fetch('/api/profile');
                if (!res.ok) {
                    router.push('/login');
                    return;
                }
                const profile = await res.json();
                setUser({
                    firstName: profile.first_name || "",
                    lastName: profile.last_name || "",
                    jobTitle: profile.job_title || "",
                    email: profile.email || "",
                    photoUrl: profile.avatar_url || null,
                });
            } catch (error) {
                console.error('Error:', error);
            } finally {
                setLoading(false);
            }
        }
        loadUserData();
    }, []);

    const handle = (user.firstName && user.lastName)
        ? `@${user.firstName.toLowerCase()}.${user.lastName.toLowerCase()}`
        : '';

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const body: any = {
                first_name: user.firstName,
                last_name: user.lastName,
                job_title: user.jobTitle,
                email: user.email,
            };
            if (newPassword) body.newPassword = newPassword;

            const res = await fetch('/api/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                alert('Erreur lors de la sauvegarde');
            } else {
                setSaved(true);
                setIsChangingPassword(false);
                setNewPassword("");
                setTimeout(() => setSaved(false), 2000);
            }
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <main className="min-h-screen bg-gray-50 flex flex-col pb-10">
            <header className="px-6 pt-6 pb-2 bg-white sticky top-0 z-10 border-b border-gray-50">
                <div className="flex items-center gap-4 mb-2">
                    <Link href="/settings">
                        <Button variant="ghost" size="icon" className="-ml-3 h-10 w-10 rounded-full hover:bg-gray-100 text-gray-900 transition-colors">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <h1 className="text-xl font-bold tracking-tight text-gray-900">Mon Profil</h1>
                </div>
            </header>

            <div className="flex-1 px-6 pt-8 space-y-8 max-w-md mx-auto w-full">
                {/* Avatar Section */}
                <div className="flex flex-col items-center">
                    <div className="relative group cursor-pointer">
                        <div className="h-28 w-28 rounded-full bg-blue-100 border-4 border-white shadow-sm flex items-center justify-center text-3xl font-bold text-blue-600 overflow-hidden">
                            {user.photoUrl ? (
                                <img src={user.photoUrl} alt="Profil" className="h-full w-full object-cover" />
                            ) : (
                                <span>{user.firstName[0]}{user.lastName[0]}</span>
                            )}
                        </div>
                        <div className="absolute bottom-0 right-0 h-9 w-9 bg-blue-600 rounded-full border-4 border-white flex items-center justify-center shadow-sm">
                            <Camera className="h-4 w-4 text-white" />
                        </div>
                    </div>
                    <p className="mt-3 text-sm font-medium text-blue-600">Modifier la photo</p>
                    <p className="mt-1 text-sm font-bold text-gray-400">{handle}</p>
                </div>

                {/* Identity Form */}
                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide ml-1">Prénom</label>
                            <div className="relative">
                                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={user.firstName}
                                    onChange={(e) => setUser({ ...user, firstName: e.target.value })}
                                    className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide ml-1">Nom</label>
                            <div className="relative">
                                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={user.lastName}
                                    onChange={(e) => setUser({ ...user, lastName: e.target.value })}
                                    className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide ml-1">Fonction</label>
                        <div className="relative">
                            <Briefcase className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                value={user.jobTitle}
                                onChange={(e) => setUser({ ...user, jobTitle: e.target.value })}
                                className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                            />
                        </div>
                    </div>
                </div>

                <div className="h-px bg-gray-200 w-full" />

                {/* Sensitive Info */}
                <div className="space-y-5">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide ml-1">Email de connexion</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                            <input
                                type="email"
                                value={user.email}
                                onChange={(e) => setUser({ ...user, email: e.target.value })}
                                className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                            />
                        </div>
                    </div>

                    {!isChangingPassword ? (
                        <Button
                            variant="outline"
                            onClick={() => setIsChangingPassword(true)}
                            className="w-full h-12 rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900 flex items-center justify-between px-4 group"
                        >
                            <span className="flex items-center gap-2 font-medium">
                                <Lock className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
                                Modifier le mot de passe
                            </span>
                            <div className="bg-gray-100 px-2 py-0.5 rounded text-[10px] font-bold text-gray-500">Sécurisé</div>
                        </Button>
                    ) : (
                        <div className="space-y-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-900 uppercase tracking-wide ml-1">Nouveau mot de passe</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-3 h-4 w-4 text-blue-600" />
                                    <input
                                        type="password"
                                        placeholder="Min. 6 caractères"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full bg-white border border-blue-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => { setIsChangingPassword(false); setNewPassword(""); }}
                                    className="text-gray-500 hover:text-gray-900 h-8 px-3"
                                >
                                    Annuler
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="pt-6 pb-20 space-y-4">
                    <Button
                        onClick={handleSave}
                        disabled={isSaving || saved}
                        className={cn(
                            "w-full h-12 rounded-full font-bold text-base transition-all flex items-center gap-2 justify-center",
                            saved
                                ? "bg-green-600 text-white shadow-inner opacity-100"
                                : "shadow-lg shadow-blue-600/20 bg-blue-600 hover:bg-blue-700 text-white active:scale-[0.98]"
                        )}
                    >
                        {isSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : saved ? (
                            <>
                                <Check className="h-5 w-5" />
                                <span>Enregistré</span>
                            </>
                        ) : (
                            <>
                                <Save className="h-4 w-4" />
                                <span>Enregistrer les modifications</span>
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </main>
    );
}
