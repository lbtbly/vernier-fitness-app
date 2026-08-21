import { TabBar } from '@/components/TabBar';

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <main className="app-scroll">{children}</main>
      <TabBar />
    </div>
  );
}
