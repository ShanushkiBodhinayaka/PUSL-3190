import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});
const AUTH_REQUEST_TIMEOUT_MS = 2500;
const AUTH_CACHE_KEY = 'hardwarehub.auth-cache';

function withTimeout(promise, message) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(message)), AUTH_REQUEST_TIMEOUT_MS);
        }),
    ]);
}

function readCachedAuth() {
    if (typeof window === 'undefined') return null;

    try {
        const raw = window.localStorage.getItem(AUTH_CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (_error) {
        return null;
    }
}

function writeCachedAuth(nextState) {
    if (typeof window === 'undefined') return;

    try {
        if (!nextState?.user) {
            window.localStorage.removeItem(AUTH_CACHE_KEY);
            return;
        }

        window.localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(nextState));
    } catch (_error) {
        // Ignore cache write failures so auth still works without local persistence.
    }
}

export function AuthProvider({ children }) {
    const [initialAuth] = useState(() => readCachedAuth());
    const initialProfileRef = useRef(initialAuth?.profile ?? null);
    const initialRoleRef = useRef(initialAuth?.role ?? null);
    const [user, setUser] = useState(initialAuth?.user ?? null);
    const [profile, setProfile] = useState(initialAuth?.profile ?? null);
    const [role, setRole] = useState(initialAuth?.role ?? null);
    const [loading, setLoading] = useState(!initialAuth?.user);

    // Fetch the user's profile (role) from the profiles table
    async function fetchProfile(userId) {
        const { data, error } = await withTimeout(
            supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single(),
            'Timed out while loading your profile.'
        );

        if (!error && data) {
            setProfile(data);
            setRole(data.role);
            initialProfileRef.current = data;
            initialRoleRef.current = data.role;
            writeCachedAuth({
                user: {
                    id: userId,
                    email: data.email ?? null,
                },
                profile: data,
                role: data.role,
            });
        } else {
            setProfile(null);
            setRole(null);
        }
    }

    useEffect(() => {
        let isMounted = true;

        async function bootstrapAuth() {
            try {
                const { data: { session } } = await withTimeout(
                    supabase.auth.getSession(),
                    'Timed out while restoring your session.'
                );

                if (!isMounted) return;

                setUser(session?.user ?? null);

                if (session?.user) {
                    writeCachedAuth({
                        user: {
                            id: session.user.id,
                            email: session.user.email ?? null,
                        },
                        profile: initialProfileRef.current,
                        role: initialRoleRef.current,
                    });
                    await fetchProfile(session.user.id);
                } else {
                    setProfile(null);
                    setRole(null);
                    initialProfileRef.current = null;
                    initialRoleRef.current = null;
                    writeCachedAuth(null);
                }
            } catch (_error) {
                if (!isMounted) return;

                const fallbackAuth = readCachedAuth();
                setUser(fallbackAuth?.user ?? null);
                setProfile(fallbackAuth?.profile ?? null);
                setRole(fallbackAuth?.role ?? null);
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        }

        bootstrapAuth();

        // Subscribe to auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                if (!isMounted) return;

                setUser(session?.user ?? null);

                try {
                    if (session?.user) {
                        writeCachedAuth({
                            user: {
                                id: session.user.id,
                                email: session.user.email ?? null,
                            },
                            profile: readCachedAuth()?.profile ?? null,
                            role: readCachedAuth()?.role ?? null,
                        });
                        await fetchProfile(session.user.id);
                    } else {
                        setProfile(null);
                        setRole(null);
                        initialProfileRef.current = null;
                        initialRoleRef.current = null;
                        writeCachedAuth(null);
                    }
                } catch (_error) {
                    if (!isMounted) return;

                    const fallbackAuth = readCachedAuth();
                    setUser(fallbackAuth?.user ?? null);
                    setProfile(fallbackAuth?.profile ?? null);
                    setRole(fallbackAuth?.role ?? null);
                } finally {
                    if (isMounted) {
                        setLoading(false);
                    }
                }
            }
        );

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    async function signIn(email, password) {
        const { data, error } = await withTimeout(
            supabase.auth.signInWithPassword({ email, password }),
            'Timed out while signing in.'
        );
        if (error) throw error;
        return data;
    }

    async function signOut() {
        try {
            await withTimeout(supabase.auth.signOut(), 'Timed out while signing out.');
        } finally {
            writeCachedAuth(null);
            initialProfileRef.current = null;
            initialRoleRef.current = null;
            setUser(null);
            setProfile(null);
            setRole(null);
            setLoading(false);
        }
    }

    const value = {
        user,
        profile,
        role,
        loading,
        signIn,
        signOut,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    return useContext(AuthContext);
}
