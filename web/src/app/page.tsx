import { Inspector } from "@/components/Inspector";

export default function Home() {
  return (
    <main style={{ padding: 24, display: "grid", gap: 16, maxWidth: 900 }}>
      <h1>QuickStep</h1>
      <p>v2 rewrite in progress. For now: open a QUICKSTEP program (v2 binary or v1 C-array text) to inspect it.</p>
      <Inspector />
    </main>
  );
}
