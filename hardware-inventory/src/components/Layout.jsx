import React from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export default function Layout({ children, title }) {
    return (
        <div className="flex min-h-screen bg-background">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Navbar title={title} />
                <main className="flex-1 p-6 fade-in">
                    {children}
                </main>
            </div>
        </div>
    );
}
