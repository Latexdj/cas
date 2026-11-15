'use client';
import { ThemeProvider } from 'next-themes';
import { DialogHost } from '@/components/ui/dialogs';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <DialogHost />
    </ThemeProvider>
  );
}
