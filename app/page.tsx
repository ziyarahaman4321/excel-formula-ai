"use client";
import { useState } from "react";

interface AIResponse {
  formula: string;
  explanation: string;
  steps: string[];
  alternatives: string[];
  warning: string;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [response, setResponse] = useState<AIResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    if (!input.trim()) return;
    setLoading(true);
    setError("");
    setResponse(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: input }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResponse(data);
      }
    } catch (err) {
      setError("Something went wrong. Try again.");
    }
    setLoading(false);
  }

  async function copyFormula() {
    if (!response?.formula) return;
    await navigator.clipboard.writeText(response.formula);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const examples = [
    "Sum column B where column A is 'Saudi'",
    "Lookup customer name by ID from sheet 2",
    "Remove duplicates from a list",
    "Extract unique values from column C",
  ];

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4 sm:p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-bold mb-3 text-center">
          Excel Formula AI
        </h1>
        <p className="text-gray-600 text-center mb-10 text-lg">
          Ask anything about Excel or Google Sheets.
        </p>

        <div className="bg-white rounded-2xl shadow-lg p-6 border">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Example: Sum column B where column A equals 'Saudi Arabia'... or describe any spreadsheet task."
            className="w-full p-4 border rounded-lg h-28 focus:outline-none focus:ring-2 focus:ring-black resize-none"
            maxLength={1000}
          />
          <div className="text-xs text-gray-400 text-right mt-1">
            {input.length} / 1000
          </div>

          <button
            onClick={generate}
            disabled={loading || !input.trim()}
            className="w-full mt-4 bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Thinking..." : "Get Answer"}
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

          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {response && (
            <div className="mt-6 space-y-4">
              {/* Formula */}
              {response.formula && (
                <div className="p-4 bg-gray-900 text-green-400 rounded-lg font-mono relative break-all">
                  <code>{response.formula}</code>
                  <button
                    onClick={copyFormula}
                    className="absolute top-2 right-2 text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              )}

              {/* Explanation */}
              {response.explanation && (
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
                  <p className="text-sm font-semibold text-blue-900 mb-1">
                    💡 What it does
                  </p>
                  <p className="text-sm text-blue-800">{response.explanation}</p>
                </div>
              )}

              {/* Manual Steps */}
              {response.steps && response.steps.length > 0 && (
                <div className="p-4 bg-purple-50 border border-purple-100 rounded-lg">
                  <p className="text-sm font-semibold text-purple-900 mb-2">
                    📋 How to do it
                  </p>
                  <ol className="text-sm text-purple-800 space-y-1 list-decimal list-inside">
                    {response.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Alternatives */}
              {response.alternatives && response.alternatives.length > 0 && (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-sm font-semibold text-gray-900 mb-2">
                    🔁 Other ways
                  </p>
                  <ul className="space-y-2">
                    {response.alternatives.map((alt, i) => (
                      <li
                        key={i}
                        className="text-sm font-mono bg-white p-2 rounded border break-all"
                      >
                        {alt}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warning */}
              {response.warning && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm font-semibold text-yellow-900 mb-1">
                    ⚠️ Note
                  </p>
                  <p className="text-sm text-yellow-800">{response.warning}</p>
                </div>
              )}
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