"use client";
import { useState } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const [formula, setFormula] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (!input.trim()) return;
    setLoading(true);
    setFormula("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: input }),
      });
      const data = await res.json();
      setFormula(data.formula || "Error generating formula");
    } catch (err) {
      setFormula("Something went wrong. Try again.");
    }
    setLoading(false);
  }

  async function copyFormula() {
    await navigator.clipboard.writeText(formula);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const examples = [
    "Sum column B where column A is 'Saudi'",
    "Count unique values in column C",
    "Find the highest value in range D2:D100",
  ];

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-5xl font-bold mb-3 text-center">
          Excel Formula AI
        </h1>
        <p className="text-gray-600 text-center mb-10 text-lg">
          Describe what you need. Get the perfect formula instantly.
        </p>

        <div className="bg-white rounded-2xl shadow-lg p-6 border">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Example: Sum all values in column B where column A equals 'Saudi Arabia'"
            className="w-full p-4 border rounded-lg h-32 focus:outline-none focus:ring-2 focus:ring-black"
            maxLength={500}
          />
          <div className="text-xs text-gray-400 text-right mt-1">
            {input.length} / 500
          </div>

          <button
            onClick={generate}
            disabled={loading || !input.trim()}
            className="w-full mt-4 bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Generating..." : "Generate Formula"}
          </button>

          <div className="mt-4 flex flex-wrap gap-2">
            {examples.map((ex, i) => (
              <button
                key={i}
                onClick={() => setInput(ex)}
                className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full"
              >
                {ex}
              </button>
            ))}
          </div>

          {formula && (
            <div className="mt-6 p-4 bg-gray-900 text-green-400 rounded-lg font-mono relative">
              <code>{formula}</code>
              <button
                onClick={copyFormula}
                className="absolute top-2 right-2 text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          Built with Claude
        </p>
      </div>
    </main>
  );
}